import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnalyticsFinding, FindingConfidence, FindingSeverity, FindingStatus } from './entities/analytics-finding.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { Equipment } from './entities/equipment.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { RULE_DEFINITIONS } from './rule-definitions';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/entities/alert.entity';
import { ThresholdsService } from './thresholds.service';
import { SENSOR_ROLE_META } from '../common/enums/sensor-role.enum';

// The only snooze windows the mobile app offers — validated here too so a
// crafted request can't set an arbitrary/unbounded snooze.
const SNOOZE_MINUTES = [30, 60, 240] as const;

// Must match the notification category identifier the mobile app registers
// via Notifications.setNotificationCategoryAsync (apps/mobile/src/services/
// notifications.ts) — this is what makes the OS show Snooze action buttons
// directly on the push notification, on both iOS and Android.
export const SNOOZABLE_FINDING_CATEGORY = 'SNOOZABLE_FINDING';

// Re-alert cadence for a still-ACTIVE, customer-notified finding — frequent
// early (matches CRITICAL urgency), tapering off so a long-lived fault
// doesn't spam forever. Never fully stops (see the 7-day+ tier) — a
// genuinely still-active fault should keep reminding the homeowner, just
// infrequently. A finding that resolves and later genuinely recurs always
// does so as a brand-new AnalyticsFinding row (fresh detectedAt) — see the
// `active` status-scoped lookups in evaluateWaterEvent/evaluateIndoorTempEvent
// — so this always restarts at the 30-minute tier for a real recurrence.
const REALERT_TIERS: { maxAgeMs: number; intervalMs: number }[] = [
  { maxAgeMs: 4 * 60 * 60 * 1000, intervalMs: 30 * 60 * 1000 },          // 0-4h: every 30 min
  { maxAgeMs: 24 * 60 * 60 * 1000, intervalMs: 2 * 60 * 60 * 1000 },     // 4h-24h: every 2h
  { maxAgeMs: 7 * 24 * 60 * 60 * 1000, intervalMs: 6 * 60 * 60 * 1000 }, // 1-7 days: every 6h
];
const REALERT_INTERVAL_BEYOND_7_DAYS_MS = 24 * 60 * 60 * 1000; // 7+ days: once daily

function nextReAlertIntervalMs(ageMs: number): number {
  for (const tier of REALERT_TIERS) if (ageMs <= tier.maxAgeMs) return tier.intervalMs;
  return REALERT_INTERVAL_BEYOND_7_DAYS_MS;
}

const FINDING_TO_ALERT_SEVERITY: Record<FindingSeverity, AlertSeverity> = {
  [FindingSeverity.CRITICAL]: AlertSeverity.CRITICAL,
  [FindingSeverity.HIGH]: AlertSeverity.HIGH,
  [FindingSeverity.ATTENTION]: AlertSeverity.HIGH,
  [FindingSeverity.WATCH]: AlertSeverity.MEDIUM,
  [FindingSeverity.INFO]: AlertSeverity.LOW,
  [FindingSeverity.NORMAL]: AlertSeverity.LOW,
};

// Every rule condition this MVP actually evaluates, keyed by the SAME
// reasonCode its RuleDefinition carries — see rule-definitions.ts's header
// comment for why this is a typed predicate map instead of a parsed
// `"water_detected == true"` expression string. Registering a new
// water-type rule for a new sensor role only needs an entry here plus a
// RULE_DEFINITIONS row with a matching applicableSensorRoles/reasonCode —
// evaluateWaterEvent below never special-cases a sensor role by name.
const CONDITION_PREDICATES: Record<string, (ctx: { leakDetected: boolean }) => boolean> = {
  HVAC_WATER_DETECTED: (ctx) => ctx.leakDetected === true,
  WASHER_LEAK_DETECTED: (ctx) => ctx.leakDetected === true,
};

@Injectable()
export class AnalyticsEngineService {
  private readonly logger = new Logger(AnalyticsEngineService.name);

  constructor(
    @InjectRepository(AnalyticsFinding) private findingsRepo: Repository<AnalyticsFinding>,
    @InjectRepository(Equipment) private equipmentRepo: Repository<Equipment>,
    private alertsService: AlertsService,
    private thresholdsService: ThresholdsService,
  ) {}

  private async equipmentFor(assignment: SensorAssignment): Promise<Equipment | null> {
    if (!assignment.equipmentId) return null;
    return this.equipmentRepo.findOne({ where: { id: assignment.equipmentId } });
  }

  // ── HVAC-WATER-001/003 and WASHER-WATER-001 — one generic implementation,
  // dispatched by whichever RULE_DEFINITIONS row applies to this sensor role
  // and has a registered condition predicate. Never CRITICAL-alerts from
  // anything but a real reading (rule execution principle: never generate a
  // critical mechanical-failure alert from stale data) — the leakDetected
  // boolean passed in always comes from a just-received report/alert. ──

  async evaluateWaterEvent(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, leakDetected: boolean): Promise<void> {
    const primary = RULE_DEFINITIONS.find((r) => r.applicableSensorRoles.includes(assignment.sensorRole) && CONDITION_PREDICATES[r.reasonCode]);
    if (!primary) return;

    const active = await this.findingsRepo.findOne({
      where: { deviceRegistryId: device.id, ruleId: primary.ruleId, status: FindingStatus.ACTIVE },
      order: { detectedAt: 'DESC' },
    });
    const conditionMet = CONDITION_PREDICATES[primary.reasonCode]({ leakDetected });
    if (!conditionMet) {
      if (active) { active.status = FindingStatus.RESOLVED; active.resolvedAt = new Date(); await this.findingsRepo.save(active); }
      return;
    }
    if (active) return; // already firing — escalation below is duration-based display, not a duplicate row

    const equipment = await this.equipmentFor(assignment);
    // Derived from assignment.sensorRole — the same field that determined
    // which rule matched above — so the message can never disagree with
    // which rule actually fired (unlike the old ruleId-string-equality
    // ternary this replaced).
    const sensorLabel = SENSOR_ROLE_META[assignment.sensorRole]?.label ?? 'Sensor';
    const message = `🚨 Water detected near your ${sensorLabel}.`;

    const finding = await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: equipment?.id ?? null, equipmentCode: equipment?.equipmentCode ?? null,
      deviceRegistryId: device.id, sensorRole: assignment.sensorRole, ruleId: primary.ruleId, ruleGroup: primary.ruleGroup,
      eventType: primary.reasonCode.toLowerCase(), severity: primary.severity, confidence: primary.confidence,
      message, measurements: { deviceName: device.currentProviderName, room: device.currentProviderRoom },
      reasonCode: primary.reasonCode, reasonCodes: [primary.reasonCode], recommendedActions: primary.recommendedActions,
      detectedAt: new Date(),
    }));

    const alert = await this.alertsService.createAlert({
      customerId: home.customerId, yolinkHomeId: home.id, deviceId: device.providerDeviceId,
      deviceName: device.currentProviderName ?? 'Sensor', deviceType: device.providerDeviceType ?? undefined,
      event: primary.ruleId, severity: AlertSeverity.CRITICAL,
      message,
      rawPayload: { findingId: finding.id }, categoryId: SNOOZABLE_FINDING_CATEGORY,
    });
    finding.linkedAlertId = alert.id;
    finding.lastAlertedAt = new Date();
    await this.findingsRepo.save(finding);

    // HVAC-WATER-003 — N+ HVAC condensate events within a rolling window.
    // Spec only defines a "repeated events" escalation for HVAC's own rule
    // group. Count/window come from WATER_REPEATED_EVENT_COUNT/
    // WATER_REPEATED_EVENT_WINDOW_DAYS (ThresholdsService), not hardcoded.
    if (primary.ruleGroup === 'HVAC_WATER') {
      const [repeatCount, windowDays] = await Promise.all([
        this.thresholdsService.getValue('WATER_REPEATED_EVENT_COUNT', home.customerId),
        this.thresholdsService.getValue('WATER_REPEATED_EVENT_WINDOW_DAYS', home.customerId),
      ]);
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const recentCount = await this.findingsRepo.count({ where: { deviceRegistryId: device.id, ruleId: primary.ruleId, detectedAt: MoreThan(since) } });
      if (recentCount >= repeatCount) {
        const alreadyFlagged = await this.findingsRepo.findOne({ where: { deviceRegistryId: device.id, ruleId: 'HVAC-WATER-003', status: FindingStatus.ACTIVE } });
        if (!alreadyFlagged) {
          const repeatedRule = RULE_DEFINITIONS.find((r) => r.ruleId === 'HVAC-WATER-003')!;
          await this.findingsRepo.save(this.findingsRepo.create({
            customerId: home.customerId, yolinkHomeId: home.id, equipmentId: equipment?.id ?? null, equipmentCode: equipment?.equipmentCode ?? null,
            deviceRegistryId: device.id, sensorRole: assignment.sensorRole, ruleId: repeatedRule.ruleId, ruleGroup: repeatedRule.ruleGroup,
            eventType: repeatedRule.reasonCode.toLowerCase(), severity: repeatedRule.severity, confidence: repeatedRule.confidence,
            message: 'Your HVAC drainage area has experienced multiple water events recently. A preventative inspection may help identify an underlying drainage issue.',
            measurements: { eventsInWindow: recentCount, windowDays }, reasonCode: repeatedRule.reasonCode, reasonCodes: [repeatedRule.reasonCode],
            recommendedActions: repeatedRule.recommendedActions, detectedAt: new Date(),
          }));
        }
      }
    }
  }

  // ── INDOOR-TEMP-001 (CarePlus-eligible) — evaluated entirely by
  // Attenteve against the raw temperature reading and this customer's
  // INDOOR_TEMP_LOW_F/HIGH_F thresholds (ThresholdsService), NOT YoLink's
  // own per-device alarm.lowTemp/highTemp flags — those live in the
  // YoLink app's own config, invisible to and uncontrolled by Attenteve. ──

  async evaluateIndoorTempEvent(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, tempF: number | null): Promise<void> {
    const rule = RULE_DEFINITIONS.find((r) => r.ruleId === 'INDOOR-TEMP-001')!;
    const active = await this.findingsRepo.findOne({
      where: { deviceRegistryId: device.id, ruleId: rule.ruleId, status: FindingStatus.ACTIVE },
      order: { detectedAt: 'DESC' },
    });
    if (tempF == null) return; // no reading this event — neither confirm nor clear off stale data

    const [lowThreshold, highThreshold] = await Promise.all([
      this.thresholdsService.getValue('INDOOR_TEMP_LOW_F', home.customerId),
      this.thresholdsService.getValue('INDOOR_TEMP_HIGH_F', home.customerId),
    ]);
    const isLow = tempF <= lowThreshold;
    const isHigh = tempF >= highThreshold;
    if (!isLow && !isHigh) {
      if (active) { active.status = FindingStatus.RESOLVED; active.resolvedAt = new Date(); await this.findingsRepo.save(active); }
      return;
    }
    if (active) return; // already firing — don't re-alert on every report while the condition persists

    const equipment = await this.equipmentFor(assignment);
    const kind = isLow ? 'low' : 'high';
    const reasonCode = kind === 'low' ? 'LOW_INDOOR_TEMP' : 'HIGH_INDOOR_TEMP';
    const thresholdUsed = kind === 'low' ? lowThreshold : highThreshold;
    // Generic sensor-role label, never the installed device's own name —
    // this message is shown verbatim to the homeowner.
    const sensorLabel = SENSOR_ROLE_META[assignment.sensorRole]?.label ?? 'Indoor sensor';
    const message = `${sensorLabel}: ${kind === 'low' ? 'Low' : 'High'} indoor temperature detected (${tempF}°F, threshold ${thresholdUsed}°F)`;

    const finding = await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: equipment?.id ?? null, equipmentCode: equipment?.equipmentCode ?? null,
      deviceRegistryId: device.id, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
      eventType: `indoor_temp_${kind}`, severity: rule.severity, confidence: rule.confidence,
      message, measurements: { temperature: tempF }, reasonCode, reasonCodes: [reasonCode], recommendedActions: rule.recommendedActions,
      detectedAt: new Date(),
    }));

    const alert = await this.alertsService.createAlert({
      customerId: home.customerId, yolinkHomeId: home.id, deviceId: device.providerDeviceId,
      deviceName: device.currentProviderName ?? 'Sensor', deviceType: device.providerDeviceType ?? undefined,
      event: 'INDOOR-TEMP-001', severity: AlertSeverity.MEDIUM, message, rawPayload: { findingId: finding.id }, categoryId: SNOOZABLE_FINDING_CATEGORY,
    });
    finding.linkedAlertId = alert.id;
    finding.lastAlertedAt = new Date();
    await this.findingsRepo.save(finding);
  }

  // ── SENSOR-002 (low battery) — battery is a 0-4 scale on Yolink's
  // getState response, mapped to a rough 0/25/50/75/100%. Watch/Attention
  // cutoffs come from LOW_BATTERY_WATCH_PERCENT/LOW_BATTERY_ATTENTION_PERCENT
  // (ThresholdsService), not a hardcoded 20/10. ──

  async evaluateSensorBattery(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, batteryRaw: number): Promise<void> {
    const percent = (batteryRaw / 4) * 100;
    const [watchThreshold, attentionThreshold] = await Promise.all([
      this.thresholdsService.getValue('LOW_BATTERY_WATCH_PERCENT', home.customerId),
      this.thresholdsService.getValue('LOW_BATTERY_ATTENTION_PERCENT', home.customerId),
    ]);
    if (percent > watchThreshold) return;
    const rule = RULE_DEFINITIONS.find((r) => r.ruleId === 'SENSOR-002')!;
    const already = await this.findingsRepo.findOne({ where: { deviceRegistryId: device.id, ruleId: rule.ruleId, status: FindingStatus.ACTIVE } });
    if (already) return;
    const equipment = await this.equipmentFor(assignment);
    const sensorLabel = SENSOR_ROLE_META[assignment.sensorRole]?.label ?? 'Sensor';
    await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: equipment?.id ?? null, equipmentCode: equipment?.equipmentCode ?? null,
      deviceRegistryId: device.id, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup, eventType: 'low_battery',
      severity: percent <= attentionThreshold ? FindingSeverity.ATTENTION : FindingSeverity.WATCH, confidence: rule.confidence,
      message: `${sensorLabel}: Battery is low — check or replace soon.`,
      measurements: { batteryPercent: percent }, reasonCode: rule.reasonCode, reasonCodes: [rule.reasonCode], recommendedActions: rule.recommendedActions,
      detectedAt: new Date(),
    }));
  }

  // ── SENSOR-001 (offline) — called from YolinkService.checkDisconnectedSensors
  // alongside its existing generic "Sensor disconnected" Info alert. ──

  async evaluateSensorOffline(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome): Promise<void> {
    const rule = RULE_DEFINITIONS.find((r) => r.ruleId === 'SENSOR-001')!;
    const already = await this.findingsRepo.findOne({ where: { deviceRegistryId: device.id, ruleId: rule.ruleId, status: FindingStatus.ACTIVE } });
    if (already) return;
    const equipment = await this.equipmentFor(assignment);
    await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: equipment?.id ?? null, equipmentCode: equipment?.equipmentCode ?? null,
      deviceRegistryId: device.id, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup, eventType: 'sensor_offline',
      severity: rule.severity, confidence: rule.confidence,
      message: `HVAC monitoring is incomplete — ${device.currentProviderName ?? 'a sensor'} has not reported recently. Check sensor battery and connectivity.`,
      measurements: {}, reasonCode: rule.reasonCode, reasonCodes: [rule.reasonCode], recommendedActions: rule.recommendedActions,
      detectedAt: new Date(),
    }));
  }

  async clearSensorOfflineFinding(deviceRegistryId: string): Promise<void> {
    const active = await this.findingsRepo.findOne({ where: { deviceRegistryId, ruleId: 'SENSOR-001', status: FindingStatus.ACTIVE } });
    if (active) { active.status = FindingStatus.RESOLVED; active.resolvedAt = new Date(); await this.findingsRepo.save(active); }
  }

  // ── Keep alerting while a fault condition remains active ────────────────
  // A finding only pushes once at detection (see the `if (active) return`
  // guards above — never a duplicate finding row while it's still firing).
  // That's correct for the finding/dashboard state, but a genuinely active
  // fault (water detected, indoor temp out of range — anything that already
  // warranted a real Alert, i.e. has a linkedAlertId) shouldn't go silent
  // after the first push. This resends the same-severity alert on every
  // tick for any still-ACTIVE, customer-notified finding that isn't
  // currently snoozed, so the homeowner keeps getting reminded until they
  // resolve it, dismiss it, or snooze it.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reAlertActiveFindings(): Promise<void> {
    const candidates = await this.findingsRepo.find({
      where: { status: FindingStatus.ACTIVE, linkedAlertId: Not(IsNull()) },
    });
    const now = Date.now();
    const due = candidates.filter((f) => {
      if (f.snoozedUntil && f.snoozedUntil.getTime() > now) return false;
      const ageMs = now - f.detectedAt.getTime();
      const sinceLastAlertMs = now - (f.lastAlertedAt ?? f.detectedAt).getTime();
      return sinceLastAlertMs >= nextReAlertIntervalMs(ageMs);
    });
    for (const finding of due) {
      try {
        const alert = await this.alertsService.createAlert({
          customerId: finding.customerId, yolinkHomeId: finding.yolinkHomeId,
          deviceId: finding.deviceRegistryId ?? undefined, deviceName: (finding.measurements as any)?.deviceName ?? 'Sensor',
          event: finding.ruleId, severity: FINDING_TO_ALERT_SEVERITY[finding.severity],
          message: `Still active: ${finding.message}`,
          rawPayload: { findingId: finding.id, reAlert: true }, categoryId: SNOOZABLE_FINDING_CATEGORY,
        });
        finding.linkedAlertId = alert.id;
        finding.lastAlertedAt = new Date();
        await this.findingsRepo.save(finding);
      } catch (err) {
        this.logger.warn(`Failed to re-alert finding ${finding.id}: ${err}`);
      }
    }
  }

  // ── Shared read/write helpers used by the facade (IotAnalyticsService) ──

  toFindingDto(f: AnalyticsFinding) {
    return {
      id: f.id, ruleId: f.ruleId, eventType: f.eventType, severity: f.severity, confidence: f.confidence, status: f.status,
      message: f.message, measurements: f.measurements, reasonCodes: f.reasonCodes, recommendedActions: f.recommendedActions,
      detectedAt: f.detectedAt, snoozedUntil: f.snoozedUntil,
    };
  }

  async resolveFinding(customerId: string, findingId: string, status: FindingStatus.RESOLVED | FindingStatus.DISMISSED): Promise<void> {
    const finding = await this.findingsRepo.findOne({ where: { id: findingId, customerId } });
    if (!finding) throw new NotFoundException('Finding not found');
    finding.status = status;
    finding.resolvedAt = new Date();
    await this.findingsRepo.save(finding);
  }

  async snoozeFinding(customerId: string, findingId: string, minutes: number): Promise<{ snoozedUntil: Date }> {
    if (!SNOOZE_MINUTES.includes(minutes as any)) throw new BadRequestException('minutes must be one of 30, 60, 240');
    const finding = await this.findingsRepo.findOne({ where: { id: findingId, customerId, status: FindingStatus.ACTIVE } });
    if (!finding) throw new NotFoundException('Active finding not found');
    finding.snoozedUntil = new Date(Date.now() + minutes * 60_000);
    await this.findingsRepo.save(finding);
    return { snoozedUntil: finding.snoozedUntil };
  }

  // Snooze straight from a push notification's action button, which only
  // knows the Alert's id (the data payload AlertsService already attaches),
  // not the AnalyticsFinding's id — resolved via the same linkedAlertId
  // every finding-driven alert sets when it's created/re-alerted above.
  async snoozeFindingByAlertId(customerId: string, alertId: string, minutes: number): Promise<{ snoozedUntil: Date }> {
    const finding = await this.findingsRepo.findOne({ where: { linkedAlertId: alertId, customerId, status: FindingStatus.ACTIVE } });
    if (!finding) throw new NotFoundException('Active finding not found for this alert');
    return this.snoozeFinding(customerId, finding.id, minutes);
  }
}
