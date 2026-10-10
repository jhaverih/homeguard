import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { In, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { DeviceRegistry } from './entities/device-registry.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { Equipment } from './entities/equipment.entity';
import { TelemetryDataQuality, TelemetryEvent } from './entities/telemetry-event.entity';
import { AnalyticsFinding, FindingSeverity, FindingStatus } from './entities/analytics-finding.entity';
import { RuleEvaluation, RuleEvaluationOutcome } from './entities/rule-evaluation.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { SensorRole } from '../common/enums/sensor-role.enum';
import { RULE_DEFINITIONS } from './rule-definitions';
import { ThresholdsService } from './thresholds.service';
import { BaselineService } from './baseline.service';
import { PerformanceEngineService } from './performance-engine.service';
import { WeatherService, UNKNOWN_BAND } from './weather.service';
import { indoorSensorLabel } from './indoor-temp-grouping';
import { isSystemMappingVerified, UNVERIFIED_MAPPING_REASON } from './hvac-configuration';
import {
  CallSample, CycleRecord, Evaluation, LineBaseline, NumSample, SetpointSample, ZoneInputs,
  evaluateCombined, evaluateCoolingPerformance, evaluateExpectedState, evaluateExtendedRuntime, evaluateFrequentCycling,
  evaluateLineTemp, evaluateSetpointProgress, evaluateSustainedHumidity, isStableCooling, parseSetpoint, systemCoolingCycles,
} from './cooling-analytics';
import { RunCycle } from './run-cycles';

// How much history each evaluation loads — enough for the longest window
// (the current cooling run, the 60-min humidity/performance windows, the
// cycling window) without scanning a whole day per reading.
const CONTEXT_HOURS = 6;
const LINE_METRIC: Partial<Record<SensorRole, string>> = {
  [SensorRole.HVAC_SUCTION_LINE_TEMP]: 'SUCTION_LINE_STABLE_COOLING_F',
  [SensorRole.HVAC_LIQUID_LINE_TEMP]: 'LIQUID_LINE_STABLE_COOLING_F',
};
const LINE_RULE: Partial<Record<SensorRole, string>> = {
  [SensorRole.HVAC_SUCTION_LINE_TEMP]: 'HVAC-REFRIGERANT-001',
  [SensorRole.HVAC_LIQUID_LINE_TEMP]: 'HVAC-REFRIGERANT-002',
};
const CYCLE_METRIC = 'COOLING_CYCLE_MINUTES';

export interface Zone {
  key: string;
  label: string;
  temp: DeviceRegistry | null;
  setpoint: DeviceRegistry | null;
  hvac: DeviceRegistry;
  humidity: DeviceRegistry | null;
}

export interface SystemContext {
  equipment: Equipment;
  home: YolinkHome;
  now: Date;
  zones: Zone[];
  series: Map<string, TelemetryEvent[]>; // deviceRegistryId → VALID telemetry, ascending
  cycles: RunCycle[];
  // False when several zones share this equipment but nobody has confirmed
  // that they really do — every zone-combining rule is then skipped.
  canCombineZones: boolean;
}

// Thermostat-driven cooling analytics (spec Rules A–I minus the command
// half of I), layered on the existing engine: same findings table, same
// thresholds, same alert plumbing (PerformanceEngineService.upsertFinding).
// Pure logic lives in cooling-analytics.ts; this service only loads
// telemetry, applies outcomes, and records every evaluation.
@Injectable()
export class CoolingRulesService implements OnModuleInit {
  private readonly logger = new Logger(CoolingRulesService.name);

  constructor(
    @InjectRepository(DeviceRegistry) private registryRepo: Repository<DeviceRegistry>,
    @InjectRepository(SensorAssignment) private assignmentsRepo: Repository<SensorAssignment>,
    @InjectRepository(Equipment) private equipmentRepo: Repository<Equipment>,
    @InjectRepository(TelemetryEvent) private telemetryRepo: Repository<TelemetryEvent>,
    @InjectRepository(AnalyticsFinding) private findingsRepo: Repository<AnalyticsFinding>,
    @InjectRepository(RuleEvaluation) private evaluationsRepo: Repository<RuleEvaluation>,
    @InjectRepository(YolinkHome) private yolinkHomesRepo: Repository<YolinkHome>,
    private thresholds: ThresholdsService,
    private baselines: BaselineService,
    private performanceEngine: PerformanceEngineService,
    private weather: WeatherService,
  ) {}

  onModuleInit() {
    this.supersedeOldFindings().catch((e) => this.logger.warn(`Could not supersede old-version findings: ${e.message}`));
  }

  // Findings raised by the previous logic of a rewritten rule (e.g.
  // REFRIGERANT-001 v1 compared idle line temperatures against an all-hours
  // baseline) are resolved once, marked superseded rather than deleted, so
  // only the new evidence-based logic drives current status. Power-meter
  // findings are left alone — that path's logic didn't change.
  async supersedeOldFindings(): Promise<number> {
    const rewritten = RULE_DEFINITIONS.filter((r) => r.recordsEvaluations && (r.version ?? 1) > 1);
    const powerRoles = new Set([SensorRole.HVAC_POWER, SensorRole.HVAC_COMPRESSOR_POWER, SensorRole.HVAC_BLOWER_POWER]);
    const stale = (await this.findingsRepo.find({ where: { ruleId: In(rewritten.map((r) => r.ruleId)), status: FindingStatus.ACTIVE } }))
      .filter((f) => (f.ruleVersion ?? 1) < (rewritten.find((r) => r.ruleId === f.ruleId)!.version ?? 1) && !(f.sensorRole && powerRoles.has(f.sensorRole)));
    for (const f of stale) {
      f.status = FindingStatus.RESOLVED;
      f.resolvedAt = new Date();
      f.measurements = { ...(f.measurements ?? {}), supersededBy: `v${rewritten.find((r) => r.ruleId === f.ruleId)!.version}` };
      await this.findingsRepo.save(f);
    }
    if (stale.length) this.logger.log(`Superseded ${stale.length} finding(s) raised by the previous version of rewritten rules`);
    return stale.length;
  }

  // ── entry points ──────────────────────────────────────────────────────────

  // After any thermostat reading (temperature, humidity, call state, setpoint).
  async onThermostatReading(assignment: SensorAssignment, home: YolinkHome): Promise<void> {
    if (!assignment.equipmentId) return;
    await this.evaluateEquipment(assignment.equipmentId, home);
  }

  // After a refrigerant-line probe reading.
  async onLineTempReading(assignment: SensorAssignment, home: YolinkHome): Promise<void> {
    if (!assignment.equipmentId) return;
    await this.evaluateEquipment(assignment.equipmentId, home);
  }

  // Time-based conditions (a quiet probe, an unchanging temperature) must
  // still be re-evaluated when no new event arrives.
  @Cron('30 */5 * * * *')
  async evaluateAll(): Promise<void> {
    const hvacAssignments = await this.assignmentsRepo.find({ where: { sensorRole: SensorRole.HVAC_STATE } });
    const equipmentIds = [...new Set(hvacAssignments.map((a) => a.equipmentId).filter((id): id is string => !!id))];
    for (const equipmentId of equipmentIds) {
      try {
        const equipment = await this.equipmentRepo.findOne({ where: { id: equipmentId } });
        const home = equipment ? await this.homeFor(equipment.homeId) : null;
        if (home) await this.evaluateEquipment(equipmentId, home);
      } catch (err: any) {
        this.logger.warn(`Cooling analytics failed for equipment ${equipmentId}: ${err.message}`);
      }
    }
  }

  async evaluateEquipment(equipmentId: string, home: YolinkHome, now = new Date()): Promise<void> {
    const ctx = await this.loadContext(equipmentId, home, now);
    if (!ctx) return;
    for (const zone of ctx.zones) await this.evaluateZone(ctx, zone);
    await this.evaluateSystem(ctx);
  }

  // ── context ───────────────────────────────────────────────────────────────

  async loadContext(equipmentId: string, home: YolinkHome, now: Date): Promise<SystemContext | null> {
    const equipment = await this.equipmentRepo.findOne({ where: { id: equipmentId } });
    if (!equipment) return null;
    const hvacAssignments = await this.assignmentsRepo.find({ where: { equipmentId, sensorRole: SensorRole.HVAC_STATE } });
    if (hvacAssignments.length === 0) return null;
    const hvacDevices = await this.registryRepo.find({ where: { id: In(hvacAssignments.map((a) => a.deviceRegistryId)) } });

    // A Nest thermostat's channels share the "<sdmDeviceId>:" prefix
    // (NestService.CHANNEL_SPECS) — that prefix is the zone.
    const zones: Zone[] = [];
    for (const hvac of hvacDevices) {
      const key = hvac.providerDeviceId.split(':')[0];
      const siblings = await this.registryRepo.find({
        where: { provider: hvac.provider, providerDeviceId: In([`${key}:temperature`, `${key}:setpoint`, `${key}:humidity`]) },
      });
      const pick = (kind: string) => siblings.find((d) => d.providerDeviceId === `${key}:${kind}`) ?? null;
      const temp = pick('temperature');
      zones.push({ key, label: indoorSensorLabel(temp ?? hvac), temp, setpoint: pick('setpoint'), hvac, humidity: pick('humidity') });
    }

    const lineAssignments = await this.assignmentsRepo.find({ where: { equipmentId, sensorRole: In([SensorRole.HVAC_SUCTION_LINE_TEMP, SensorRole.HVAC_LIQUID_LINE_TEMP, SensorRole.HVAC_DRAIN_WATER]) } });
    const deviceIds = [
      ...zones.flatMap((z) => [z.temp?.id, z.setpoint?.id, z.hvac.id, z.humidity?.id]),
      ...lineAssignments.map((a) => a.deviceRegistryId),
    ].filter((id): id is string => !!id);
    const since = new Date(now.getTime() - CONTEXT_HOURS * 3600_000);
    const rows = await this.telemetryRepo.find({
      where: { deviceRegistryId: In(deviceIds), observedAt: MoreThan(since), dataQuality: TelemetryDataQuality.VALID },
      order: { observedAt: 'ASC' },
    });
    const series = new Map<string, TelemetryEvent[]>();
    // Setpoints and call state are recorded only on change, so the value in
    // effect at the window start is usually an older row — carry each
    // device's last reading before the window in as its starting point.
    for (const id of deviceIds) {
      const before = await this.telemetryRepo.findOne({
        where: { deviceRegistryId: id, observedAt: LessThanOrEqual(since), dataQuality: TelemetryDataQuality.VALID },
        order: { observedAt: 'DESC' },
      });
      if (before) series.set(id, [before]);
    }
    for (const r of rows) {
      if (r.observedAt > now) continue;
      const list = series.get(r.deviceRegistryId) ?? [];
      list.push(r);
      series.set(r.deviceRegistryId, list);
    }

    const canCombineZones = zones.length <= 1 || isSystemMappingVerified(equipment);
    const cycles = canCombineZones ? systemCoolingCycles(zones.map((z) => this.calls(series, z))) : [];
    return { equipment, home, now, zones, series, cycles, canCombineZones };
  }

  num(series: Map<string, TelemetryEvent[]>, device: DeviceRegistry | null): NumSample[] {
    if (!device) return [];
    return (series.get(device.id) ?? []).filter((r) => r.numericValue != null).map((r) => ({ t: r.observedAt, v: Number(r.numericValue) }));
  }

  calls(series: Map<string, TelemetryEvent[]>, zone: Zone): CallSample[] {
    return (series.get(zone.hvac.id) ?? [])
      .filter((r) => r.value === 'COOLING' || r.value === 'HEATING' || r.value === 'OFF')
      .map((r) => ({ t: r.observedAt, call: r.value as CallSample['call'] }));
  }

  setpoints(series: Map<string, TelemetryEvent[]>, zone: Zone): SetpointSample[] {
    return zone.setpoint ? (series.get(zone.setpoint.id) ?? []).map((r) => parseSetpoint(r.value, r.observedAt)) : [];
  }

  private async homeFor(homeId: string): Promise<YolinkHome | null> {
    return this.yolinkHomesRepo.findOne({ where: { homeId, isActive: true } });
  }

  // ── rule application ──────────────────────────────────────────────────────

  async apply(ctx: SystemContext, p: {
    ruleId: string; scopeDevice: DeviceRegistry | null; sensorRole: SensorRole; evaluation: Evaluation;
    message: (e: Evaluation) => string; severity?: FindingSeverity;
    // Zone rules about an active cooling call resolve when the call ends;
    // others (line temps, humidity) keep their state until re-assessed.
    resolveWhenNotApplicable?: boolean;
  }): Promise<void> {
    const rule = RULE_DEFINITIONS.find((r) => r.ruleId === p.ruleId)!;
    const scopeKey = p.scopeDevice ? `device:${p.scopeDevice.id}` : `equipment:${ctx.equipment.id}`;
    const { outcome } = p.evaluation;
    if (outcome !== 'NOT_APPLICABLE') await this.recordEvaluation(ctx, scopeKey, rule.ruleId, rule.version ?? 1, p.evaluation);
    else await this.refreshStaleInsufficient(scopeKey, rule.ruleId, p.evaluation.reason ?? 'Not applicable right now', ctx.now);

    const decided = outcome === 'TRIGGERED' || outcome === 'CLEAR' || (outcome === 'NOT_APPLICABLE' && p.resolveWhenNotApplicable);
    if (!decided) return;
    await this.performanceEngine.upsertFinding({
      scope: p.scopeDevice ? { deviceRegistryId: p.scopeDevice.id } : { equipmentId: ctx.equipment.id },
      equipmentId: ctx.equipment.id,
      customerId: ctx.home.customerId, yolinkHomeId: ctx.home.id, equipmentCode: ctx.equipment.equipmentCode,
      sensorRole: p.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
      conditionMet: outcome === 'TRIGGERED', severity: p.severity ?? rule.severity, confidence: rule.confidence,
      message: outcome === 'TRIGGERED' ? p.message(p.evaluation) : rule.label,
      measurements: p.evaluation.evidence, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
      notify: rule.notificationPolicy === 'IMMEDIATE',
      dataQuality: { evaluatedAt: ctx.now.toISOString(), outcome, zonesCombined: ctx.zones.length > 1 && ctx.canCombineZones },
    });
  }

  // A NOT_APPLICABLE pass never overwrites real evidence (CLEAR/TRIGGERED),
  // but an earlier "can't assess because…" must not keep showing an
  // outdated reason (e.g. "mapping not confirmed" after it was confirmed).
  private async refreshStaleInsufficient(scopeKey: string, ruleId: string, reason: string, now: Date): Promise<void> {
    const row = await this.evaluationsRepo.findOne({ where: { scopeKey, ruleId } });
    if (!row || row.outcome !== RuleEvaluationOutcome.INSUFFICIENT_DATA || row.reason === reason) return;
    row.reason = reason;
    row.evaluatedAt = now;
    await this.evaluationsRepo.save(row);
  }

  private async recordEvaluation(ctx: SystemContext, scopeKey: string, ruleId: string, ruleVersion: number, e: Evaluation): Promise<void> {
    const outcome = RuleEvaluationOutcome[e.outcome as keyof typeof RuleEvaluationOutcome];
    let row = await this.evaluationsRepo.findOne({ where: { scopeKey, ruleId } });
    if (!row) row = this.evaluationsRepo.create({ scopeKey, ruleId });
    const previousInputs = row.inputs ?? {};
    Object.assign(row, {
      customerId: ctx.home.customerId, homeId: ctx.equipment.homeId, equipmentId: ctx.equipment.id, ruleVersion,
      outcome, reason: e.reason ?? null, inputs: { ...previousInputs, ...e.evidence }, evaluatedAt: ctx.now,
    });
    await this.evaluationsRepo.save(row);
  }

  async thresholdsFor(customerId: string, keys: string[]): Promise<Record<string, number>> {
    const values = await Promise.all(keys.map((k) => this.thresholds.getValue(k, customerId)));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  }

  // ── zone rules (A, H, I) ──────────────────────────────────────────────────
  // Implemented in evaluateZone below; system rules (B, C, D/E, F, G) in
  // evaluateSystem.

  async evaluateZone(ctx: SystemContext, zone: Zone): Promise<void> {
    const t = await this.thresholdsFor(ctx.home.customerId, [
      'NEST_STALE_MINUTES', 'LINE_TEMP_MAX_HOLD_MINUTES',
      'COOLING_PERF_MIN_ACTIVE_MINUTES', 'COOLING_PERF_ERROR_F', 'COOLING_PERF_MIN_PROGRESS_F',
      'PROGRESS_CHECK_MINUTES', 'PROGRESS_MIN_INITIAL_ERROR_F', 'PROGRESS_MIN_DECREASE_F',
      'EXPECTED_STATE_ERROR_F', 'EXPECTED_STATE_GRACE_MINUTES', 'SETPOINT_CHANGE_EXCLUSION_MINUTES',
    ]);
    const z: ZoneInputs = {
      now: ctx.now, temps: this.num(ctx.series, zone.temp), setpoints: this.setpoints(ctx.series, zone), calls: this.calls(ctx.series, zone),
      online: zone.hvac.connectivity !== 'OFFLINE', tempStaleMinutes: t.NEST_STALE_MINUTES,
    };
    const hold = t.LINE_TEMP_MAX_HOLD_MINUTES;
    const scope = zone.temp ?? zone.hvac;

    await this.apply(ctx, {
      ruleId: 'HVAC-COMFORT-001', scopeDevice: scope, sensorRole: SensorRole.INDOOR_AMBIENT_TEMP, resolveWhenNotApplicable: true,
      evaluation: evaluateCoolingPerformance(z, { minActiveMinutes: t.COOLING_PERF_MIN_ACTIVE_MINUTES, errorF: t.COOLING_PERF_ERROR_F, minProgressF: t.COOLING_PERF_MIN_PROGRESS_F, holdMinutes: hold }),
      message: (e) => `${zone.label}: Your HVAC system is taking longer than usual to approach the cooling setpoint. It has been cooling for ${e.evidence.activeMinutes} minutes and the temperature is still ${e.evidence.currentErrorF}°F above the ${e.evidence.coolSetpointF}°F setpoint (down only ${Math.max(0, e.evidence.progressF)}°F in the last hour).`,
    });
    await this.apply(ctx, {
      ruleId: 'HVAC-COMFORT-003', scopeDevice: scope, sensorRole: SensorRole.INDOOR_AMBIENT_TEMP, resolveWhenNotApplicable: true,
      evaluation: evaluateSetpointProgress(z, { checkAfterMinutes: t.PROGRESS_CHECK_MINUTES, minInitialErrorF: t.PROGRESS_MIN_INITIAL_ERROR_F, minDecreaseF: t.PROGRESS_MIN_DECREASE_F, holdMinutes: hold }),
      message: (e) => `${zone.label}: The temperature hasn't started moving toward the ${e.evidence.coolSetpointF}°F setpoint after ${e.evidence.activeMinutes} minutes of cooling (down ${Math.max(0, e.evidence.decreaseF)}°F). Worth keeping an eye on; this alone doesn't mean anything has failed.`,
    });
    await this.apply(ctx, {
      ruleId: 'HVAC-STATE-001', scopeDevice: zone.hvac, sensorRole: SensorRole.HVAC_STATE, resolveWhenNotApplicable: true,
      evaluation: evaluateExpectedState(z, { errorF: t.EXPECTED_STATE_ERROR_F, graceMinutes: t.EXPECTED_STATE_GRACE_MINUTES, exclusionMinutes: t.SETPOINT_CHANGE_EXCLUSION_MINUTES, holdMinutes: hold }),
      message: (e) => `${zone.label}: Expected operating state not observed. The thermostat is in ${e.evidence.mode === 'HEATCOOL' ? 'Heat·Cool' : 'Cool'} mode and more than ${t.EXPECTED_STATE_ERROR_F}°F above its ${e.evidence.coolSetpointF}°F cooling setpoint, but it hasn't reported a cooling call for ${e.evidence.windowMinutes} minutes.`,
    });
  }

  // ── system rules (B, C, D/E, G, F) ───────────────────────────────────────

  async evaluateSystem(ctx: SystemContext): Promise<void> {
    const insufficient = (reason: string): Evaluation => ({ outcome: 'INSUFFICIENT_DATA', reason, evidence: {} });
    const t = await this.thresholdsFor(ctx.home.customerId, [
      'COOLING_STARTS_MAX', 'COOLING_STARTS_WINDOW_MINUTES', 'SETPOINT_CHANGE_EXCLUSION_MINUTES',
      'RUNTIME_EXCESS_PERCENT', 'RUNTIME_MIN_COMPARABLE_CYCLES', 'RUNTIME_BASELINE_MIN_CYCLES',
      'LINE_TEMP_STABILIZATION_MINUTES', 'LINE_TEMP_DEVIATION_F', 'LINE_TEMP_SUSTAINED_MINUTES', 'LINE_TEMP_MAX_HOLD_MINUTES', 'LINE_TEMP_BASELINE_MIN_SAMPLES',
      'HUMIDITY_SUSTAINED_PERCENT', 'HUMIDITY_SUSTAINED_MINUTES', 'HUMIDITY_MIN_COOLING_FRACTION_PERCENT', 'NEST_STALE_MINUTES',
      'COMBINED_ALIGNMENT_HOURS',
    ]);
    const setpointChanges = ctx.zones.flatMap((z) => this.setpoints(ctx.series, z).map((s) => s.t)).sort((a, b) => a.getTime() - b.getTime());
    const hasCalls = ctx.zones.some((z) => this.calls(ctx.series, z).length > 0);

    // Rule C — frequent cycling.
    await this.apply(ctx, {
      ruleId: 'HVAC-RUNTIME-003', scopeDevice: null, sensorRole: SensorRole.HVAC_STATE,
      evaluation: !ctx.canCombineZones ? insufficient(UNVERIFIED_MAPPING_REASON)
        : !hasCalls ? insufficient('Thermostat does not report its heating/cooling action')
        : evaluateFrequentCycling(ctx.cycles, setpointChanges, ctx.now, { maxStarts: t.COOLING_STARTS_MAX, windowMinutes: t.COOLING_STARTS_WINDOW_MINUTES, exclusionMinutes: t.SETPOINT_CHANGE_EXCLUSION_MINUTES }),
      message: (e) => `Your HVAC system started cooling ${e.evidence.coolingStarts} times in the last ${e.evidence.windowMinutes} minutes — more often than expected. This is worth investigating, but on its own it doesn't mean a component has failed.`,
    });

    // Rule B — extended runtime (per completed cycle, comparable outdoor band).
    if (!ctx.canCombineZones) {
      await this.apply(ctx, { ruleId: 'HVAC-RUNTIME-001', scopeDevice: null, sensorRole: SensorRole.HVAC_STATE, evaluation: insufficient(UNVERIFIED_MAPPING_REASON), message: () => '' });
    } else {
      await this.recordCompletedCycles(ctx, setpointChanges, t.SETPOINT_CHANGE_EXCLUSION_MINUTES);
      const all = (await this.baselines.getRecentSamples(ctx.equipment.id, CYCLE_METRIC, 30)).map((s) => ({
        minutes: s.value, band: (s.context as any)?.band ?? UNKNOWN_BAND, setpointChanged: !!(s.context as any)?.setpointChanged, end: s.observedAt,
      } as CycleRecord));
      const recent = all.slice(-t.RUNTIME_MIN_COMPARABLE_CYCLES);
      const baseline = all.slice(0, Math.max(0, all.length - t.RUNTIME_MIN_COMPARABLE_CYCLES));
      await this.apply(ctx, {
        ruleId: 'HVAC-RUNTIME-001', scopeDevice: null, sensorRole: SensorRole.HVAC_STATE,
        evaluation: evaluateExtendedRuntime(recent, baseline, { excessPercent: t.RUNTIME_EXCESS_PERCENT, consecutive: t.RUNTIME_MIN_COMPARABLE_CYCLES, minBaselineCycles: t.RUNTIME_BASELINE_MIN_CYCLES }),
        message: (e) => `Recent cooling cycles are running longer than usual — the last ${e.evidence.recentCycleMinutes.length} ran ${e.evidence.recentCycleMinutes.join(', ')} minutes versus about ${e.evidence.baselineMedianMinutes} minutes normally under similar outdoor conditions.`,
      });
    }

    // Rules D/E — refrigerant line temperatures.
    await this.evaluateLineTemps(ctx, t);

    // Rule G — sustained humidity, per zone thermostat.
    const drainWet = await this.drainPanWetRecently(ctx);
    for (const zone of ctx.zones) {
      if (!zone.humidity) continue;
      await this.apply(ctx, {
        ruleId: 'HVAC-HUMIDITY-001', scopeDevice: zone.humidity, sensorRole: SensorRole.INDOOR_AMBIENT_HUMIDITY,
        evaluation: !ctx.canCombineZones ? insufficient(UNVERIFIED_MAPPING_REASON)
          : this.withDrain(evaluateSustainedHumidity(this.num(ctx.series, zone.humidity), ctx.cycles, ctx.now, {
            thresholdPercent: t.HUMIDITY_SUSTAINED_PERCENT, sustainedMinutes: t.HUMIDITY_SUSTAINED_MINUTES, minCoolingFraction: t.HUMIDITY_MIN_COOLING_FRACTION_PERCENT,
            holdMinutes: t.LINE_TEMP_MAX_HOLD_MINUTES, staleMinutes: t.NEST_STALE_MINUTES,
          }), drainWet),
        message: (e) => `${zone.label}: Indoor humidity has remained elevated during cooling — above ${t.HUMIDITY_SUSTAINED_PERCENT}% for ${t.HUMIDITY_SUSTAINED_MINUTES}+ minutes (now ${e.evidence.currentHumidity}%).${e.evidence.drainPanWater ? ' The HVAC drain-pan sensor has also detected water — inspect the drain system promptly.' : ''} Checking the air filter, vents and condensate drain is a good first step.`,
      });
    }

    // Rule F — combined, last, over whatever the rules above decided.
    const active = await this.findingsRepo.find({ where: { equipmentId: ctx.equipment.id, status: FindingStatus.ACTIVE } });
    const combined = evaluateCombined(active.map((f) => ({ ruleId: f.ruleId, detectedAt: f.detectedAt })), ctx.now, { alignmentHours: t.COMBINED_ALIGNMENT_HOURS });
    await this.apply(ctx, {
      ruleId: 'HVAC-COMBINED-004', scopeDevice: null, sensorRole: SensorRole.HVAC_STATE, evaluation: combined,
      severity: combined.symptoms.length >= 3 ? FindingSeverity.HIGH : FindingSeverity.ATTENTION,
      message: () => `Multiple indicators suggest that an HVAC inspection may be appropriate: ${combined.symptoms.map(symptomLabel).join(', ')}.`,
    });
  }

  private withDrain(e: Evaluation, drainWet: boolean): Evaluation {
    return { ...e, evidence: { ...e.evidence, drainPanWater: drainWet } };
  }

  private async drainPanWetRecently(ctx: SystemContext): Promise<boolean> {
    const drains = await this.assignmentsRepo.find({ where: { equipmentId: ctx.equipment.id, sensorRole: SensorRole.HVAC_DRAIN_WATER } });
    return drains.some((d) => (ctx.series.get(d.deviceRegistryId) ?? []).some((r) => r.value === 'DETECTED'));
  }

  // Each newly completed whole-system cooling cycle becomes one baseline
  // sample, tagged with its outdoor band and whether a setpoint changed
  // during it — recorded once (tracked by the last recorded end).
  private async recordCompletedCycles(ctx: SystemContext, setpointChanges: Date[], exclusionMinutes: number): Promise<void> {
    const marker = await this.evaluationsRepo.findOne({ where: { scopeKey: `equipment:${ctx.equipment.id}`, ruleId: 'HVAC-RUNTIME-001' } });
    const lastEnd = marker?.inputs?.lastRecordedCycleEnd ? new Date(marker.inputs.lastRecordedCycleEnd) : new Date(0);
    let newest = lastEnd;
    for (const c of ctx.cycles) {
      if (!c.end || c.end <= lastEnd || c.durationMinutes == null) continue;
      const setpointChanged = setpointChanges.some((s) => s.getTime() >= c.start.getTime() - exclusionMinutes * 60_000 && s <= c.end!);
      const band = await this.weather.outdoorBandAt(ctx.equipment.homeId, c.start);
      await this.baselines.recordSample(ctx.home.customerId, ctx.equipment.id, CYCLE_METRIC, c.durationMinutes, c.end, { band, setpointChanged, start: c.start.toISOString() });
      if (c.end > newest) newest = c.end;
    }
    if (newest > lastEnd) {
      await this.recordEvaluation(ctx, `equipment:${ctx.equipment.id}`, 'HVAC-RUNTIME-001', 2, {
        outcome: (marker?.outcome as any) ?? 'BASELINE_COLLECTING', reason: marker?.reason ?? 'Baseline collecting', evidence: { lastRecordedCycleEnd: newest.toISOString() },
      });
    }
  }

  private async evaluateLineTemps(ctx: SystemContext, t: Record<string, number>): Promise<void> {
    const lines = await this.assignmentsRepo.find({ where: { equipmentId: ctx.equipment.id, sensorRole: In([SensorRole.HVAC_SUCTION_LINE_TEMP, SensorRole.HVAC_LIQUID_LINE_TEMP]) } });
    for (const assignment of lines) {
      const device = await this.registryRepo.findOne({ where: { id: assignment.deviceRegistryId } });
      if (!device) continue;
      const which = assignment.sensorRole === SensorRole.HVAC_SUCTION_LINE_TEMP ? 'suction' : 'liquid';
      const ruleId = LINE_RULE[assignment.sensorRole]!;
      if (!ctx.canCombineZones) {
        await this.apply(ctx, { ruleId, scopeDevice: device, sensorRole: assignment.sensorRole, evaluation: { outcome: 'INSUFFICIENT_DATA', reason: UNVERIFIED_MAPPING_REASON, evidence: {} }, message: () => '' });
        continue;
      }
      const samples = this.num(ctx.series, device);
      const band = await this.weather.outdoorBandAt(ctx.equipment.homeId, ctx.now);
      const baseline = await this.lineBaseline(ctx, assignment.sensorRole, band);
      const evaluation = evaluateLineTemp(samples, ctx.cycles, ctx.now, baseline, {
        stabilizationMinutes: t.LINE_TEMP_STABILIZATION_MINUTES, deviationF: t.LINE_TEMP_DEVIATION_F, sustainedMinutes: t.LINE_TEMP_SUSTAINED_MINUTES,
        holdMinutes: t.LINE_TEMP_MAX_HOLD_MINUTES, minSamples: t.LINE_TEMP_BASELINE_MIN_SAMPLES,
      });
      await this.recordStableSample(ctx, assignment.sensorRole, samples, band, baseline, t);
      await this.apply(ctx, {
        ruleId, scopeDevice: device, sensorRole: assignment.sensorRole, evaluation,
        message: (e) => `The ${which}-line temperature differs from the system's normal pattern — ${e.evidence.currentF}°F versus about ${e.evidence.baselineF}°F during stable cooling, for ${e.evidence.sustainedMinutes}+ minutes. This is an abnormal operating pattern, not a diagnosis; an HVAC professional can check it.`,
      });
    }
  }

  // Baseline = stable-cooling readings from previous cooling runs in the
  // same outdoor band, excluding readings that were themselves anomalous.
  async lineBaseline(ctx: SystemContext, role: SensorRole, band: string): Promise<LineBaseline | null> {
    const currentRun = ctx.cycles.find((c) => c.end == null)?.start.toISOString();
    const samples = (await this.baselines.getRecentSamples(ctx.equipment.id, LINE_METRIC[role]!, 30))
      .filter((s) => !(s.context as any)?.anomalous && (s.context as any)?.cycleStart !== currentRun)
      .filter((s) => band === UNKNOWN_BAND || ((s.context as any)?.band ?? UNKNOWN_BAND) === band);
    if (samples.length === 0) return null;
    const meanF = samples.reduce((sum, s) => sum + s.value, 0) / samples.length;
    return { meanF, samples: samples.length, cycles: new Set(samples.map((s) => (s.context as any)?.cycleStart)).size };
  }

  // One baseline sample per new line reading taken during stable cooling.
  private async recordStableSample(ctx: SystemContext, role: SensorRole, samples: NumSample[], band: string, baseline: LineBaseline | null, t: Record<string, number>): Promise<void> {
    const latest = samples[samples.length - 1];
    if (!latest) return;
    const cycle = isStableCooling(ctx.cycles, latest.t, t.LINE_TEMP_STABILIZATION_MINUTES);
    if (!cycle) return;
    const metric = LINE_METRIC[role]!;
    const recent = await this.baselines.getRecentSamples(ctx.equipment.id, metric, 1);
    if (recent.some((s) => s.observedAt.getTime() === latest.t.getTime())) return;
    const anomalous = baseline != null && baseline.samples >= t.LINE_TEMP_BASELINE_MIN_SAMPLES && Math.abs(latest.v - baseline.meanF) >= t.LINE_TEMP_DEVIATION_F;
    await this.baselines.recordSample(ctx.home.customerId, ctx.equipment.id, metric, latest.v, latest.t, { band, cycleStart: cycle.start.toISOString(), anomalous });
  }
}

function symptomLabel(s: string): string {
  return ({
    TEMPERATURE_RESPONSE: 'cooling is slow to approach the setpoint',
    RUNTIME: 'cooling cycles are running longer than usual',
    CYCLING: 'cooling is starting and stopping more often than expected',
    REFRIGERANT_LINE: 'a refrigerant-line temperature differs from its normal pattern',
    HUMIDITY: 'indoor humidity stays high during cooling',
  } as Record<string, string>)[s] ?? s.toLowerCase();
}
