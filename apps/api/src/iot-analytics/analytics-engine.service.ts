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

// The only snooze windows the mobile app offers — validated here too so a
// crafted request can't set an arbitrary/unbounded snooze.
const SNOOZE_MINUTES = [30, 60, 240] as const;

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
    const message = primary.ruleId === 'WASHER-WATER-001'
      ? primary.description
      : '🚨 Water detected near your HVAC system';

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
      message: primary.ruleId === 'WASHER-WATER-001'
        ? 'Water has been detected near your washer drain pan.'
        : 'Water has been detected in the drain pan. This may indicate a condensate drainage problem.',
      rawPayload: { findingId: finding.id },
    });
    finding.linkedAlertId = alert.id;
    finding.lastAlertedAt = new Date();
    await this.findingsRepo.save(finding);

    // HVAC-WATER-003 — 2+ HVAC condensate events in 30 days. Spec only
    // defines a "repeated events" escalation for HVAC's own rule group.
    if (primary.ruleGroup === 'HVAC_WATER') {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentCount = await this.findingsRepo.count({ where: { deviceRegistryId: device.id, ruleId: primary.ruleId, detectedAt: MoreThan(since) } });
      if (recentCount >= 2) {
        const alreadyFlagged = await this.findingsRepo.findOne({ where: { deviceRegistryId: device.id, ruleId: 'HVAC-WATER-003', status: FindingStatus.ACTIVE } });
        if (!alreadyFlagged) {
          const repeatedRule = RULE_DEFINITIONS.find((r) => r.ruleId === 'HVAC-WATER-003')!;
          await this.findingsRepo.save(this.findingsRepo.create({
            customerId: home.customerId, yolinkHomeId: home.id, equipmentId: equipment?.id ?? null, equipmentCode: equipment?.equipmentCode ?? null,
            deviceRegistryId: device.id, sensorRole: assignment.sensorRole, ruleId: repeatedRule.ruleId, ruleGroup: repeatedRule.ruleGroup,
            eventType: repeatedRule.reasonCode.toLowerCase(), severity: repeatedRule.severity, confidence: repeatedRule.confidence,
            message: 'Your HVAC drainage area has experienced multiple water events recently. A preventative inspection may help identify an underlying drainage issue.',
            measurements: { eventsInLast30Days: recentCount }, reasonCode: repeatedRule.reasonCode, reasonCodes: [repeatedRule.reasonCode],
            recommendedActions: repeatedRule.recommendedActions, detectedAt: new Date(),
          }));
        }
      }
    }
  }

  // ── INDOOR-TEMP-001 (CarePlus-eligible) — reuses THSensor.Alert's own
  // alarm.lowTemp/highTemp flags, same as before. ──

  async evaluateIndoorTempEvent(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, alarm: { lowTemp?: boolean; highTemp?: boolean } | undefined, tempF: number | null): Promise<void> {
    const rule = RULE_DEFINITIONS.find((r) => r.ruleId === 'INDOOR-TEMP-001')!;
    const active = await this.findingsRepo.findOne({
      where: { deviceRegistryId: device.id, ruleId: rule.ruleId, status: FindingStatus.ACTIVE },
      order: { detectedAt: 'DESC' },
    });
    if (!alarm?.lowTemp && !alarm?.highTemp) {
      if (active) { active.status = FindingStatus.RESOLVED; active.resolvedAt = new Date(); await this.findingsRepo.save(active); }
      return;
    }
    if (active) return; // already firing — don't re-alert on every report while the condition persists

    const equipment = await this.equipmentFor(assignment);
    const kind = alarm.lowTemp ? 'low' : 'high';
    const reasonCode = kind === 'low' ? 'LOW_INDOOR_TEMP' : 'HIGH_INDOOR_TEMP';
    const message = `${device.currentProviderName ?? 'Indoor sensor'}: ${kind === 'low' ? 'Low' : 'High'} indoor temperature detected${tempF != null ? ` (${tempF}°F)` : ''}`;

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
      event: 'INDOOR-TEMP-001', severity: AlertSeverity.MEDIUM, message, rawPayload: { findingId: finding.id },
    });
    finding.linkedAlertId = alert.id;
    finding.lastAlertedAt = new Date();
    await this.findingsRepo.save(finding);
  }

  // ── SENSOR-002 (low battery) — battery is a 0-4 scale on Yolink's
  // getState response, mapped to a rough 0/25/50/75/100%. ──

  async evaluateSensorBattery(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, batteryRaw: number): Promise<void> {
    const percent = (batteryRaw / 4) * 100;
    if (percent > 20) return;
    const rule = RULE_DEFINITIONS.find((r) => r.ruleId === 'SENSOR-002')!;
    const already = await this.findingsRepo.findOne({ where: { deviceRegistryId: device.id, ruleId: rule.ruleId, status: FindingStatus.ACTIVE } });
    if (already) return;
    const equipment = await this.equipmentFor(assignment);
    await this.findingsRepo.save(this.findingsRepo.create({
      customerId: home.customerId, yolinkHomeId: home.id, equipmentId: equipment?.id ?? null, equipmentCode: equipment?.equipmentCode ?? null,
      deviceRegistryId: device.id, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup, eventType: 'low_battery',
      severity: percent <= 10 ? FindingSeverity.ATTENTION : FindingSeverity.WATCH, confidence: rule.confidence,
      message: `${device.currentProviderName ?? 'Sensor'}: Battery is low — check or replace soon.`,
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
    const due = candidates.filter((f) => !f.snoozedUntil || f.snoozedUntil.getTime() <= now);
    for (const finding of due) {
      try {
        const alert = await this.alertsService.createAlert({
          customerId: finding.customerId, yolinkHomeId: finding.yolinkHomeId,
          deviceId: finding.deviceRegistryId ?? undefined, deviceName: (finding.measurements as any)?.deviceName ?? 'Sensor',
          event: finding.ruleId, severity: FINDING_TO_ALERT_SEVERITY[finding.severity],
          message: `Still active: ${finding.message}`,
          rawPayload: { findingId: finding.id, reAlert: true },
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
}
