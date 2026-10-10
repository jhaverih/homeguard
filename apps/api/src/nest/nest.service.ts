import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { NestAccount } from './entities/nest-account.entity';
import { NestThermostat } from './entities/nest-thermostat.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { DeviceRegistryService } from '../iot-analytics/device-registry.service';
import { TelemetryService } from '../iot-analytics/telemetry.service';
import { AnalyticsEngineService } from '../iot-analytics/analytics-engine.service';
import { PerformanceEngineService } from '../iot-analytics/performance-engine.service';
import { CoolingRulesService } from '../iot-analytics/cooling-rules.service';
import { ThresholdsService } from '../iot-analytics/thresholds.service';
import { IotAnalyticsMigrationService } from '../iot-analytics/iot-analytics-migration.service';
import { FixedAssignmentSpec } from '../iot-analytics/classification.service';
import { SensorAssignment } from '../iot-analytics/entities/sensor-assignment.entity';
import { EquipmentType, MeasurementType, SensorRole } from '../common/enums/sensor-role.enum';
import { encrypt, decrypt } from '../common/crypto/encryption.util';
import { NestAuthorizationRevokedError, NestConfig, PubsubClient, SdmClient, nestConfigFromEnv } from './nest-google.clients';
import { signOAuthState, verifyOAuthState } from './nest-oauth-state';
import {
  NestReadingKind, NestTraits, SdmDevice, TRAIT, hvacStatus, describeSetpoint, isThermostat,
  mergeTraits, readingsFor, sdmDeviceId, thermostatIdentity,
} from './nest-traits';

export const NEST_PROVIDER = 'nest';
export const NEST_DEVICE_TYPE = 'NestThermostat';

// Each thermostat reading kind → its own DeviceRegistry row + fixed sensor
// role. A home with one air handler and two zone thermostats (1st/2nd
// floor) puts both thermostats' call state, setpoint and humidity on the
// SAME HVAC-01 equipment — the one the YoLink drain-pan sensor is already
// on — so run cycles are measured for the system as a whole (see
// run-cycles.ts). Indoor temperature joins the home's other indoor
// sensors on HOME-01, exactly like the YoLink indoor sensor.
export const CHANNEL_SPECS: Record<NestReadingKind, FixedAssignmentSpec> = {
  temperature: { sensorRole: SensorRole.INDOOR_AMBIENT_TEMP, analyticsRole: 'INDOOR_CLIMATE', measurementType: MeasurementType.TEMPERATURE, equipmentType: EquipmentType.HOME, equipmentNumber: '01' },
  humidity: { sensorRole: SensorRole.INDOOR_AMBIENT_HUMIDITY, analyticsRole: 'INDOOR_HUMIDITY', measurementType: MeasurementType.HUMIDITY, equipmentType: EquipmentType.HVAC, equipmentNumber: '01' },
  hvac: { sensorRole: SensorRole.HVAC_STATE, analyticsRole: 'HVAC_CALL_STATE', measurementType: MeasurementType.HVAC_STATE, equipmentType: EquipmentType.HVAC, equipmentNumber: '01' },
  setpoint: { sensorRole: SensorRole.HVAC_THERMOSTAT_SETPOINT, analyticsRole: 'HVAC_SETPOINT', measurementType: MeasurementType.THERMOSTAT_SETPOINT, equipmentType: EquipmentType.HVAC, equipmentNumber: '01' },
};

// The thermostat's own zone assignment overrides the default HVAC-01 (see
// NestThermostat.equipmentNumber). Indoor temperature always joins HOME-01.
export function channelSpec(kind: NestReadingKind, equipmentNumber: string): FixedAssignmentSpec {
  const spec = CHANNEL_SPECS[kind];
  return spec.equipmentType === EquipmentType.HVAC ? { ...spec, equipmentNumber } : spec;
}

const CHANNEL_KINDS: NestReadingKind[] = ['temperature', 'humidity', 'hvac', 'setpoint'];

const PULL_IDLE_DELAY_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class NestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NestService.name);
  private readonly config: NestConfig | null = nestConfigFromEnv();
  private readonly sdm: SdmClient | null = this.config ? new SdmClient(this.config) : null;
  private accessTokens = new Map<string, { token: string; expiry: number }>();
  // Per-thermostat serialization — a Pub/Sub event and the 5-minute poll
  // landing together must not both read the old trait state and each
  // record the same HEATING→OFF transition.
  private thermostatLocks = new Map<string, Promise<void>>();
  // Repeated identical failures are logged once (plus the recovery), not on
  // every retry — the YoLink MQTT outage wrote ~100k identical lines.
  private lastFailure = new Map<string, string>();
  private stopped = false;
  private pullLoop: Promise<void> | null = null;

  constructor(
    @InjectRepository(NestAccount) private accountsRepo: Repository<NestAccount>,
    @InjectRepository(NestThermostat) private thermostatsRepo: Repository<NestThermostat>,
    @InjectRepository(YolinkHome) private yolinkHomesRepo: Repository<YolinkHome>,
    private configService: ConfigService,
    private deviceRegistryService: DeviceRegistryService,
    private telemetryService: TelemetryService,
    private analyticsEngineService: AnalyticsEngineService,
    private performanceEngineService: PerformanceEngineService,
    private iotAnalyticsMigrationService: IotAnalyticsMigrationService,
    private coolingRulesService: CoolingRulesService,
    private thresholdsService: ThresholdsService,
  ) {}

  onModuleInit() {
    if (!this.config) {
      this.logger.log('Nest integration not configured (NEST_CLIENT_ID / NEST_CLIENT_SECRET / NEST_PROJECT_ID unset) — skipping.');
      return;
    }
    // Not awaited: Google being slow/unreachable must never hold up startup.
    this.syncAllAccounts().catch(() => {});
    if (this.config.pubsubSubscription && this.config.pubsubServiceAccountKey) {
      const pubsub = new PubsubClient(this.config.pubsubSubscription, this.config.pubsubServiceAccountKey);
      this.pullLoop = this.runPullLoop(pubsub);
      this.logger.log(`Nest real-time events: pulling from ${this.config.pubsubSubscription}`);
    } else if (this.config.pubsubSubscription || process.env.NEST_PUBSUB_SA_KEY_BASE64) {
      this.logger.warn('Nest real-time events disabled — NEST_PUBSUB_SUBSCRIPTION and a valid NEST_PUBSUB_SA_KEY_BASE64 are both required. Falling back to the 5-minute poll.');
    } else {
      this.logger.log('Nest real-time events not configured — using the 5-minute poll only.');
    }
  }

  onModuleDestroy() {
    this.stopped = true;
  }

  status() {
    return {
      configured: !!this.config,
      realtimeEvents: !!(this.config?.pubsubSubscription && this.config?.pubsubServiceAccountKey),
      redirectUri: this.config?.redirectUri ?? null,
    };
  }

  // ── OAuth consent flow ────────────────────────────────────────────────────

  async startAuthorization(customerId: string): Promise<{ url: string }> {
    const sdm = this.requireSdm();
    await this.requireYolinkHome(customerId);
    return { url: sdm.authorizeUrl(signOAuthState(customerId, this.stateSecret())) };
  }

  async completeAuthorization(code: string, state: string): Promise<{ thermostats: number }> {
    const sdm = this.requireSdm();
    const customerId = verifyOAuthState(state, this.stateSecret());
    if (!customerId) throw new BadRequestException('This Nest connection link has expired or is invalid — start again from the admin portal.');
    const yolinkHome = await this.requireYolinkHome(customerId);
    const homeId = await this.iotAnalyticsMigrationService.ensureHomeId(yolinkHome);

    const tokens = await sdm.exchangeCode(code);
    let account = await this.accountsRepo.findOne({ where: { customerId } });
    if (!account) account = this.accountsRepo.create({ customerId });
    Object.assign(account, { homeId, refreshToken: encrypt(tokens.refreshToken), isActive: true, lastError: null });
    account = await this.accountsRepo.save(account);
    this.accessTokens.set(account.id, { token: tokens.accessToken, expiry: Date.now() + (tokens.expiresIn - 60) * 1000 });

    // SDM only starts publishing a newly authorized account's events after
    // its first devices.list call — so this sync is required, not just nice.
    const thermostats = await this.syncAccount(account);
    this.logger.log(`Nest connected for customer ${customerId} — ${thermostats} thermostat(s)`);
    return { thermostats };
  }

  async disconnect(accountId: string): Promise<void> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Nest account not found');
    if (account.refreshToken && this.sdm) {
      await this.sdm.revoke(decrypt(account.refreshToken)).catch((e) =>
        this.logger.warn(`Could not revoke Google token for Nest account ${account.id}: ${e.message}`));
    }
    account.isActive = false;
    account.refreshToken = '';
    await this.accountsRepo.save(account);
    this.accessTokens.delete(account.id);
  }

  async listAccounts() {
    const accounts = await this.accountsRepo.find({ order: { createdAt: 'ASC' } });
    return Promise.all(accounts.map(async (a) => {
      const thermostats = await this.thermostatsRepo.find({ where: { nestAccountId: a.id }, order: { displayName: 'ASC' } });
      return {
        id: a.id, customerId: a.customerId, isActive: a.isActive, lastSyncAt: a.lastSyncAt, lastEventAt: a.lastEventAt, lastError: a.lastError,
        thermostats: thermostats.map((t) => this.thermostatSummary(t)),
        systems: await this.systemsFor(a.homeId, thermostats),
      };
    }));
  }

  private async systemsFor(homeId: string, thermostats: NestThermostat[]) {
    const numbers = [...new Set(thermostats.map((t) => t.equipmentNumber))].sort();
    return Promise.all(numbers.map(async (n) => {
      const metadata = await this.deviceRegistryService.equipmentMetadata(homeId, `HVAC-${n}`);
      return { equipmentCode: `HVAC-${n}`, zones: thermostats.filter((t) => t.equipmentNumber === n).length, verified: metadata?.verified === true, hvacConfiguration: metadata?.hvacConfiguration ?? null };
    }));
  }

  private thermostatSummary(t: NestThermostat) {
    const tempC = t.traits?.[TRAIT.TEMPERATURE]?.ambientTemperatureCelsius;
    return {
      id: t.id, displayName: t.displayName, roomName: t.roomName, lastEventAt: t.lastEventAt, equipmentNumber: t.equipmentNumber,
      fanTimer: t.traits?.['sdm.devices.traits.Fan']?.timerMode ?? null,
      online: t.traits?.[TRAIT.CONNECTIVITY]?.status !== 'OFFLINE',
      temperatureF: typeof tempC === 'number' ? Math.round((tempC * 9 / 5 + 32) * 10) / 10 : null,
      humidity: t.traits?.[TRAIT.HUMIDITY]?.ambientHumidityPercent ?? null,
      hvacStatus: hvacStatus(t.traits),
      setpoint: describeSetpoint(t.traits)?.value ?? null,
    };
  }

  // ── Poll (backup for Pub/Sub, and the only source when it's not set up) ──

  @Cron('0 */5 * * * *')
  async syncAllAccounts(): Promise<void> {
    if (!this.config) return;
    const accounts = await this.accountsRepo.find({ where: { isActive: true } });
    for (const account of accounts) await this.syncAccount(account).catch(() => {}); // logged inside
  }

  async syncAccountById(accountId: string): Promise<{ thermostats: number }> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId, isActive: true } });
    if (!account) throw new NotFoundException('Active Nest account not found');
    return { thermostats: await this.syncAccount(account) };
  }

  private async syncAccount(account: NestAccount): Promise<number> {
    const key = `sync:${account.id}`;
    try {
      const devices = (await this.sdm!.listDevices(await this.accessToken(account))).filter(isThermostat);
      for (const device of devices) {
        const thermostat = await this.upsertThermostat(account, device);
        const retrievedAt = new Date();
        await this.ingest(account, thermostat, device.traits ?? {}, retrievedAt, retrievedAt);
      }
      account.lastSyncAt = new Date();
      account.lastError = null;
      await this.accountsRepo.save(account);
      await this.reportIntegrationHealth(account, null);
      this.recordRecovery(key, `Nest sync for account ${account.id} recovered`);
      return devices.length;
    } catch (err: any) {
      const message = err instanceof NestAuthorizationRevokedError ? err.message : `Nest sync failed: ${err.response?.data?.error?.message ?? err.message}`;
      if (account.lastError !== message) { account.lastError = message; await this.accountsRepo.save(account).catch(() => {}); }
      await this.reportIntegrationHealth(account, message).catch(() => {});
      this.recordFailure(key, `${message} (account ${account.id})`);
      throw err;
    }
  }

  private async upsertThermostat(account: NestAccount, device: SdmDevice): Promise<NestThermostat> {
    const { displayName, roomName } = thermostatIdentity(device);
    let thermostat = await this.thermostatsRepo.findOne({ where: { sdmDeviceName: device.name } });
    if (!thermostat) {
      thermostat = this.thermostatsRepo.create({ nestAccountId: account.id, sdmDeviceName: device.name, sdmDeviceId: sdmDeviceId(device.name), traits: {} });
    }
    Object.assign(thermostat, { nestAccountId: account.id, displayName, roomName });
    return this.thermostatsRepo.save(thermostat);
  }

  private async accessToken(account: NestAccount): Promise<string> {
    const cached = this.accessTokens.get(account.id);
    if (cached && Date.now() < cached.expiry) return cached.token;
    if (!account.refreshToken) throw new NestAuthorizationRevokedError('Nest is disconnected — reconnect Nest');
    const fresh = await this.sdm!.refreshAccessToken(decrypt(account.refreshToken));
    this.accessTokens.set(account.id, { token: fresh.accessToken, expiry: Date.now() + (fresh.expiresIn - 60) * 1000 });
    return fresh.accessToken;
  }

  // ── Pub/Sub event loop ────────────────────────────────────────────────────

  private async runPullLoop(pubsub: PubsubClient): Promise<void> {
    let failures = 0;
    while (!this.stopped) {
      try {
        const messages = await pubsub.pull();
        for (const m of messages) {
          await this.handleEvent(m.data).catch((e) => this.logger.warn(`Could not process Nest event: ${e.message}`));
        }
        // Acked even when processing failed — redelivering an event that
        // can't be handled would only loop; the next poll reconciles state.
        await pubsub.acknowledge(messages.map((m) => m.ackId));
        if (failures > 0) this.recordRecovery('pubsub', 'Nest Pub/Sub pull recovered');
        failures = 0;
        if (messages.length === 0) await sleep(PULL_IDLE_DELAY_MS);
      } catch (err: any) {
        failures++;
        this.recordFailure('pubsub', `Nest Pub/Sub pull failed: ${err.response?.data?.error?.message ?? err.message} — retrying with backoff`);
        await sleep(Math.min(PULL_IDLE_DELAY_MS * 2 ** (failures - 1), MAX_BACKOFF_MS));
      }
    }
  }

  async handleEvent(event: any): Promise<void> {
    if (!event) return;
    if (event.relationUpdate) {
      // A thermostat added/removed/moved rooms — re-sync picks it up.
      await this.syncAllAccounts();
      return;
    }
    const name = event.resourceUpdate?.name;
    if (!name) return;
    const thermostat = await this.thermostatsRepo.findOne({ where: { sdmDeviceName: name } });
    if (!thermostat) return; // not a thermostat we track (camera, doorbell) or not synced yet — the next poll adds it
    const account = await this.accountsRepo.findOne({ where: { id: thermostat.nestAccountId, isActive: true } });
    if (!account) return;
    const observedAt = event.timestamp ? new Date(event.timestamp) : new Date();
    await this.ingest(account, thermostat, event.resourceUpdate.traits ?? {}, observedAt);
    account.lastEventAt = new Date();
    await this.accountsRepo.save(account);
  }

  // ── Ingest: SDM traits → registry → telemetry → analytics ─────────────────

  private ingest(account: NestAccount, thermostat: NestThermostat, update: NestTraits, observedAt: Date, retrievedAt: Date | null = null): Promise<void> {
    const run = (this.thermostatLocks.get(thermostat.id) ?? Promise.resolve())
      .then(() => this.ingestLocked(account, thermostat.id, update, observedAt, retrievedAt));
    const settled = run.catch(() => {});
    this.thermostatLocks.set(thermostat.id, settled);
    settled.then(() => { if (this.thermostatLocks.get(thermostat.id) === settled) this.thermostatLocks.delete(thermostat.id); });
    return run;
  }

  private async ingestLocked(account: NestAccount, thermostatId: string, update: NestTraits, observedAt: Date, retrievedAt: Date | null): Promise<void> {
    // Re-read inside the lock — the caller's copy may predate a concurrent update.
    const thermostat = await this.thermostatsRepo.findOne({ where: { id: thermostatId } });
    if (!thermostat) return;
    // An update older than the state already applied (a delayed Pub/Sub
    // event arriving after a newer poll) must not roll the thermostat's
    // state back — its temperature/humidity are still kept as history.
    const outOfOrder = !!thermostat.lastEventAt && observedAt < thermostat.lastEventAt;
    const readings = readingsFor(thermostat.traits ?? {}, update).filter((r) => !outOfOrder || r.kind === 'temperature' || r.kind === 'humidity');
    if (!outOfOrder) {
      thermostat.traits = mergeTraits(thermostat.traits ?? {}, update);
      thermostat.lastEventAt = observedAt;
      await this.thermostatsRepo.save(thermostat);
    }
    const connectivity = thermostat.traits?.[TRAIT.CONNECTIVITY]?.status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';
    if (readings.length === 0) {
      await this.setChannelConnectivity(thermostat, connectivity);
      return;
    }

    // Analytics findings/alerts are keyed to the customer's YolinkHome (the
    // engines predate multi-provider) — Nest can only be connected for a
    // customer that has one (see requireYolinkHome), so this is just a
    // guard for a home unlinked later.
    const yolinkHome = await this.yolinkHomesRepo.findOne({ where: { customerId: account.customerId, isActive: true } });

    await this.setChannelConnectivity(thermostat, connectivity);
    let zoneAssignment: SensorAssignment | null = null;
    for (const reading of readings) {
      const registry = await this.deviceRegistryService.upsertFromProvider(account.homeId, NEST_PROVIDER, `${thermostat.sdmDeviceId}:${reading.kind}`, {
        deviceType: NEST_DEVICE_TYPE, name: thermostat.displayName, room: thermostat.roomName,
      }, channelSpec(reading.kind, thermostat.equipmentNumber));
      const found = await this.deviceRegistryService.getDeviceAndAssignment(registry.id);
      if (!found) continue;
      const { device, assignment } = found;
      await this.telemetryService.record(device, assignment, reading.value, reading.numericValue, reading.unit, update, observedAt, { retrievedAt });
      if (assignment.equipmentId && reading.kind !== 'temperature') zoneAssignment = assignment;
      if (!yolinkHome) continue;
      try {
        switch (reading.kind) {
          case 'temperature':
            await this.analyticsEngineService.evaluateIndoorTempEvent(device, assignment, yolinkHome, reading.numericValue);
            break;
          case 'humidity':
            await this.performanceEngineService.handleHumidityReading(device, assignment, yolinkHome, reading.numericValue, observedAt);
            break;
          case 'setpoint':
            await this.performanceEngineService.handleSetpointReading(device, assignment, yolinkHome, reading.numericValue, observedAt);
            break;
        }
      } catch (err: any) {
        this.logger.warn(`Nest ${reading.kind} analytics failed for "${thermostat.displayName}": ${err.message}`);
      }
    }
    // Zone + system cooling rules (spec A–I) once per update, after every
    // channel of it is recorded — so a combined update (temperature and call
    // state together) is evaluated as one consistent picture.
    if (yolinkHome) {
      const hvacChannel = zoneAssignment ?? await this.channelAssignment(thermostat, 'hvac');
      if (hvacChannel) await this.coolingRulesService.onThermostatReading(hvacChannel, yolinkHome)
        .catch((err) => this.logger.warn(`Cooling analytics failed for "${thermostat.displayName}": ${err.message}`));
    }
  }

  private async channelAssignment(thermostat: NestThermostat, kind: NestReadingKind): Promise<SensorAssignment | null> {
    const device = await this.deviceRegistryService.findByProviderDeviceId(NEST_PROVIDER, `${thermostat.sdmDeviceId}:${kind}`);
    return device ? this.deviceRegistryService.getAssignment(device.id) : null;
  }

  private async channelDevices(thermostat: NestThermostat) {
    const devices = await Promise.all(CHANNEL_KINDS.map((k) => this.deviceRegistryService.findByProviderDeviceId(NEST_PROVIDER, `${thermostat.sdmDeviceId}:${k}`)));
    return devices.filter((d): d is NonNullable<typeof d> => !!d);
  }

  private async setChannelConnectivity(thermostat: NestThermostat, connectivity: 'ONLINE' | 'OFFLINE'): Promise<void> {
    const devices = await this.channelDevices(thermostat);
    const changed = devices.filter((d) => d.connectivity !== connectivity).map((d) => d.id);
    await this.deviceRegistryService.setConnectivity(changed, connectivity);
  }

  // ── Data quality (spec Rule J) ────────────────────────────────────────────

  // SENSOR-005 — the Google connection itself is failing. Raised/cleared on
  // every sync so it tracks reality; water alerts and YoLink analytics are
  // unaffected either way.
  private async reportIntegrationHealth(account: NestAccount, error: string | null): Promise<void> {
    const yolinkHome = await this.yolinkHomesRepo.findOne({ where: { customerId: account.customerId, isActive: true } });
    if (!yolinkHome) return;
    await this.analyticsEngineService.evaluateIntegrationFailure(yolinkHome, 'nest', error);
  }

  // SENSOR-001 for Nest — a thermostat reporting OFFLINE, or with no
  // successful update (event or poll) within NEST_STALE_MINUTES.
  @Cron('15 */5 * * * *')
  async checkThermostatAvailability(): Promise<void> {
    if (!this.config) return;
    const accounts = await this.accountsRepo.find({ where: { isActive: true } });
    for (const account of accounts) {
      const yolinkHome = await this.yolinkHomesRepo.findOne({ where: { customerId: account.customerId, isActive: true } });
      if (!yolinkHome) continue;
      const staleMinutes = await this.thresholdsService.getValue('NEST_STALE_MINUTES', account.customerId);
      const thermostats = await this.thermostatsRepo.find({ where: { nestAccountId: account.id } });
      for (const thermostat of thermostats) {
        const device = await this.deviceRegistryService.findByProviderDeviceId(NEST_PROVIDER, `${thermostat.sdmDeviceId}:hvac`);
        const assignment = device ? await this.deviceRegistryService.getAssignment(device.id) : null;
        if (!device || !assignment) continue;
        const offline = thermostat.traits?.[TRAIT.CONNECTIVITY]?.status === 'OFFLINE';
        const lastUpdate = [thermostat.lastEventAt, account.lastSyncAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
        const stale = !lastUpdate || Date.now() - lastUpdate.getTime() > staleMinutes * 60_000;
        if (offline || stale) await this.analyticsEngineService.evaluateSensorOffline(device, assignment, yolinkHome);
        else await this.analyticsEngineService.clearSensorOfflineFinding(device.id);
      }
    }
  }

  // ── System mapping (spec §5) ──────────────────────────────────────────────

  // Assigns each of the account's thermostats to an HVAC system and records
  // whether that mapping is confirmed. Thermostats sharing a number form one
  // multizone system; only a verified multi-zone system has its zones merged.
  async setSystemMapping(accountId: string, body: { thermostats: { id: string; equipmentNumber: string }[]; verified: boolean }): Promise<void> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId, isActive: true } });
    if (!account) throw new NotFoundException('Active Nest account not found');
    const thermostats = await this.thermostatsRepo.find({ where: { nestAccountId: account.id } });
    for (const entry of body.thermostats) {
      if (!/^\d{2}$/.test(entry.equipmentNumber)) throw new BadRequestException('System must be a two-digit number, e.g. 01');
      const thermostat = thermostats.find((t) => t.id === entry.id);
      if (!thermostat) throw new BadRequestException(`Unknown thermostat ${entry.id}`);
      thermostat.equipmentNumber = entry.equipmentNumber;
      await this.thermostatsRepo.save(thermostat);
      for (const device of await this.channelDevices(thermostat)) {
        if (!device.providerDeviceId.endsWith(':temperature')) await this.deviceRegistryService.reassignEquipment(device.id, entry.equipmentNumber);
      }
    }
    const numbers = [...new Set(thermostats.map((t) => t.equipmentNumber))];
    for (const n of numbers) {
      const zones = thermostats.filter((t) => t.equipmentNumber === n).length;
      await this.deviceRegistryService.configureEquipment(account.homeId, `HVAC-${n}`, {
        hvacConfiguration: zones > 1 ? 'MULTIZONE' : 'SINGLE_ZONE', verified: body.verified, verifiedAt: body.verified ? new Date().toISOString() : null,
      });
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private requireSdm(): SdmClient {
    if (!this.sdm) throw new ServiceUnavailableException('Nest integration is not configured on this server (NEST_CLIENT_ID / NEST_CLIENT_SECRET / NEST_PROJECT_ID).');
    return this.sdm;
  }

  private async requireYolinkHome(customerId: string): Promise<YolinkHome> {
    const home = await this.yolinkHomesRepo.findOne({ where: { customerId, isActive: true } });
    if (!home) throw new BadRequestException('Connect this customer\'s home monitoring first — Nest is added to an existing monitored home.');
    return home;
  }

  private stateSecret(): string {
    return this.configService.get('JWT_SECRET', 'fallback-secret-change-me');
  }

  private recordFailure(key: string, message: string) {
    if (this.lastFailure.get(key) === message) return;
    this.lastFailure.set(key, message);
    this.logger.error(message);
  }

  private recordRecovery(key: string, message: string) {
    if (!this.lastFailure.has(key)) return;
    this.lastFailure.delete(key);
    this.logger.log(message);
  }
}
