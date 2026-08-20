import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In, ILike } from 'typeorm';
import { AnalyticsFinding, FindingSeverity, FindingConfidence, FindingStatus } from './entities/analytics-finding.entity';
import { YolinkDevice } from '../yolink/entities/yolink-device.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { YolinkNameTaggingRule } from '../yolink/entities/yolink-name-tagging-rule.entity';
import { SensorReading } from '../yolink/entities/sensor-reading.entity';
import { User } from '../users/entities/user.entity';
import { CustomerSubscription, SubscriptionStatus } from '../subscriptions/entities/customer-subscription.entity';
import { UserRole, PlanTier } from '../common/enums/role.enum';
import { SensorRole, SENSOR_ROLE_META } from '../common/enums/sensor-role.enum';
import { RULE_CATALOG, evaluateRuleAvailability } from './rule-catalog';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/entities/alert.entity';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';

// Seed data — the exact Room/Equipment/Sensor Role/Analytics Role mappings
// from the tagging spec, both the initial 3-sensor set and the later
// Return/Supply Air additions. New rows can be added via direct DB access
// (or a future admin tagging UI) without touching this seed.
const TAGGING_SEED: Pick<YolinkNameTaggingRule, 'namePattern' | 'room' | 'equipmentId' | 'sensorRole' | 'analyticsRole'>[] = [
  { namePattern: 'ATV HVAC Drain Pan', room: 'HVAC', equipmentId: 'HVAC-01', sensorRole: SensorRole.DRAIN_WATER, analyticsRole: 'hvac_condensate' },
  { namePattern: 'ATV Washer Drain Pan', room: 'Laundry', equipmentId: 'WASHER-01', sensorRole: SensorRole.DRAIN_WATER, analyticsRole: 'washer_leak' },
  { namePattern: 'ATV Indoor Temperature', room: 'Living Room', equipmentId: 'INDOOR-01', sensorRole: SensorRole.AMBIENT_TEMP, analyticsRole: 'indoor_climate' },
  { namePattern: 'ATV HVAC Return Air', room: 'HVAC', equipmentId: 'HVAC-01', sensorRole: SensorRole.RETURN_TEMP, analyticsRole: 'hvac_return_air_temperature' },
  { namePattern: 'ATV HVAC Supply Air', room: 'HVAC', equipmentId: 'HVAC-01', sensorRole: SensorRole.SUPPLY_TEMP, analyticsRole: 'hvac_supply_air_temperature' },
];

// Sensor roles a CarePlus customer can see findings/coverage for — per your
// instruction, CarePlus gets low/high indoor temp + drain-pan/leak only.
const CAREPLUS_SENSOR_ROLES = new Set([SensorRole.AMBIENT_TEMP, SensorRole.DRAIN_WATER]);

@Injectable()
export class HvacAnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(HvacAnalyticsService.name);

  constructor(
    @InjectRepository(AnalyticsFinding) private findingsRepo: Repository<AnalyticsFinding>,
    @InjectRepository(YolinkDevice) private devicesRepo: Repository<YolinkDevice>,
    @InjectRepository(YolinkHome) private homesRepo: Repository<YolinkHome>,
    @InjectRepository(YolinkNameTaggingRule) private taggingRulesRepo: Repository<YolinkNameTaggingRule>,
    @InjectRepository(SensorReading) private readingsRepo: Repository<SensorReading>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(CustomerSubscription) private subscriptionsRepo: Repository<CustomerSubscription>,
    private alertsService: AlertsService,
    private notificationsService: NotificationsService,
  ) {}

  // Same active-subscription + family-sharing lookup as
  // SubscriptionsService.getActiveSubscription, duplicated here rather than
  // imported to avoid a module cycle (see hvac-analytics.module.ts) — `plan`
  // loads eager on CustomerSubscription so no separate relations fetch is needed.
  private async getActiveSubscription(customerId: string): Promise<CustomerSubscription | null> {
    const user = await this.usersRepo.findOne({ where: { id: customerId } });
    const ownerId = user?.parentUserId ?? customerId;
    return this.subscriptionsRepo.findOne({ where: { customerId: ownerId, status: SubscriptionStatus.ACTIVE } });
  }

  async onModuleInit() {
    for (const row of TAGGING_SEED) {
      const existing = await this.taggingRulesRepo.findOne({ where: { namePattern: row.namePattern } });
      if (!existing) await this.taggingRulesRepo.save(this.taggingRulesRepo.create(row));
    }
  }

  // ── Tagging ───────────────────────────────────────────────────────────────

  // Called by YolinkService whenever a device is upserted into the catalog —
  // applies a matching name-pattern rule once, only while the device is
  // still untagged. Deliberately does nothing once sensorRole is set, so
  // renaming the device in the Yolink app afterward never touches the tag.
  async autoTagDevice(device: YolinkDevice): Promise<void> {
    if (device.sensorRole) return;
    const rule = await this.taggingRulesRepo.findOne({ where: { namePattern: device.name, isActive: true } });
    if (!rule) return;
    device.room = rule.room;
    device.equipmentId = rule.equipmentId;
    device.sensorRole = rule.sensorRole;
    device.analyticsRole = rule.analyticsRole;
    await this.devicesRepo.save(device);
    this.logger.log(`Auto-tagged Yolink device "${device.name}" (${device.deviceId}) as ${rule.sensorRole}/${rule.analyticsRole}`);
  }

  // ── Time series ───────────────────────────────────────────────────────────

  async recordReading(device: YolinkDevice, value: number | null, rawState: Record<string, any> | null): Promise<void> {
    if (!device.analyticsRole) return;
    await this.readingsRepo.save(this.readingsRepo.create({
      yolinkDeviceId: device.id, analyticsRole: device.analyticsRole, value, rawState, recordedAt: new Date(),
    }));
  }

  // ── HVAC-WATER-001 / 002 / 003 ───────────────────────────────────────────

  async evaluateWaterEvent(device: YolinkDevice, home: YolinkHome, leakDetected: boolean): Promise<void> {
    if (device.sensorRole !== SensorRole.DRAIN_WATER) return;
    const active = await this.findingsRepo.findOne({
      where: { yolinkDeviceId: device.id, ruleId: 'HVAC-WATER-001', status: FindingStatus.ACTIVE },
      order: { detectedAt: 'DESC' },
    });
    if (!leakDetected) {
      if (active) { active.status = FindingStatus.RESOLVED; active.resolvedAt = new Date(); await this.findingsRepo.save(active); }
      return;
    }
    if (active) return; // already firing — HVAC-WATER-002's escalation is duration-based display, not a duplicate row

    const finding = await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: device.equipmentId, yolinkDeviceId: device.id,
      ruleId: 'HVAC-WATER-001', eventType: 'water_detected', severity: FindingSeverity.CRITICAL, confidence: FindingConfidence.VERY_HIGH,
      message: '🚨 Water detected near your HVAC system',
      measurements: { deviceName: device.name, room: device.room },
      reasonCodes: ['WATER_DETECTED'], recommendedActions: ['I_FIXED_IT', 'GET_ATTENTEVE_HELP'],
      detectedAt: new Date(),
    }));

    const alert = await this.alertsService.createAlert({
      customerId: home.customerId, yolinkHomeId: home.id, deviceId: device.deviceId, deviceName: device.name, deviceType: device.deviceType,
      event: 'HVAC-WATER-001', severity: AlertSeverity.CRITICAL,
      message: 'Water has been detected in the drain pan. This may indicate a condensate drainage problem.',
      rawPayload: { findingId: finding.id },
    });
    finding.linkedAlertId = alert.id;
    await this.findingsRepo.save(finding);

    // HVAC-WATER-003 — 2+ events in 30 days.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCount = await this.findingsRepo.count({ where: { yolinkDeviceId: device.id, ruleId: 'HVAC-WATER-001', detectedAt: MoreThan(since) } });
    if (recentCount >= 2) {
      const alreadyFlagged = await this.findingsRepo.findOne({ where: { yolinkDeviceId: device.id, ruleId: 'HVAC-WATER-003', status: FindingStatus.ACTIVE } });
      if (!alreadyFlagged) {
        await this.findingsRepo.save(this.findingsRepo.create({
          customerId: home.customerId, yolinkHomeId: home.id, equipmentId: device.equipmentId, yolinkDeviceId: device.id,
          ruleId: 'HVAC-WATER-003', eventType: 'repeated_water_events', severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.HIGH,
          message: 'Your HVAC drainage area has experienced multiple water events recently. A preventative inspection may help identify an underlying drainage issue.',
          measurements: { eventsInLast30Days: recentCount }, reasonCodes: ['REPEATED_WATER_EVENTS'], recommendedActions: ['SCHEDULE_HVAC_INSPECTION'],
          detectedAt: new Date(),
        }));
      }
    }
  }

  // ── INDOOR-TEMP-001 (CarePlus-eligible) ──────────────────────────────────
  // Reuses THSensor.Alert's own alarm.lowTemp/highTemp flags — re-sourced
  // through the finding pipeline rather than only the generic Alert.

  async evaluateIndoorTempEvent(device: YolinkDevice, home: YolinkHome, alarm: { lowTemp?: boolean; highTemp?: boolean } | undefined, tempF: number | null): Promise<void> {
    if (device.sensorRole !== SensorRole.AMBIENT_TEMP) return;
    if (!alarm?.lowTemp && !alarm?.highTemp) return;
    const kind = alarm.lowTemp ? 'low' : 'high';
    await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: device.equipmentId, yolinkDeviceId: device.id,
      ruleId: 'INDOOR-TEMP-001', eventType: `indoor_temp_${kind}`, severity: FindingSeverity.WATCH, confidence: FindingConfidence.HIGH,
      message: `${device.name}: ${kind === 'low' ? 'Low' : 'High'} indoor temperature detected${tempF != null ? ` (${tempF}°F)` : ''}`,
      measurements: { temperature: tempF }, reasonCodes: [kind === 'low' ? 'LOW_INDOOR_TEMP' : 'HIGH_INDOOR_TEMP'], recommendedActions: [],
      detectedAt: new Date(),
    }));
  }

  // ── HVAC-SENSOR-002 (low battery) ────────────────────────────────────────
  // Battery is a 0-4 scale on Yolink's getState response (confirmed live
  // 2026-08-19) — mapped to a rough 0/25/50/75/100%, since that's the only
  // granularity Yolink offers.

  async evaluateSensorBattery(device: YolinkDevice): Promise<void> {
    if (!device.sensorRole) return;
    const battery = device.lastState?.battery;
    if (typeof battery !== 'number') return;
    const percent = (battery / 4) * 100;
    if (percent > 20) return;
    const already = await this.findingsRepo.findOne({ where: { yolinkDeviceId: device.id, ruleId: 'HVAC-SENSOR-002', status: FindingStatus.ACTIVE } });
    if (already) return;
    const home = await this.homesRepo.findOne({ where: { id: device.yolinkHomeId } });
    if (!home) return;
    await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: device.equipmentId, yolinkDeviceId: device.id,
      ruleId: 'HVAC-SENSOR-002', eventType: 'low_battery', severity: percent <= 10 ? FindingSeverity.ATTENTION : FindingSeverity.WATCH,
      confidence: FindingConfidence.HIGH, message: `${device.name}: Battery is low — check or replace soon.`,
      measurements: { batteryPercent: percent }, reasonCodes: ['LOW_BATTERY'], recommendedActions: ['REPLACE_BATTERY'],
      detectedAt: new Date(),
    }));
  }

  // ── HVAC-SENSOR-001 (offline) ─────────────────────────────────────────────
  // Called from YolinkService.checkDisconnectedSensors alongside its existing
  // generic "Sensor disconnected" Info alert, for any device that's also
  // analytics-tagged — same offline signal, framed as a proper finding too.

  async evaluateSensorOffline(device: YolinkDevice, home: YolinkHome): Promise<void> {
    if (!device.sensorRole) return;
    const already = await this.findingsRepo.findOne({ where: { yolinkDeviceId: device.id, ruleId: 'HVAC-SENSOR-001', status: FindingStatus.ACTIVE } });
    if (already) return;
    await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: device.equipmentId, yolinkDeviceId: device.id,
      ruleId: 'HVAC-SENSOR-001', eventType: 'sensor_offline', severity: FindingSeverity.ATTENTION, confidence: FindingConfidence.HIGH,
      message: `HVAC monitoring is incomplete — ${device.name} has not reported recently. Check sensor battery and connectivity.`,
      measurements: {}, reasonCodes: ['SENSOR_OFFLINE'], recommendedActions: ['CHECK_SENSOR_CONNECTIVITY'],
      detectedAt: new Date(),
    }));
  }

  async clearSensorOfflineFinding(device: YolinkDevice): Promise<void> {
    const active = await this.findingsRepo.findOne({ where: { yolinkDeviceId: device.id, ruleId: 'HVAC-SENSOR-001', status: FindingStatus.ACTIVE } });
    if (active) { active.status = FindingStatus.RESOLVED; active.resolvedAt = new Date(); await this.findingsRepo.save(active); }
  }

  // ── Customer-facing summary (tier-gated) ─────────────────────────────────

  private async getTaggedDevicesForCustomer(customerId: string): Promise<{ home: YolinkHome; devices: YolinkDevice[] }[]> {
    const homes = await this.homesRepo.find({ where: { customerId, isActive: true } });
    const out: { home: YolinkHome; devices: YolinkDevice[] }[] = [];
    for (const home of homes) {
      const devices = await this.devicesRepo.find({ where: { yolinkHomeId: home.id } });
      out.push({ home, devices });
    }
    return out;
  }

  async getMyAnalytics(customerId: string) {
    const sub = await this.getActiveSubscription(customerId);
    const tier = sub?.plan?.tier ?? null;
    const isProactivePlus = tier === PlanTier.STANDARD || tier === PlanTier.PREMIUM;

    const homeDevices = await this.getTaggedDevicesForCustomer(customerId);
    const allDevices = homeDevices.flatMap((h) => h.devices);
    const taggedDevices = allDevices.filter((d) => d.sensorRole);
    const visibleTaggedDevices = isProactivePlus ? taggedDevices : taggedDevices.filter((d) => CAREPLUS_SENSOR_ROLES.has(d.sensorRole!));
    const taggedRoleSet = new Set(visibleTaggedDevices.map((d) => d.sensorRole!));

    const allFindings = allDevices.length
      ? await this.findingsRepo.find({ where: { customerId, status: FindingStatus.ACTIVE }, order: { detectedAt: 'DESC' } })
      : [];
    const allowedRuleIds = new Set(RULE_CATALOG.filter((r) => isProactivePlus || r.careplusEligible).map((r) => r.id));
    const visibleFindings = allFindings.filter((f) => allowedRuleIds.has(f.ruleId));

    const coverageRoles: SensorRole[] = isProactivePlus
      ? [SensorRole.AMBIENT_TEMP, SensorRole.DRAIN_WATER, SensorRole.RETURN_TEMP, SensorRole.SUPPLY_TEMP]
      : [SensorRole.AMBIENT_TEMP, SensorRole.DRAIN_WATER];
    const sensorCoverage = coverageRoles.map((role) => {
      const devs = visibleTaggedDevices.filter((d) => d.sensorRole === role);
      return { role, label: SENSOR_ROLE_META[role].label, connected: devs.length > 0, deviceNames: devs.map((d) => d.name) };
    });

    const hasFullHvacTempSensors = taggedRoleSet.has(SensorRole.RETURN_TEMP) && taggedRoleSet.has(SensorRole.SUPPLY_TEMP);

    return {
      tier: tier ?? 'FREE',
      isProactivePlus,
      // No baseline engine yet — every home is honestly "Learning" once it
      // has the sensors performance rules need, or waiting on sensors before
      // that.
      healthState: !isProactivePlus ? 'NOT_INCLUDED' : hasFullHvacTempSensors ? 'LEARNING' : 'AWAITING_SENSORS',
      findings: visibleFindings.map((f) => this.toFindingDto(f)),
      sensorCoverage,
    };
  }

  private toFindingDto(f: AnalyticsFinding) {
    return {
      id: f.id, ruleId: f.ruleId, eventType: f.eventType, severity: f.severity, confidence: f.confidence,
      message: f.message, measurements: f.measurements, reasonCodes: f.reasonCodes, recommendedActions: f.recommendedActions,
      detectedAt: f.detectedAt,
    };
  }

  async resolveFinding(customerId: string, findingId: string, status: FindingStatus.RESOLVED | FindingStatus.DISMISSED): Promise<void> {
    const finding = await this.findingsRepo.findOne({ where: { id: findingId, customerId } });
    if (!finding) throw new NotFoundException('Finding not found');
    finding.status = status;
    finding.resolvedAt = new Date();
    await this.findingsRepo.save(finding);
  }

  // "Request HVAC Contractor Visit" — notifies admins now; creating a real
  // assigned work order is separate follow-on backend work (not this pass).
  async requestContractorVisit(customerId: string): Promise<{ ok: boolean }> {
    const customer = await this.usersRepo.findOne({ where: { id: customerId } });
    await this.notificationsService.notifyUserWithEmail(
      customerId, NotificationType.NEW_REQUEST,
      'HVAC Contractor Visit Requested', "We've received your request — an Attenteve specialist will be in touch shortly.",
      { screen: 'hvac-analytics' },
    ).catch(() => {});
    this.logger.log(`HVAC contractor visit requested by customer ${customer?.email ?? customerId}`);
    return { ok: true };
  }

  // ── Admin-facing ──────────────────────────────────────────────────────────

  async searchCustomers(query: string) {
    if (!query || query.trim().length < 2) return [];
    const q = `%${query.trim()}%`;
    const users = await this.usersRepo.find({
      where: [{ firstName: ILike(q) }, { lastName: ILike(q) }, { email: ILike(q) }],
      take: 15,
    });
    return users
      .filter((u) => u.roles?.includes(UserRole.CUSTOMER))
      .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email }));
  }

  async getAdminAnalytics(customerId: string) {
    const homeDevices = await this.getTaggedDevicesForCustomer(customerId);
    const allDevices = homeDevices.flatMap((h) => h.devices);
    const taggedDevices = allDevices.filter((d) => d.sensorRole);
    const taggedRoleSet = new Set(taggedDevices.map((d) => d.sensorRole!));

    const findings = await this.findingsRepo.find({ where: { customerId }, order: { detectedAt: 'DESC' }, take: 50 });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deviceIds = taggedDevices.map((d) => d.id);
    const readings = deviceIds.length
      ? await this.readingsRepo.find({ where: { yolinkDeviceId: In(deviceIds), recordedAt: MoreThan(since) }, order: { recordedAt: 'ASC' } })
      : [];
    const deviceById = new Map(taggedDevices.map((d) => [d.id, d]));
    const series = readings
      .filter((r) => r.value != null)
      .map((r) => ({ analyticsRole: r.analyticsRole, deviceName: deviceById.get(r.yolinkDeviceId)?.name ?? '', value: Number(r.value), recordedAt: r.recordedAt }));

    const ruleAvailability = evaluateRuleAvailability(taggedRoleSet, false);

    const sensorCoverage = Object.values(SensorRole).map((role) => {
      const devs = taggedDevices.filter((d) => d.sensorRole === role);
      return { role, label: SENSOR_ROLE_META[role].label, connected: devs.length > 0, deviceNames: devs.map((d) => d.name) };
    });

    return {
      findings: findings.map((f) => this.toFindingDto(f)),
      series,
      ruleAvailability,
      sensorCoverage,
    };
  }
}
