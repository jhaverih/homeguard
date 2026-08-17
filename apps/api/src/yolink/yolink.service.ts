import { Injectable, Logger, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as mqtt from 'mqtt';
import { YolinkHome } from './entities/yolink-home.entity';
import { YolinkDevice } from './entities/yolink-device.entity';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/entities/alert.entity';
import { encrypt, decrypt } from '../common/crypto/encryption.util';

const YOLINK_TOKEN_URL = 'https://api.yosmart.com/open/yolink/token';
const YOLINK_API_URL  = 'https://api.yosmart.com/open/yolink/v2/api';
const MQTT_BROKER     = 'mqtt://mqtt.api.yosmart.com:8003';

// Yolink devices report temperature in Celsius regardless of the device's own
// display mode — convert to Fahrenheit here so alert text matches what the
// customer sees in the Yolink app itself.
const celsiusToFahrenheit = (c: number): number => Math.round((c * 9 / 5 + 32) * 10) / 10;

// The only device types the customer Monitoring dashboard shows today (see
// YolinkService.getDeviceStates) — any other Yolink device type is excluded
// entirely, not just hidden, per product decision 2026-08-17.
const MONITORED_DEVICE_TYPES = ['THSensor', 'LeakSensor'];

// A device counts as "streaming" (green, see getDeviceStates) if it's
// reported within this window — conservative default for battery-powered
// sensors that report periodically rather than continuously; tune once real
// report intervals are observed in production.
const STREAMING_WINDOW_MS = 2 * 60 * 60 * 1000;

const EVENT_CONFIG: Record<string, { severity: AlertSeverity; message: (d: any, name: string) => string }> = {
  'DoorSensor.Alert':        { severity: AlertSeverity.MEDIUM,   message: (d, n) => `${n}: Door/window ${d?.state === 'open' ? 'opened' : 'closed'}` },
  'DoorSensor.StatusChange': { severity: AlertSeverity.LOW,      message: (d, n) => `${n}: ${d?.state === 'open' ? 'Opened' : 'Closed'}` },
  'LeakSensor.Alert':        { severity: AlertSeverity.HIGH,     message: (_d, n) => `${n}: Water leak detected!` },
  'LeakSensor.StatusChange': { severity: AlertSeverity.HIGH,     message: (d, n) => `${n}: ${d?.state === 'alert' ? 'Water leak detected!' : 'Sensor normal'}` },
  'MotionSensor.Alert':      { severity: AlertSeverity.MEDIUM,   message: (_d, n) => `${n}: Motion detected` },
  'SmokeDetector.Alert':     { severity: AlertSeverity.CRITICAL, message: (_d, n) => `${n}: Smoke detected! Check immediately.` },
  'COAlarm.Alert':           { severity: AlertSeverity.CRITICAL, message: (_d, n) => `${n}: CO alarm triggered! Evacuate immediately.` },
  // Yolink's THSensor.Alert payload carries a `data.alarm` object flagging
  // exactly which threshold tripped (lowTemp/highTemp/lowHumidity/highHumidity/
  // lowBattery) — branch on that instead of always dumping both raw readings,
  // so the message states the actual reason like Yolink's own app does.
  'THSensor.Alert': {
    severity: AlertSeverity.LOW,
    message: (d, n) => {
      const alarm = d?.alarm ?? {};
      const tempF = typeof d?.temperature === 'number' ? celsiusToFahrenheit(d.temperature) : undefined;
      if (alarm.lowTemp) return `${n}: Low temperature detected (${tempF ?? '?'}°F)`;
      if (alarm.highTemp) return `${n}: High temperature detected (${tempF ?? '?'}°F)`;
      if (alarm.lowHumidity) return `${n}: Low humidity detected (${d?.humidity ?? '?'}%)`;
      if (alarm.highHumidity) return `${n}: High humidity detected (${d?.humidity ?? '?'}%)`;
      if (alarm.lowBattery) return `${n}: Low battery`;
      return `${n}: Temp ${tempF ?? '?'}°F, Humidity ${d?.humidity ?? '?'}%`;
    },
  },
  'VibrationSensor.Alert':   { severity: AlertSeverity.MEDIUM,   message: (_d, n) => `${n}: Vibration detected` },
  'Siren.Alert':             { severity: AlertSeverity.HIGH,     message: (_d, n) => `${n}: Siren activated` },
};

interface TokenEntry { token: string; expiry: number }

@Injectable()
export class YolinkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YolinkService.name);
  // Every Yolink credential is a specific customer's own account — there is no
  // shared/global account, so both the OAuth token cache and the MQTT
  // connections are keyed per-home (by YolinkHome.id) instead of being single
  // instance fields.
  private tokenCache = new Map<string, TokenEntry>();
  private mqttClients = new Map<string, mqtt.MqttClient>();
  // Live MQTT event payloads carry no device name/type — only deviceId — so
  // alert text needs the customer's own device labels (e.g. "2nd Floor")
  // fetched separately via Home.getDeviceList. Keyed by home.id, then deviceId.
  private deviceNameCache = new Map<string, Map<string, string>>();
  // The MQTT client authenticates with a snapshot of the OAuth token at connect
  // time and never re-authenticates on its own — once that token expires
  // (~2h), a stale-token reconnect fails silently. This timer proactively
  // reconnects with a fresh token before that happens, per home.
  private refreshTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(YolinkHome) private homesRepo: Repository<YolinkHome>,
    @InjectRepository(YolinkDevice) private devicesRepo: Repository<YolinkDevice>,
    private alertsService: AlertsService,
  ) {}

  async onModuleInit() {
    const homes = await this.homesRepo.find({ where: { isActive: true } });
    if (homes.length === 0) {
      this.logger.log('No linked Yolink homes yet — nothing to connect at startup.');
      return;
    }
    for (const home of homes) {
      if (!home.yolinkSecretKey) {
        this.logger.warn(`Home "${home.homeName}" (${home.id}) has no secret key on file — skipping (was linked before per-home credentials were required; re-link it).`);
        continue;
      }
      await this.connectMqtt(home);
    }
  }

  onModuleDestroy() {
    for (const client of this.mqttClients.values()) client.end();
    for (const timer of this.refreshTimers.values()) clearTimeout(timer);
  }

  // ── Token management (per home) ──────────────────────────────────────────────

  private async getAccessToken(home: Pick<YolinkHome, 'id' | 'yolinkUAID' | 'yolinkSecretKey'>): Promise<string> {
    const cached = this.tokenCache.get(home.id);
    if (cached && Date.now() < cached.expiry) return cached.token;

    if (!home.yolinkSecretKey) throw new BadRequestException('This home has no Yolink secret key on file');
    const secret = decrypt(home.yolinkSecretKey);

    const res = await axios.post<any>(
      YOLINK_TOKEN_URL,
      `grant_type=client_credentials&client_id=${home.yolinkUAID}&client_secret=${secret}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const entry: TokenEntry = {
      token: res.data.access_token,
      expiry: Date.now() + (res.data.expires_in - 60) * 1000,
    };
    this.tokenCache.set(home.id, entry);
    return entry.token;
  }

  private async yolinkRequest(home: Pick<YolinkHome, 'id' | 'yolinkUAID' | 'yolinkSecretKey'>, method: string, params?: any): Promise<any> {
    const token = await this.getAccessToken(home);
    const res = await axios.post<any>(YOLINK_API_URL, { method, params }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.data.code !== '000000') throw new Error(`Yolink API error: ${res.data.desc}`);
    return res.data.data;
  }

  // ── Device name cache (per home) ─────────────────────────────────────────────

  private cacheDeviceNames(homeId: string, devices: any[]): void {
    const map = new Map<string, string>();
    for (const dev of devices) {
      if (dev?.deviceId && dev?.name) map.set(dev.deviceId, dev.name);
    }
    this.deviceNameCache.set(homeId, map);
  }

  private async refreshDeviceNames(home: Pick<YolinkHome, 'id' | 'homeName' | 'yolinkUAID' | 'yolinkSecretKey'>, yolinkHomeId: string): Promise<void> {
    try {
      const deviceData = await this.yolinkRequest(home, 'Home.getDeviceList', { homeId: yolinkHomeId });
      const devices = deviceData?.devices ?? [];
      this.cacheDeviceNames(home.id, devices);
      await this.upsertDeviceCatalog(home.id, devices);
    } catch (err: any) {
      // Non-fatal — alert messages just fall back to the device type/generic
      // label until the next successful refresh (e.g. on the next reconnect).
      this.logger.warn(`Could not refresh Yolink device names for "${home.homeName}": ${err.message}`);
    }
  }

  // ── Monitoring dashboard: device catalog + live state ───────────────────────
  // Keeps a YolinkDevice row per physical device (deviceType/name from
  // Home.getDeviceList, which discarded these before — see refreshDeviceNames/
  // linkHomeToCustomer call sites) live via two independent paths: every MQTT
  // message (upsertDeviceState, alert-worthy or not) and a best-effort REST
  // reseed on Monitoring-tab load (refreshDeviceStates).

  private async upsertDeviceCatalog(yolinkHomeDbId: string, devices: any[]): Promise<void> {
    for (const dev of devices) {
      if (!dev?.deviceId) continue;
      const existing = await this.devicesRepo.findOne({ where: { yolinkHomeId: yolinkHomeDbId, deviceId: dev.deviceId } });
      if (existing) {
        existing.name = dev.name ?? existing.name;
        existing.deviceType = dev.type ?? existing.deviceType;
        await this.devicesRepo.save(existing);
      } else {
        await this.devicesRepo.save(this.devicesRepo.create({
          yolinkHomeId: yolinkHomeDbId,
          deviceId: dev.deviceId,
          deviceType: dev.type ?? 'Unknown',
          name: dev.name ?? dev.deviceId,
        }));
      }
    }
  }

  // Called for every MQTT message (report or alert), before the EVENT_CONFIG
  // alert-matching gate — this is the piece that was completely missing:
  // routine reports used to be silently dropped instead of updating a live
  // "last seen" state.
  private async upsertDeviceState(home: YolinkHome, payload: any): Promise<void> {
    const { deviceId, deviceType, data } = payload;
    if (!deviceId) return;
    const existing = await this.devicesRepo.findOne({ where: { yolinkHomeId: home.id, deviceId } });
    if (existing) {
      existing.lastReportedAt = new Date();
      existing.lastState = data ?? null;
      if (deviceType) existing.deviceType = deviceType;
      await this.devicesRepo.save(existing);
    } else if (deviceType) {
      // Seen via MQTT before any Home.getDeviceList catalog refresh ran — a
      // minimal row so the live state isn't lost; name backfills on the next
      // refreshDeviceNames/refreshDeviceStates call.
      await this.devicesRepo.save(this.devicesRepo.create({
        yolinkHomeId: home.id, deviceId, deviceType, name: deviceType,
        lastReportedAt: new Date(), lastState: data ?? null,
      }));
    }
  }

  // Best-effort REST reseed, called once per linked home when the customer's
  // Monitoring tab loads (and on pull-to-refresh) — so a freshly-linked or
  // infrequently-reporting device shows real state immediately instead of
  // waiting on the next MQTT report. The exact shape of Yolink's device-list
  // `state`/`online` fields isn't confirmed from a real payload yet — this
  // folds in whatever's present defensively and never regresses a more
  // recent MQTT-driven lastReportedAt.
  async refreshDeviceStates(yolinkHomeDbId: string): Promise<void> {
    const home = await this.homesRepo.findOne({ where: { id: yolinkHomeDbId, isActive: true } });
    if (!home?.yolinkHomeId) return;
    try {
      const deviceData = await this.yolinkRequest(home, 'Home.getDeviceList', { homeId: home.yolinkHomeId });
      const devices = deviceData?.devices ?? [];
      await this.upsertDeviceCatalog(home.id, devices);
      for (const dev of devices) {
        if (!dev?.deviceId || (dev.state === undefined && dev.online === undefined)) continue;
        const existing = await this.devicesRepo.findOne({ where: { yolinkHomeId: home.id, deviceId: dev.deviceId } });
        if (!existing) continue;
        if (dev.state !== undefined) {
          existing.lastState = { ...(existing.lastState ?? {}), ...(typeof dev.state === 'object' ? dev.state : { state: dev.state }) };
        }
        if (dev.online === true) existing.lastReportedAt = new Date();
        await this.devicesRepo.save(existing);
      }
    } catch (err: any) {
      this.logger.warn(`Could not refresh Yolink device states for home ${home.id}: ${err.message}`);
    }
  }

  private formatReading(deviceType: string, state: Record<string, any> | null): string | null {
    if (!state) return null;
    if (deviceType === 'THSensor') {
      return typeof state.temperature === 'number' ? `${celsiusToFahrenheit(state.temperature)}°F` : null;
    }
    if (deviceType === 'LeakSensor') {
      // Leak-state field convention isn't confirmed from a real payload —
      // LeakSensor.StatusChange events use `state.state === 'alert'` (see
      // EVENT_CONFIG above); treated as the leak-detected signal here too,
      // with a `leak` boolean as a fallback in case Yolink's report shape
      // differs from its alert shape.
      if (state.state === 'alert' || state.leak === true) return 'Leak Detected';
      if (state.state !== undefined || state.leak !== undefined) return 'Dry';
      return null;
    }
    return null;
  }

  // Customer-facing: the Monitoring tab's "Home Sensors" section. Reseeds via
  // REST first (see refreshDeviceStates), then reads the persisted catalog —
  // filtered to only the device types the dashboard shows at all.
  async getDeviceStates(customerId: string): Promise<{
    id: string; deviceType: string; name: string; isStreaming: boolean; lastReportedAt: Date | null; reading: string | null;
  }[]> {
    const homes = await this.homesRepo.find({ where: { customerId, isActive: true } });
    const results: { id: string; deviceType: string; name: string; isStreaming: boolean; lastReportedAt: Date | null; reading: string | null }[] = [];
    for (const home of homes) {
      await this.refreshDeviceStates(home.id).catch(() => {});
      const devices = await this.devicesRepo.find({ where: { yolinkHomeId: home.id } });
      for (const dev of devices) {
        if (!MONITORED_DEVICE_TYPES.includes(dev.deviceType)) continue;
        const isStreaming = !!dev.lastReportedAt && Date.now() - new Date(dev.lastReportedAt).getTime() < STREAMING_WINDOW_MS;
        results.push({
          id: dev.id,
          deviceType: dev.deviceType,
          name: dev.name,
          isStreaming,
          lastReportedAt: dev.lastReportedAt,
          reading: this.formatReading(dev.deviceType, dev.lastState),
        });
      }
    }
    return results;
  }

  // ── MQTT connection (one per linked home) ────────────────────────────────────

  private async connectMqtt(home: YolinkHome) {
    // Re-linking an existing home (new credentials) or refreshing an expiring
    // token — tear down the old session and any pending refresh first.
    this.mqttClients.get(home.id)?.end(true);
    this.mqttClients.delete(home.id);
    clearTimeout(this.refreshTimers.get(home.id));
    this.refreshTimers.delete(home.id);

    try {
      const token = await this.getAccessToken(home);
      this.scheduleTokenRefresh(home);

      const homeData = await this.yolinkRequest(home, 'Home.getGeneralInfo');
      const yolinkHomeId: string = homeData?.id ?? homeData?.homeId ?? home.yolinkUAID;
      this.logger.log(`Yolink homeId resolved for "${home.homeName}": ${yolinkHomeId}`);
      await this.homesRepo.update(home.id, { yolinkHomeId });
      await this.refreshDeviceNames(home, yolinkHomeId);

      const topic = `yl-home/${yolinkHomeId}/+/report`;

      const client = mqtt.connect(MQTT_BROKER, {
        username: token,
        password: '',
        clientId: `houmi-${home.id}-${Date.now()}`,
        clean: true,
        keepalive: 30,
        reconnectPeriod: 5000,
      });

      client.on('connect', () => {
        this.logger.log(`Yolink MQTT connected for "${home.homeName}" — subscribing to ${topic}`);
        client.subscribe(topic, (err) => {
          if (err) this.logger.error(`MQTT subscribe error for "${home.homeName}"`, err);
          else this.logger.log(`Yolink MQTT subscribed for "${home.homeName}" — listening for sensor events`);
        });
      });

      client.on('message', (msgTopic, raw) => {
        try {
          const payload = JSON.parse(raw.toString());
          const topicHomeId = msgTopic.split('/')[1] ?? yolinkHomeId;
          this.processEventByHomeId(topicHomeId, payload).catch((e) =>
            this.logger.error(`Error processing Yolink event for "${home.homeName}"`, e),
          );
        } catch {
          this.logger.warn(`Could not parse Yolink MQTT message for "${home.homeName}"`);
        }
      });

      client.on('error', (err) => this.logger.error(`Yolink MQTT error for "${home.homeName}"`, err.message));
      client.on('reconnect', () => this.logger.log(`Yolink MQTT reconnecting for "${home.homeName}"…`));
      client.on('close', () => this.logger.warn(`Yolink MQTT connection closed for "${home.homeName}"`));

      this.mqttClients.set(home.id, client);
    } catch (err: any) {
      this.logger.error(`Failed to start Yolink MQTT connection for "${home.homeName}"`, err.message);
      throw err;
    }
  }

  private scheduleTokenRefresh(home: YolinkHome) {
    const entry = this.tokenCache.get(home.id);
    if (!entry) return;
    // Reconnect ~5 minutes before the cached token expires, using a fresh
    // token — connectMqtt() already tears down the old client first, so this
    // is the same re-link mechanism, just self-triggered on a timer.
    const delay = Math.max(entry.expiry - Date.now() - 5 * 60 * 1000, 60 * 1000);
    this.logger.log(`Yolink token refresh scheduled for "${home.homeName}" in ${Math.round(delay / 60000)} min`);
    const timer = setTimeout(() => {
      this.logger.log(`Refreshing Yolink token and reconnecting MQTT for "${home.homeName}"`);
      this.connectMqtt(home).catch((e) =>
        this.logger.error(`Scheduled Yolink token refresh failed for "${home.homeName}"`, e.message),
      );
    }, delay);
    this.refreshTimers.set(home.id, timer);
  }

  // ── Webhook fallback (Yolink cloud can also push via HTTP) ──────────────────
  // Best-effort: MQTT is the primary, confirmed-working path. The webhook
  // payload's own homeId (if present) is used to route it the same way the
  // MQTT path does; if Yolink ever sends a shape without it, this can't
  // resolve which customer it belongs to (there's no more single global
  // account to fall back to) and the event is dropped with a warning.
  async handleWebhook(payload: any): Promise<void> {
    const homeId = payload?.homeId ?? payload?.data?.homeId;
    if (!homeId) {
      this.logger.warn('Yolink webhook payload had no homeId — cannot route to a customer, dropping');
      return;
    }
    await this.processEventByHomeId(homeId, payload);
  }

  // ── Event processing ─────────────────────────────────────────────────────────

  async processEventByHomeId(homeId: string, payload: any): Promise<void> {
    const home = await this.homesRepo.findOne({ where: { yolinkHomeId: homeId, isActive: true } });
    if (!home) {
      this.logger.warn(`No customer linked to Yolink homeId: ${homeId}`);
      return;
    }
    // Runs for every message — report or alert — before the alert-matching
    // gate below, so routine reports keep the Monitoring dashboard's live
    // state fresh instead of being silently dropped.
    await this.upsertDeviceState(home, payload).catch((e) =>
      this.logger.warn(`Could not update live device state for home ${home.id}: ${e.message}`),
    );
    await this.dispatchAlert(home, payload);
  }

  private async dispatchAlert(home: YolinkHome, payload: any): Promise<void> {
    const { event, deviceId, deviceType, data } = payload;

    const config = EVENT_CONFIG[event];
    if (!config) {
      this.logger.debug(`Ignoring non-alert Yolink event: ${event}`);
      return;
    }

    // Live report/alert payloads carry no device name — only deviceId — so the
    // customer's own label (e.g. "2nd Floor") has to come from the cache
    // populated via Home.getDeviceList, not the event itself.
    const deviceName = this.deviceNameCache.get(home.id)?.get(deviceId) ?? data?.name ?? deviceType ?? 'Device';
    const message = config.message(data, deviceName);

    await this.alertsService.createAlert({
      customerId: home.customerId,
      yolinkHomeId: home.id,
      deviceId,
      deviceName,
      deviceType,
      event,
      severity: config.severity,
      message,
      rawPayload: payload,
    });

    this.logger.log(`Alert created for customer ${home.customerId}: [${config.severity}] ${message}`);
  }

  // ── Linked home management ────────────────────────────────────────────────────

  /**
   * Validates the credentials against Yolink's own API before saving anything,
   * then (re)opens the MQTT connection immediately — no restart required.
   * Returns the saved home plus the device list, so the caller (the vendor's
   * "Connect Home Monitoring" screen) can show an immediate confirmation.
   */
  async linkHomeToCustomer(
    customerId: string,
    yolinkUAID: string,
    yolinkSecretKeyPlain: string,
    homeName: string,
    address?: string,
  ): Promise<{ home: YolinkHome; devices: any[] }> {
    const probe = { id: 'probe', yolinkUAID, yolinkSecretKey: encrypt(yolinkSecretKeyPlain) };
    let homeInfo: any;
    try {
      homeInfo = await this.yolinkRequest(probe, 'Home.getGeneralInfo');
    } catch (err: any) {
      this.tokenCache.delete('probe');
      throw new BadRequestException('Could not verify these Yolink credentials — double-check the UAID and Secret Key.');
    }
    const yolinkHomeId: string = homeInfo?.id ?? homeInfo?.homeId;
    let devices: any[] = [];
    try {
      const deviceData = await this.yolinkRequest(probe, 'Home.getDeviceList', { homeId: yolinkHomeId });
      devices = deviceData?.devices ?? [];
    } catch {
      // Non-fatal — credentials are valid (we already got a token + home info); device
      // listing failing shouldn't block linking.
    }
    this.tokenCache.delete('probe');

    const existing = await this.homesRepo.findOne({ where: { customerId } });
    const encryptedSecret = encrypt(yolinkSecretKeyPlain);
    let saved: YolinkHome;
    if (existing) {
      existing.yolinkUAID = yolinkUAID;
      existing.yolinkSecretKey = encryptedSecret;
      existing.yolinkHomeId = yolinkHomeId;
      existing.homeName = homeName;
      existing.isActive = true;
      if (address) existing.address = address;
      saved = await this.homesRepo.save(existing);
    } else {
      saved = await this.homesRepo.save(this.homesRepo.create({
        customerId, yolinkUAID, yolinkSecretKey: encryptedSecret, yolinkHomeId, homeName, address,
      }));
    }

    // Seed the name cache and device catalog immediately from the list
    // already fetched above — connectMqtt() below refreshes both too, but
    // there's no reason to make the customer wait on a second network
    // round-trip for names/catalog rows to appear.
    this.cacheDeviceNames(saved.id, devices);
    await this.upsertDeviceCatalog(saved.id, devices);
    await this.connectMqtt(saved);
    return { home: saved, devices };
  }

  async getLinkedHomes(customerId?: string): Promise<YolinkHome[]> {
    const where: any = { isActive: true };
    if (customerId) where.customerId = customerId;
    return this.homesRepo.find({ where, relations: ['customer'], order: { createdAt: 'DESC' } });
  }

  async unlinkHome(homeId: string): Promise<void> {
    await this.homesRepo.update(homeId, { isActive: false });
    this.mqttClients.get(homeId)?.end(true);
    this.mqttClients.delete(homeId);
    this.tokenCache.delete(homeId);
    this.deviceNameCache.delete(homeId);
    clearTimeout(this.refreshTimers.get(homeId));
    this.refreshTimers.delete(homeId);
  }

  // ── Manual test trigger ───────────────────────────────────────────────────────

  async simulateAlert(customerId: string, eventType: string): Promise<void> {
    const home = await this.homesRepo.findOne({ where: { customerId, isActive: true } });
    if (!home?.yolinkHomeId) {
      this.logger.warn(`simulateAlert: no linked/connected home for customer ${customerId}`);
      return;
    }
    const deviceType = eventType.split('.')[0];
    const data: any = { state: 'open', name: 'Test Sensor' };
    if (deviceType === 'THSensor') {
      // Exercise the alarm-flag branching in EVENT_CONFIG — 15°C ≈ 59°F, a
      // plausible "low temperature" reading rather than an arbitrary number.
      data.temperature = 15;
      data.humidity = 45;
      data.alarm = { lowTemp: true, highTemp: false, lowHumidity: false, highHumidity: false, lowBattery: false, period: false };
    }
    await this.processEventByHomeId(home.yolinkHomeId, {
      event: eventType,
      deviceId: 'test-device',
      deviceType,
      data,
    });
  }
}
