import { Injectable, Logger, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as mqtt from 'mqtt';
import { YolinkHome } from './entities/yolink-home.entity';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/entities/alert.entity';
import { encrypt, decrypt } from '../common/crypto/encryption.util';

const YOLINK_TOKEN_URL = 'https://api.yosmart.com/open/yolink/token';
const YOLINK_API_URL  = 'https://api.yosmart.com/open/yolink/v2/api';
const MQTT_BROKER     = 'mqtt://mqtt.api.yosmart.com:8003';

const EVENT_CONFIG: Record<string, { severity: AlertSeverity; message: (d: any, name: string) => string }> = {
  'DoorSensor.Alert':        { severity: AlertSeverity.MEDIUM,   message: (d, n) => `${n}: Door/window ${d?.state === 'open' ? 'opened' : 'closed'}` },
  'DoorSensor.StatusChange': { severity: AlertSeverity.LOW,      message: (d, n) => `${n}: ${d?.state === 'open' ? 'Opened' : 'Closed'}` },
  'LeakSensor.Alert':        { severity: AlertSeverity.HIGH,     message: (_d, n) => `${n}: Water leak detected!` },
  'LeakSensor.StatusChange': { severity: AlertSeverity.HIGH,     message: (d, n) => `${n}: ${d?.state === 'alert' ? 'Water leak detected!' : 'Sensor normal'}` },
  'MotionSensor.Alert':      { severity: AlertSeverity.MEDIUM,   message: (_d, n) => `${n}: Motion detected` },
  'SmokeDetector.Alert':     { severity: AlertSeverity.CRITICAL, message: (_d, n) => `${n}: Smoke detected! Check immediately.` },
  'COAlarm.Alert':           { severity: AlertSeverity.CRITICAL, message: (_d, n) => `${n}: CO alarm triggered! Evacuate immediately.` },
  'THSensor.Alert':          { severity: AlertSeverity.LOW,      message: (d, n) => `${n}: Temp ${d?.temperature ?? '?'}°C, Humidity ${d?.humidity ?? '?'}%` },
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

  constructor(
    @InjectRepository(YolinkHome) private homesRepo: Repository<YolinkHome>,
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

  // ── MQTT connection (one per linked home) ────────────────────────────────────

  private async connectMqtt(home: YolinkHome) {
    // Re-linking an existing home (new credentials) — tear down the old session first.
    this.mqttClients.get(home.id)?.end(true);
    this.mqttClients.delete(home.id);

    try {
      const token = await this.getAccessToken(home);

      const homeData = await this.yolinkRequest(home, 'Home.getGeneralInfo');
      const yolinkHomeId: string = homeData?.id ?? homeData?.homeId ?? home.yolinkUAID;
      this.logger.log(`Yolink homeId resolved for "${home.homeName}": ${yolinkHomeId}`);
      await this.homesRepo.update(home.id, { yolinkHomeId });

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
    await this.dispatchAlert(home, payload);
  }

  private async dispatchAlert(home: YolinkHome, payload: any): Promise<void> {
    const { event, deviceId, deviceType, data } = payload;

    const config = EVENT_CONFIG[event];
    if (!config) {
      this.logger.debug(`Ignoring non-alert Yolink event: ${event}`);
      return;
    }

    const deviceName = data?.name ?? deviceType ?? 'Device';
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
  }

  // ── Manual test trigger ───────────────────────────────────────────────────────

  async simulateAlert(customerId: string, eventType: string): Promise<void> {
    const home = await this.homesRepo.findOne({ where: { customerId, isActive: true } });
    if (!home?.yolinkHomeId) {
      this.logger.warn(`simulateAlert: no linked/connected home for customer ${customerId}`);
      return;
    }
    await this.processEventByHomeId(home.yolinkHomeId, {
      event: eventType,
      deviceId: 'test-device',
      deviceType: eventType.split('.')[0],
      data: { state: 'open', name: 'Test Sensor' },
    });
  }
}
