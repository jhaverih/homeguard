import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnalyticsFinding, FindingSeverity, FindingConfidence, FindingStatus } from './entities/analytics-finding.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { Equipment } from './entities/equipment.entity';
import { TelemetryEvent } from './entities/telemetry-event.entity';
import { Home } from './entities/home.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { SensorRole, SENSOR_ROLE_META } from '../common/enums/sensor-role.enum';
import { RULE_DEFINITIONS, RuleDefinition } from './rule-definitions';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/entities/alert.entity';
import { ThresholdsService } from './thresholds.service';
import { BaselineService } from './baseline.service';
import { SNOOZABLE_FINDING_CATEGORY } from './analytics-engine.service';

// Everything in this file is genuinely new logic, built ahead of any of
// these sensors actually being installed anywhere (per explicit product
// direction — "implement all the rules and logic even without the sensors
// installed" — so it's ready to activate the instant a device is tagged,
// not gated on a future release). Two evaluation styles, matching each
// rule's own `needsBaseline`/immediacy shape in rule-definitions.ts:
//  - Event-driven (called from YolinkService per MQTT report): fixed-
//    threshold rules that make sense to catch the moment a reading arrives
//    (delta-T, voltage, unexpected power loss, sensor plausibility).
//  - Daily cron (runDailyTrendAnalysis): anything needsBaseline:true — a
//    single reading is meaningless without this home's own rolling
//    history, so these only make sense evaluated in batch once enough of
//    a day's data exists.
//
// A handful of raw payload field names below (data.power, data.voltage,
// data.pressure, data.setTemp) are best-effort guesses at typical YoLink
// PowerMeter/Outlet/Thermostat/pressure-sensor payload shapes — there is
// no real device of these types on any home yet to verify field names
// against. Flagged inline; verify against a real payload once hardware
// exists and adjust in YolinkService's parsing, not here.
@Injectable()
export class PerformanceEngineService {
  private readonly logger = new Logger(PerformanceEngineService.name);

  constructor(
    @InjectRepository(AnalyticsFinding) private findingsRepo: Repository<AnalyticsFinding>,
    @InjectRepository(Equipment) private equipmentRepo: Repository<Equipment>,
    @InjectRepository(DeviceRegistry) private deviceRegistryRepo: Repository<DeviceRegistry>,
    @InjectRepository(SensorAssignment) private assignmentsRepo: Repository<SensorAssignment>,
    @InjectRepository(TelemetryEvent) private telemetryRepo: Repository<TelemetryEvent>,
    @InjectRepository(Home) private homeRepo: Repository<Home>,
    @InjectRepository(YolinkHome) private yolinkHomeRepo: Repository<YolinkHome>,
    private alertsService: AlertsService,
    private thresholdsService: ThresholdsService,
    private baselineService: BaselineService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════
  // Event-driven — called from YolinkService.evaluateIotAnalytics per report
  // ══════════════════════════════════════════════════════════════════════

  // HVAC-COOL-001 / HVAC-HEAT-001 — fires the moment a fresh return+supply
  // pair is available; also records a COOLING_DELTA_T/HEATING_DELTA_T
  // sample every time, which is what feeds COOL-002/003/004's baselines.
  // Mode (cooling vs. heating) is inferred from which side is colder —
  // there's no explicit thermostat-mode telemetry wired yet, so this is a
  // documented heuristic, not a real mode reading.
  async handleReturnOrSupplyTempReading(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, tempF: number | null, observedAt: Date): Promise<void> {
    if (tempF == null || !assignment.equipmentId) return;
    await this.evaluatePlausibility(device, assignment, home, tempF, 'PLAUSIBLE_TEMP_MIN_F', 'PLAUSIBLE_TEMP_MAX_F', '°F');

    const otherRole = assignment.sensorRole === SensorRole.HVAC_RETURN_TEMP ? SensorRole.HVAC_SUPPLY_TEMP : SensorRole.HVAC_RETURN_TEMP;
    const otherAssignment = await this.assignmentsRepo.findOne({ where: { equipmentId: assignment.equipmentId, sensorRole: otherRole } });
    if (!otherAssignment) return; // only one of the pair installed — nothing to pair yet

    const freshnessMinutes = await this.thresholdsService.getValue('TELEMETRY_PAIRING_FRESHNESS_MINUTES', home.customerId);
    const since = new Date(observedAt.getTime() - freshnessMinutes * 60000);
    const otherReading = await this.telemetryRepo.findOne({
      where: { deviceRegistryId: otherAssignment.deviceRegistryId, observedAt: MoreThan(since) },
      order: { observedAt: 'DESC' },
    });
    if (!otherReading?.numericValue) return;

    const returnTemp = assignment.sensorRole === SensorRole.HVAC_RETURN_TEMP ? tempF : Number(otherReading.numericValue);
    const supplyTemp = assignment.sensorRole === SensorRole.HVAC_SUPPLY_TEMP ? tempF : Number(otherReading.numericValue);
    const deltaT = returnTemp - supplyTemp;
    const isCooling = deltaT > 0; // supply colder than return
    const equipment = await this.equipmentRepo.findOne({ where: { id: assignment.equipmentId } });

    await this.baselineService.recordSample(home.customerId, assignment.equipmentId, isCooling ? 'COOLING_DELTA_T' : 'HEATING_DELTA_T', Math.abs(deltaT), observedAt, { returnTemp, supplyTemp });

    const ruleId = isCooling ? 'HVAC-COOL-001' : 'HVAC-HEAT-001';
    const thresholdKey = isCooling ? 'COOLING_DELTA_T_MIN_F' : 'HEATING_DELTA_T_MIN_F';
    const minDeltaT = await this.thresholdsService.getValue(thresholdKey, home.customerId);
    const rule = this.rule(ruleId);
    await this.upsertFinding({
      scope: { equipmentId: assignment.equipmentId }, customerId: home.customerId, yolinkHomeId: home.id,
      equipmentCode: equipment?.equipmentCode ?? null, sensorRole: assignment.sensorRole, ruleId, ruleGroup: rule.ruleGroup,
      conditionMet: Math.abs(deltaT) < minDeltaT,
      severity: rule.severity, confidence: rule.confidence,
      message: `${isCooling ? 'Cooling' : 'Heating'} performance looks weaker than expected — ${Math.abs(deltaT).toFixed(1)}°F difference between return and supply air (expected at least ${minDeltaT}°F).`,
      measurements: { deltaT: Math.abs(deltaT), returnTemp, supplyTemp, minDeltaT }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
      notify: rule.notificationPolicy === 'IMMEDIATE',
    });
  }

  // HVAC_POWER / HVAC_COMPRESSOR_POWER / HVAC_BLOWER_POWER — records a
  // sample for baseline rules, and evaluates the two fixed-threshold
  // electrical rules immediately. `voltage` is best-effort: some YoLink
  // Outlet/PowerMeter payloads report it alongside power draw, but this is
  // unverified against a real device.
  async handlePowerReading(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, watts: number | null, voltage: number | null, observedAt: Date): Promise<void> {
    if (watts == null || !assignment.equipmentId) return;
    await this.evaluatePlausibility(device, assignment, home, watts, undefined, 'PLAUSIBLE_POWER_MAX_WATTS', 'W');

    const metricKey = assignment.sensorRole === SensorRole.HVAC_COMPRESSOR_POWER ? 'COMPRESSOR_POWER_SAMPLE'
      : assignment.sensorRole === SensorRole.HVAC_BLOWER_POWER ? 'BLOWER_POWER_SAMPLE' : 'HVAC_POWER_SAMPLE';
    await this.baselineService.recordSample(home.customerId, assignment.equipmentId, metricKey, watts, observedAt);

    const equipment = await this.equipmentRepo.findOne({ where: { id: assignment.equipmentId } });

    // HVAC-ELECTRICAL-001 — voltage out of range (only evaluated when the
    // device actually reports voltage).
    if (voltage != null) {
      const [minV, maxV] = await Promise.all([
        this.thresholdsService.getValue('ELECTRICAL_VOLTAGE_MIN', home.customerId),
        this.thresholdsService.getValue('ELECTRICAL_VOLTAGE_MAX', home.customerId),
      ]);
      const rule = this.rule('HVAC-ELECTRICAL-001');
      await this.upsertFinding({
        scope: { equipmentId: assignment.equipmentId }, customerId: home.customerId, yolinkHomeId: home.id,
        equipmentCode: equipment?.equipmentCode ?? null, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
        conditionMet: voltage < minV || voltage > maxV, severity: rule.severity, confidence: rule.confidence,
        message: `HVAC electrical supply voltage reading (${voltage}V) is outside the expected ${minV}-${maxV}V range.`,
        measurements: { voltage, minV, maxV }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
        notify: rule.notificationPolicy === 'IMMEDIATE',
      });
    }

    // HVAC-ELECTRICAL-004 — unexpected power loss: was clearly running,
    // now reads ~0. Only evaluated on the general whole-unit power role.
    if (assignment.sensorRole === SensorRole.HVAC_POWER) {
      const priorWattsThreshold = await this.thresholdsService.getValue('POWER_LOSS_MIN_PRIOR_WATTS', home.customerId);
      const prior = await this.telemetryRepo.findOne({ where: { deviceRegistryId: device.id }, order: { observedAt: 'DESC' } });
      const wasRunning = prior?.numericValue != null && Number(prior.numericValue) >= priorWattsThreshold;
      const rule = this.rule('HVAC-ELECTRICAL-004');
      await this.upsertFinding({
        scope: { equipmentId: assignment.equipmentId }, customerId: home.customerId, yolinkHomeId: home.id,
        equipmentCode: equipment?.equipmentCode ?? null, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
        conditionMet: wasRunning && watts < 5,
        severity: rule.severity, confidence: rule.confidence,
        message: `HVAC power draw dropped from ${prior?.numericValue}W to ${watts}W unexpectedly while the system appeared to be running.`,
        measurements: { watts, priorWatts: prior?.numericValue }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
        notify: rule.notificationPolicy === 'IMMEDIATE',
      });
    }

    // HVAC-RUNTIME-003 / HVAC-COMPRESSOR-003 — short cycling, checked right
    // after every reading rather than waiting for the daily batch, since a
    // rapidly cycling system is worth catching same-day.
    const shortCycleRuleId = assignment.sensorRole === SensorRole.HVAC_COMPRESSOR_POWER ? 'HVAC-COMPRESSOR-003'
      : assignment.sensorRole === SensorRole.HVAC_POWER ? 'HVAC-RUNTIME-003' : null;
    if (shortCycleRuleId) {
      const onWattsKey = assignment.sensorRole === SensorRole.HVAC_COMPRESSOR_POWER ? 'COMPRESSOR_ON_WATTS_THRESHOLD' : 'RUNTIME_ON_WATTS_THRESHOLD';
      const [onWatts, maxDurationMin, count, windowMin] = await Promise.all([
        this.thresholdsService.getValue(onWattsKey, home.customerId),
        this.thresholdsService.getValue('SHORT_CYCLE_MAX_DURATION_MINUTES', home.customerId),
        this.thresholdsService.getValue('SHORT_CYCLE_COUNT', home.customerId),
        this.thresholdsService.getValue('SHORT_CYCLE_WINDOW_MINUTES', home.customerId),
      ]);
      const cycles = await this.computeRunCycles(device.id, onWatts, Math.max(6, windowMin / 60));
      const windowStart = new Date(Date.now() - windowMin * 60000);
      const shortCycles = cycles.filter((c) => c.end && c.start >= windowStart && c.durationMinutes! <= maxDurationMin);
      const rule = this.rule(shortCycleRuleId);
      await this.upsertFinding({
        scope: { equipmentId: assignment.equipmentId }, customerId: home.customerId, yolinkHomeId: home.id,
        equipmentCode: equipment?.equipmentCode ?? null, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
        conditionMet: shortCycles.length >= count, severity: rule.severity, confidence: rule.confidence,
        message: `${assignment.sensorRole === SensorRole.HVAC_COMPRESSOR_POWER ? 'Compressor' : 'HVAC system'} has short-cycled ${shortCycles.length} times in the last ${windowMin} minutes — each run under ${maxDurationMin} minutes.`,
        measurements: { shortCycleCount: shortCycles.length, windowMin, maxDurationMin }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
        notify: rule.notificationPolicy === 'IMMEDIATE',
      });
    }

    // HVAC-BLOWER-003 — unexpected operation: blower running while the
    // whole-unit system isn't (or vice versa). Best-effort proxy since we
    // don't have explicit thermostat call-for-heat/cool telemetry — treats
    // the general HVAC_POWER reading as "the system should be running."
    if (assignment.sensorRole === SensorRole.HVAC_BLOWER_POWER) {
      const [blowerOnWatts, systemOnWatts] = await Promise.all([
        this.thresholdsService.getValue('BLOWER_ON_WATTS_THRESHOLD', home.customerId),
        this.thresholdsService.getValue('RUNTIME_ON_WATTS_THRESHOLD', home.customerId),
      ]);
      const systemDevices = await this.assignmentsRepo.find({ where: { equipmentId: assignment.equipmentId, sensorRole: SensorRole.HVAC_POWER } });
      let systemRunning: boolean | null = null;
      if (systemDevices.length) {
        const latest = await this.telemetryRepo.findOne({ where: { deviceRegistryId: systemDevices[0].deviceRegistryId }, order: { observedAt: 'DESC' } });
        if (latest?.numericValue != null) systemRunning = Number(latest.numericValue) >= systemOnWatts;
      }
      const rule = this.rule('HVAC-BLOWER-003');
      const blowerRunning = watts >= blowerOnWatts;
      await this.upsertFinding({
        scope: { equipmentId: assignment.equipmentId }, customerId: home.customerId, yolinkHomeId: home.id,
        equipmentCode: equipment?.equipmentCode ?? null, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
        conditionMet: systemRunning != null && blowerRunning !== systemRunning,
        severity: rule.severity, confidence: rule.confidence,
        message: blowerRunning ? 'Blower is running while the HVAC system doesn\'t appear to be calling for heat/cool.' : 'Blower isn\'t running while the HVAC system appears to be active.',
        measurements: { blowerRunning, systemRunning }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
        notify: rule.notificationPolicy === 'IMMEDIATE',
      });
    }
  }

  // HVAC_RETURN_HUMIDITY / HVAC_SUPPLY_HUMIDITY / INDOOR_AMBIENT_HUMIDITY —
  // records a sample and evaluates HVAC-HUMIDITY-001 against whether the
  // system is actively cooling right now (proxied from the most recent
  // compressor/system power reading for the same equipment).
  async handleHumidityReading(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, percent: number | null, observedAt: Date): Promise<void> {
    if (percent == null || !assignment.equipmentId) return;
    await this.evaluatePlausibility(device, assignment, home, percent, 'PLAUSIBLE_HUMIDITY_MIN_PERCENT', 'PLAUSIBLE_HUMIDITY_MAX_PERCENT', '%');
    await this.baselineService.recordSample(home.customerId, assignment.equipmentId, 'HUMIDITY_SAMPLE', percent, observedAt);
    if (assignment.sensorRole !== SensorRole.INDOOR_AMBIENT_HUMIDITY) return;

    const equipment = await this.equipmentRepo.findOne({ where: { id: assignment.equipmentId } });
    const [threshold, onWatts] = await Promise.all([
      this.thresholdsService.getValue('HUMIDITY_HIGH_DURING_COOLING_PERCENT', home.customerId),
      this.thresholdsService.getValue('COMPRESSOR_ON_WATTS_THRESHOLD', home.customerId),
    ]);
    const isCoolingNow = await this.isEquipmentCoolingNow(assignment.equipmentId, onWatts);
    const rule = this.rule('HVAC-HUMIDITY-001');
    await this.upsertFinding({
      scope: { equipmentId: assignment.equipmentId }, customerId: home.customerId, yolinkHomeId: home.id,
      equipmentCode: equipment?.equipmentCode ?? null, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
      conditionMet: isCoolingNow === true && percent > threshold,
      severity: rule.severity, confidence: rule.confidence,
      message: `Indoor humidity is ${percent}% while the system is actively cooling — above the ${threshold}% comfort/mold-risk threshold.`,
      measurements: { humidity: percent, threshold }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
      notify: rule.notificationPolicy === 'IMMEDIATE',
    });
  }

  private async isEquipmentCoolingNow(equipmentId: string, onWatts: number): Promise<boolean | null> {
    const compressorAssignment = await this.assignmentsRepo.findOne({ where: { equipmentId, sensorRole: SensorRole.HVAC_COMPRESSOR_POWER } });
    const role = compressorAssignment ? SensorRole.HVAC_COMPRESSOR_POWER : SensorRole.HVAC_POWER;
    const assignment = compressorAssignment ?? await this.assignmentsRepo.findOne({ where: { equipmentId, sensorRole: SensorRole.HVAC_POWER } });
    if (!assignment) return null;
    const latest = await this.telemetryRepo.findOne({ where: { deviceRegistryId: assignment.deviceRegistryId }, order: { observedAt: 'DESC' } });
    if (latest?.numericValue == null) return null;
    return Number(latest.numericValue) >= onWatts;
  }

  // HVAC_SUCTION_LINE_TEMP / HVAC_LIQUID_LINE_TEMP / HVAC_STATIC_PRESSURE —
  // pure sample recording + plausibility; these two rule groups are 100%
  // needsBaseline:true, so the actual finding evaluation lives in the
  // daily cron below.
  async handleLineTempReading(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, tempF: number | null, observedAt: Date): Promise<void> {
    if (tempF == null || !assignment.equipmentId) return;
    await this.evaluatePlausibility(device, assignment, home, tempF, 'PLAUSIBLE_TEMP_MIN_F', 'PLAUSIBLE_TEMP_MAX_F', '°F');
    const metricKey = assignment.sensorRole === SensorRole.HVAC_SUCTION_LINE_TEMP ? 'SUCTION_LINE_TEMP' : 'LIQUID_LINE_TEMP';
    await this.baselineService.recordSample(home.customerId, assignment.equipmentId, metricKey, tempF, observedAt);
  }

  async handleStaticPressureReading(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, value: number | null, observedAt: Date): Promise<void> {
    if (value == null || !assignment.equipmentId) return;
    await this.baselineService.recordSample(home.customerId, assignment.equipmentId, 'STATIC_PRESSURE', value, observedAt);
  }

  async handleSetpointReading(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, setpointF: number | null, observedAt: Date): Promise<void> {
    if (setpointF == null || !assignment.equipmentId) return;
    await this.evaluatePlausibility(device, assignment, home, setpointF, 'PLAUSIBLE_TEMP_MIN_F', 'PLAUSIBLE_TEMP_MAX_F', '°F');
    await this.baselineService.recordSample(home.customerId, assignment.equipmentId, 'THERMOSTAT_SETPOINT', setpointF, observedAt);
  }

  // SENSOR-003 — a reading outside a measurement type's physically
  // plausible range is a faulty sensor/wiring issue, not a real HVAC
  // condition, and should never be allowed to drive a downstream finding.
  private async evaluatePlausibility(device: DeviceRegistry, assignment: SensorAssignment, home: YolinkHome, value: number, minKey: string | undefined, maxKey: string, unit: string): Promise<void> {
    const max = await this.thresholdsService.getValue(maxKey, home.customerId);
    const min = minKey ? await this.thresholdsService.getValue(minKey, home.customerId) : -Infinity;
    const rule = this.rule('SENSOR-003');
    await this.upsertFinding({
      scope: { deviceRegistryId: device.id }, customerId: home.customerId, yolinkHomeId: home.id,
      equipmentCode: null, sensorRole: assignment.sensorRole, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
      conditionMet: value < min || value > max, severity: rule.severity, confidence: rule.confidence,
      message: `${this.label(assignment.sensorRole)} reported an implausible reading (${value}${unit}) — likely a faulty sensor or wiring issue rather than a real condition.`,
      measurements: { value, min, max }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
      notify: false,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Daily batch — every needsBaseline:true rule. A single reading can't be
  // "below baseline" on its own; these only make sense evaluated against a
  // rolling history, so they run once/day per equipment instead of per event.
  // ══════════════════════════════════════════════════════════════════════

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailyTrendAnalysis(): Promise<void> {
    const relevantRoles = [
      SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_SUPPLY_TEMP, SensorRole.HVAC_POWER,
      SensorRole.HVAC_COMPRESSOR_POWER, SensorRole.HVAC_BLOWER_POWER, SensorRole.INDOOR_AMBIENT_TEMP,
      SensorRole.HVAC_THERMOSTAT_SETPOINT, SensorRole.INDOOR_AMBIENT_HUMIDITY,
      SensorRole.HVAC_SUCTION_LINE_TEMP, SensorRole.HVAC_LIQUID_LINE_TEMP, SensorRole.HVAC_STATIC_PRESSURE,
    ];
    const assignments = await this.assignmentsRepo.find({ where: { sensorRole: In(relevantRoles) } });
    const equipmentIds = [...new Set(assignments.filter((a) => a.equipmentId).map((a) => a.equipmentId as string))];

    for (const equipmentId of equipmentIds) {
      try {
        await this.evaluateEquipmentDailyTrends(equipmentId);
      } catch (err) {
        this.logger.warn(`Daily trend analysis failed for equipment ${equipmentId}: ${err}`);
      }
    }
  }

  private async evaluateEquipmentDailyTrends(equipmentId: string): Promise<void> {
    const equipment = await this.equipmentRepo.findOne({ where: { id: equipmentId } });
    if (!equipment) return;
    const home = await this.homeRepo.findOne({ where: { id: equipment.homeId } });
    if (!home) return;
    const yolinkHome = await this.yolinkHomeRepo.findOne({ where: { customerId: home.customerId, isActive: true } });
    if (!yolinkHome) return;
    const ctx = { customerId: home.customerId, yolinkHomeId: yolinkHome.id, equipment };

    // ── Cooling/heating performance trend (COOL-002/003/004) ──
    await this.evaluateBaselineDeviation(ctx, 'COOLING_DELTA_T', 'HVAC-COOL-002', 'low', (v, b) =>
      `Cooling delta-T is ${v.toFixed(1)}°F today, well below this home's own baseline of ${b.mean.toFixed(1)}°F — cooling performance has degraded.`);
    await this.evaluateRecentVsBaselineTrend(ctx, 'COOLING_DELTA_T', 'HVAC-COOL-003', 3, (recent, b) =>
      `Supply air isn't cooling as much as it used to — last 3 days averaged ${recent.toFixed(1)}°F delta-T vs. this home's ${b.mean.toFixed(1)}°F baseline.`);
    await this.evaluateRollingTrendDecline(ctx, 'COOLING_DELTA_T', 'HVAC-COOL-004', (recentAvg, priorAvg) =>
      `Cooling delta-T has trended down over the last 30 days — recent 15-day average ${recentAvg.toFixed(1)}°F vs. the prior 15 days' ${priorAvg.toFixed(1)}°F.`);

    // ── Runtime / cycling (RUNTIME-001/002, COMPRESSOR-001, BLOWER-001) ──
    const systemAssignment = await this.assignmentsRepo.findOne({ where: { equipmentId, sensorRole: SensorRole.HVAC_POWER } });
    if (systemAssignment) {
      const onWatts = await this.thresholdsService.getValue('RUNTIME_ON_WATTS_THRESHOLD', ctx.customerId);
      const cycles = await this.computeRunCycles(systemAssignment.deviceRegistryId, onWatts, 24);
      const completed = cycles.filter((c) => c.durationMinutes != null);
      const dailyRuntime = completed.reduce((sum, c) => sum + (c.durationMinutes ?? 0), 0);
      const longestCycle = completed.reduce((max, c) => Math.max(max, c.durationMinutes ?? 0), 0);
      await this.baselineService.recordSample(ctx.customerId, equipmentId, 'DAILY_RUNTIME_MINUTES', dailyRuntime, new Date());
      if (longestCycle > 0) await this.baselineService.recordSample(ctx.customerId, equipmentId, 'LONGEST_CYCLE_MINUTES', longestCycle, new Date());
      await this.evaluateBaselineDeviation(ctx, 'DAILY_RUNTIME_MINUTES', 'HVAC-RUNTIME-001', 'high', (v, b) =>
        `HVAC ran ${Math.round(v)} minutes today — well above this home's baseline of ${Math.round(b.mean)} minutes for comparable conditions.`);
      await this.evaluateBaselineDeviation(ctx, 'LONGEST_CYCLE_MINUTES', 'HVAC-RUNTIME-002', 'high', (v, b) =>
        `A single HVAC run lasted ${Math.round(v)} minutes today — far longer than this home's typical ${Math.round(b.mean)}-minute cycle.`);

      // HVAC-ELECTRICAL-002 — whole-unit power draw deviating from its own
      // baseline (either direction: a failing component can draw either
      // more or less than normal).
      await this.evaluateBaselineDeviation(ctx, 'HVAC_POWER_SAMPLE', 'HVAC-ELECTRICAL-002', 'either', (v, b) =>
        `Whole-unit power draw (${Math.round(v)}W) is well outside this home's normal range (baseline ${Math.round(b.mean)}W).`);

      // HVAC-ELECTRICAL-003 — irregular cycling: distinct from RUNTIME-003
      // (which counts too-frequent SHORT cycles). This looks at how erratic
      // cycle *lengths* are relative to each other via coefficient of
      // variation (stddev/mean) — a system cycling normally has fairly
      // consistent run lengths for a given weather condition; wildly
      // inconsistent lengths point to an electrical/control fault rather
      // than just short-cycling.
      if (completed.length >= 3) {
        const durations = completed.map((c) => c.durationMinutes ?? 0);
        const meanDur = durations.reduce((a, b) => a + b, 0) / durations.length;
        const varDur = durations.reduce((a, b) => a + (b - meanDur) ** 2, 0) / durations.length;
        const coefficientOfVariation = meanDur > 0 ? Math.sqrt(varDur) / meanDur : 0;
        const rule = this.rule('HVAC-ELECTRICAL-003');
        await this.upsertFinding({
          scope: { equipmentId }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
          equipmentCode: equipment.equipmentCode, sensorRole: SensorRole.HVAC_POWER, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
          conditionMet: coefficientOfVariation >= 0.8, severity: rule.severity, confidence: rule.confidence,
          message: `HVAC run-cycle lengths today were highly inconsistent with each other (${completed.length} cycles, coefficient of variation ${coefficientOfVariation.toFixed(2)}) — an irregular on/off pattern not explained by normal thermostat cycling.`,
          measurements: { cycleCount: completed.length, coefficientOfVariation }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
          notify: rule.notificationPolicy === 'IMMEDIATE',
        });
      }
    }
    const compressorAssignment = await this.assignmentsRepo.findOne({ where: { equipmentId, sensorRole: SensorRole.HVAC_COMPRESSOR_POWER } });
    if (compressorAssignment) {
      const onWatts = await this.thresholdsService.getValue('COMPRESSOR_ON_WATTS_THRESHOLD', ctx.customerId);
      const cycles = await this.computeRunCycles(compressorAssignment.deviceRegistryId, onWatts, 24);
      const dailyRuntime = cycles.filter((c) => c.durationMinutes != null).reduce((sum, c) => sum + (c.durationMinutes ?? 0), 0);
      await this.baselineService.recordSample(ctx.customerId, equipmentId, 'COMPRESSOR_DAILY_RUNTIME_MINUTES', dailyRuntime, new Date());
      await this.evaluateBaselineDeviation(ctx, 'COMPRESSOR_DAILY_RUNTIME_MINUTES', 'HVAC-COMPRESSOR-001', 'high', (v, b) =>
        `Compressor ran ${Math.round(v)} minutes today — above this home's baseline of ${Math.round(b.mean)} minutes.`);
      await this.evaluateBaselineDeviation(ctx, 'COMPRESSOR_POWER_SAMPLE', 'HVAC-COMPRESSOR-002', 'either', (v, b) =>
        `Compressor power draw pattern (${Math.round(v)}W) deviates from its own established signature (${Math.round(b.mean)}W baseline).`);
      // Performance Correlation — compressor working harder (runtime up) while cooling output is down.
      const runtimeDev = await this.deviationStddevs(equipmentId, 'COMPRESSOR_DAILY_RUNTIME_MINUTES', dailyRuntime);
      const deltaTBaseline = await this.baselineService.getBaseline(equipmentId, 'COOLING_DELTA_T');
      const recentDeltaT = await this.latestSample(equipmentId, 'COOLING_DELTA_T');
      const correlationMet = runtimeDev != null && runtimeDev.stddevs >= 1.5 && deltaTBaseline && recentDeltaT != null && recentDeltaT < deltaTBaseline.mean;
      const corrRule = this.rule('HVAC-COMPRESSOR-004');
      await this.upsertFinding({
        scope: { equipmentId }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
        equipmentCode: equipment.equipmentCode, sensorRole: SensorRole.HVAC_COMPRESSOR_POWER, ruleId: corrRule.ruleId, ruleGroup: corrRule.ruleGroup,
        conditionMet: !!correlationMet, severity: corrRule.severity, confidence: corrRule.confidence,
        message: 'Compressor is running longer than usual while cooling output (delta-T) is below normal — consistent with a developing mechanical issue rather than just hot weather.',
        measurements: { dailyRuntime, deltaTBaseline }, reasonCode: corrRule.reasonCode, recommendedActions: corrRule.recommendedActions,
        notify: corrRule.notificationPolicy === 'IMMEDIATE',
      });
    }
    const blowerAssignment = await this.assignmentsRepo.findOne({ where: { equipmentId, sensorRole: SensorRole.HVAC_BLOWER_POWER } });
    if (blowerAssignment) {
      const onWatts = await this.thresholdsService.getValue('BLOWER_ON_WATTS_THRESHOLD', ctx.customerId);
      const cycles = await this.computeRunCycles(blowerAssignment.deviceRegistryId, onWatts, 24);
      const dailyRuntime = cycles.filter((c) => c.durationMinutes != null).reduce((sum, c) => sum + (c.durationMinutes ?? 0), 0);
      await this.baselineService.recordSample(ctx.customerId, equipmentId, 'BLOWER_DAILY_RUNTIME_MINUTES', dailyRuntime, new Date());
      await this.evaluateBaselineDeviation(ctx, 'BLOWER_DAILY_RUNTIME_MINUTES', 'HVAC-BLOWER-001', 'high', (v, b) =>
        `Blower ran ${Math.round(v)} minutes today — above this home's baseline of ${Math.round(b.mean)} minutes.`);
      await this.evaluateBaselineDeviation(ctx, 'BLOWER_POWER_SAMPLE', 'HVAC-BLOWER-002', 'either', (v, b) =>
        `Blower power draw pattern (${Math.round(v)}W) deviates from its own established signature (${Math.round(b.mean)}W baseline).`);
      const pressureBaseline = await this.baselineService.getBaseline(equipmentId, 'STATIC_PRESSURE');
      const recentPressure = await this.latestSample(equipmentId, 'STATIC_PRESSURE');
      const runtimeDev = await this.deviationStddevs(equipmentId, 'BLOWER_DAILY_RUNTIME_MINUTES', dailyRuntime);
      const pressureDev = pressureBaseline && recentPressure != null && pressureBaseline.stddev > 0 ? Math.abs(recentPressure - pressureBaseline.mean) / pressureBaseline.stddev : null;
      const blowerCorrMet = runtimeDev != null && runtimeDev.stddevs >= 1.5 && pressureDev != null && pressureDev >= 1.5;
      const blowerCorrRule = this.rule('HVAC-BLOWER-004');
      await this.upsertFinding({
        scope: { equipmentId }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
        equipmentCode: equipment.equipmentCode, sensorRole: SensorRole.HVAC_BLOWER_POWER, ruleId: blowerCorrRule.ruleId, ruleGroup: blowerCorrRule.ruleGroup,
        conditionMet: blowerCorrMet, severity: blowerCorrRule.severity, confidence: blowerCorrRule.confidence,
        message: 'Blower runtime and duct static pressure are both abnormal at the same time — consistent with an airflow restriction (dirty filter, blocked vent, failing blower).',
        measurements: { dailyRuntime, recentPressure }, reasonCode: blowerCorrRule.reasonCode, recommendedActions: blowerCorrRule.recommendedActions,
        notify: blowerCorrRule.notificationPolicy === 'IMMEDIATE',
      });
    }

    // ── Comfort (COMFORT-001/002) ──
    const indoorTempAssignment = await this.assignmentsRepo.findOne({ where: { equipmentId, sensorRole: SensorRole.INDOOR_AMBIENT_TEMP } });
    if (indoorTempAssignment) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const readings = await this.telemetryRepo.find({ where: { deviceRegistryId: indoorTempAssignment.deviceRegistryId, observedAt: MoreThan(since) }, order: { observedAt: 'ASC' } });
      const values = readings.filter((r) => r.numericValue != null).map((r) => Number(r.numericValue));
      if (values.length >= 4) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
        await this.baselineService.recordSample(ctx.customerId, equipmentId, 'INDOOR_TEMP_VARIANCE', Math.sqrt(variance), new Date());
        await this.evaluateBaselineDeviation(ctx, 'INDOOR_TEMP_VARIANCE', 'HVAC-COMFORT-002', 'high', (v, b) =>
          `Indoor temperature has been swinging more than usual — today's variance (±${v.toFixed(1)}°F) is above this home's baseline (±${b.mean.toFixed(1)}°F).`);
      }

      const setpointAssignment = await this.assignmentsRepo.findOne({ where: { equipmentId, sensorRole: SensorRole.HVAC_THERMOSTAT_SETPOINT } });
      if (setpointAssignment && values.length) {
        const setpointReadings = await this.telemetryRepo.find({ where: { deviceRegistryId: setpointAssignment.deviceRegistryId, observedAt: MoreThan(since) }, order: { observedAt: 'DESC' } });
        const setpoint = setpointReadings[0]?.numericValue != null ? Number(setpointReadings[0].numericValue) : null;
        if (setpoint != null) {
          const [deviationF, sustainedMin] = await Promise.all([
            this.thresholdsService.getValue('COMFORT_SETPOINT_DEVIATION_F', ctx.customerId),
            this.thresholdsService.getValue('COMFORT_SETPOINT_SUSTAINED_MINUTES', ctx.customerId),
          ]);
          // "Sustained" = the fraction of today's readings off-setpoint implies at
          // least sustainedMin minutes, given the sampling cadence of today's data.
          const offSetpointCount = values.filter((v) => Math.abs(v - setpoint) >= deviationF).length;
          const avgIntervalMin = values.length > 1 ? 24 * 60 / values.length : 60;
          const offSetpointMinutes = offSetpointCount * avgIntervalMin;
          const comfortRule = this.rule('HVAC-COMFORT-001');
          await this.upsertFinding({
            scope: { equipmentId }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
            equipmentCode: equipment.equipmentCode, sensorRole: SensorRole.INDOOR_AMBIENT_TEMP, ruleId: comfortRule.ruleId, ruleGroup: comfortRule.ruleGroup,
            conditionMet: offSetpointMinutes >= sustainedMin, severity: comfortRule.severity, confidence: comfortRule.confidence,
            message: `Indoor temperature has stayed ${deviationF}°F+ away from the ${setpoint}°F setpoint for an estimated ${Math.round(offSetpointMinutes)} minutes today.`,
            measurements: { setpoint, offSetpointMinutes }, reasonCode: comfortRule.reasonCode, recommendedActions: comfortRule.recommendedActions,
            notify: comfortRule.notificationPolicy === 'IMMEDIATE',
          });
        }
      }
    }

    // ── Humidity response during cooling (HUMIDITY-002) ──
    await this.evaluateBaselineDeviation(ctx, 'HUMIDITY_SAMPLE', 'HVAC-HUMIDITY-002', 'high', (v, b) =>
      `Indoor humidity isn't dropping during cooling the way it used to — current reading ${v.toFixed(0)}% vs. this home's ${b.mean.toFixed(0)}% baseline during cooling.`);

    // ── Refrigerant circuit (REFRIGERANT-001/002) — both pure baseline. ──
    await this.evaluateBaselineDeviation(ctx, 'SUCTION_LINE_TEMP', 'HVAC-REFRIGERANT-001', 'either', (v, b) =>
      `Refrigerant suction line temperature (${v.toFixed(1)}°F) is outside this home's normal range (baseline ${b.mean.toFixed(1)}°F).`);
    await this.evaluateBaselineDeviation(ctx, 'LIQUID_LINE_TEMP', 'HVAC-REFRIGERANT-002', 'either', (v, b) =>
      `Refrigerant liquid line temperature (${v.toFixed(1)}°F) is outside this home's normal range (baseline ${b.mean.toFixed(1)}°F).`);

    // ── Airflow / static pressure (AIRFLOW-001) — pure baseline. ──
    await this.evaluateBaselineDeviation(ctx, 'STATIC_PRESSURE', 'HVAC-AIRFLOW-001', 'either', (v, b) =>
      `Duct static pressure (${v.toFixed(2)}) is outside this home's normal range (baseline ${b.mean.toFixed(2)}) — possible airflow restriction.`);

    // ── Return/Supply sensor reversal (SENSOR-004) ──
    await this.evaluateSensorReversal(ctx, equipmentId);

    // ── Combined / multi-signal (COMBINED-001/002/003) ──
    await this.evaluateCombinedRules(ctx, equipmentId);
  }

  // Generic "today's value vs. this home's rolling baseline" evaluator —
  // backs every simple needsBaseline:true rule (delta-T degradation,
  // runtime, comfort variance, humidity response, refrigerant, airflow).
  private async evaluateBaselineDeviation(
    ctx: { customerId: string; yolinkHomeId: string; equipment: Equipment },
    metricKey: string, ruleId: string, direction: 'low' | 'high' | 'either',
    messageFn: (value: number, baseline: { mean: number; stddev: number }) => string,
  ): Promise<void> {
    const baseline = await this.baselineService.getBaseline(ctx.equipment.id, metricKey);
    const rule = this.rule(ruleId);
    if (!baseline || baseline.stddev <= 0) {
      // Not enough history yet, or zero variance — nothing to compare
      // against; clear any stale finding rather than leaving it dangling.
      await this.upsertFinding({
        scope: { equipmentId: ctx.equipment.id }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
        equipmentCode: ctx.equipment.equipmentCode, sensorRole: null, ruleId, ruleGroup: rule.ruleGroup,
        conditionMet: false, severity: rule.severity, confidence: rule.confidence, message: '', measurements: {}, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions, notify: false,
      });
      return;
    }
    const latest = await this.latestSample(ctx.equipment.id, metricKey);
    if (latest == null) return;
    const stddevs = Math.abs(latest - baseline.mean) / baseline.stddev;
    const wrongDirection = (direction === 'low' && latest >= baseline.mean) || (direction === 'high' && latest <= baseline.mean);
    const severity = wrongDirection ? null : await this.severityFromDeviation(ctx.customerId, stddevs);
    await this.upsertFinding({
      scope: { equipmentId: ctx.equipment.id }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
      equipmentCode: ctx.equipment.equipmentCode, sensorRole: null, ruleId, ruleGroup: rule.ruleGroup,
      conditionMet: severity != null, severity: severity ?? rule.severity, confidence: rule.confidence,
      message: messageFn(latest, baseline), measurements: { latest, baseline, stddevs }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
      notify: rule.notificationPolicy === 'IMMEDIATE',
    });
  }

  // Short-window recent average vs. the long-window baseline — "is this
  // metric behaving like its usual self lately," distinct from a single
  // day's reading (evaluateBaselineDeviation) or the 30-day trend line
  // (evaluateRollingTrendDecline).
  private async evaluateRecentVsBaselineTrend(
    ctx: { customerId: string; yolinkHomeId: string; equipment: Equipment },
    metricKey: string, ruleId: string, recentDays: number,
    messageFn: (recentAvg: number, baseline: { mean: number; stddev: number }) => string,
  ): Promise<void> {
    const baseline = await this.baselineService.getBaseline(ctx.equipment.id, metricKey);
    const rule = this.rule(ruleId);
    if (!baseline || baseline.stddev <= 0) return;
    const recentSamples = await this.baselineService.getRecentSamples(ctx.equipment.id, metricKey, recentDays);
    if (recentSamples.length < 2) return;
    const recentAvg = recentSamples.reduce((s, r) => s + r.value, 0) / recentSamples.length;
    const stddevs = (baseline.mean - recentAvg) / baseline.stddev; // positive = recent is lower than baseline
    const severity = stddevs > 0 ? await this.severityFromDeviation(ctx.customerId, stddevs) : null;
    await this.upsertFinding({
      scope: { equipmentId: ctx.equipment.id }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
      equipmentCode: ctx.equipment.equipmentCode, sensorRole: null, ruleId, ruleGroup: rule.ruleGroup,
      conditionMet: severity != null, severity: severity ?? rule.severity, confidence: rule.confidence,
      message: messageFn(recentAvg, baseline), measurements: { recentAvg, baseline }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
      notify: rule.notificationPolicy === 'IMMEDIATE',
    });
  }

  // Recent-15-days vs. prior-15-days within the 30-day baseline window —
  // a genuine trend-decline check, distinct from either single-value
  // comparison above.
  private async evaluateRollingTrendDecline(
    ctx: { customerId: string; yolinkHomeId: string; equipment: Equipment },
    metricKey: string, ruleId: string,
    messageFn: (recentAvg: number, priorAvg: number) => string,
  ): Promise<void> {
    const samples = await this.baselineService.getRecentSamples(ctx.equipment.id, metricKey, 30);
    const rule = this.rule(ruleId);
    if (samples.length < 14) return;
    const midpoint = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const prior = samples.filter((s) => s.observedAt < midpoint);
    const recent = samples.filter((s) => s.observedAt >= midpoint);
    if (prior.length < 3 || recent.length < 3) return;
    const priorAvg = prior.reduce((s, r) => s + r.value, 0) / prior.length;
    const recentAvg = recent.reduce((s, r) => s + r.value, 0) / recent.length;
    const declinePercent = priorAvg > 0 ? (priorAvg - recentAvg) / priorAvg : 0;
    await this.upsertFinding({
      scope: { equipmentId: ctx.equipment.id }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
      equipmentCode: ctx.equipment.equipmentCode, sensorRole: null, ruleId, ruleGroup: rule.ruleGroup,
      conditionMet: declinePercent >= 0.15, severity: rule.severity, confidence: rule.confidence, // ≥15% decline over the trailing month
      message: messageFn(recentAvg, priorAvg), measurements: { recentAvg, priorAvg, declinePercent }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
      notify: rule.notificationPolicy === 'IMMEDIATE',
    });
  }

  private async latestSample(equipmentId: string, metricKey: string): Promise<number | null> {
    const samples = await this.baselineService.getRecentSamples(equipmentId, metricKey, 1);
    return samples.length ? samples[samples.length - 1].value : null;
  }

  private async deviationStddevs(equipmentId: string, metricKey: string, value: number): Promise<{ stddevs: number } | null> {
    const baseline = await this.baselineService.getBaseline(equipmentId, metricKey);
    if (!baseline || baseline.stddev <= 0) return null;
    return { stddevs: (value - baseline.mean) / baseline.stddev };
  }

  // SENSOR-004 — supply consistently warmer than return is backwards for a
  // properly wired cooling system. A documented heuristic (no explicit
  // thermostat-mode telemetry to confirm intent), not a certain diagnosis —
  // the finding's own recommended action routes to a human for confirmation.
  private async evaluateSensorReversal(ctx: { customerId: string; yolinkHomeId: string; equipment: Equipment }, equipmentId: string): Promise<void> {
    const rule = this.rule('SENSOR-004');
    const confirmCount = await this.thresholdsService.getValue('SENSOR_REVERSAL_CONFIRMATION_COUNT', ctx.customerId);
    const recentCooling = await this.baselineService.getRecentSamples(equipmentId, 'COOLING_DELTA_T', 3);
    const recentHeating = await this.baselineService.getRecentSamples(equipmentId, 'HEATING_DELTA_T', 3);
    const total = recentCooling.length + recentHeating.length;
    // My own recording convention already buckets "supply warmer than
    // return" as HEATING_DELTA_T — reversal is suspected when that bucket
    // dominates recent readings almost exclusively (a real system cycles
    // between both, or mostly cooling in summer/mostly heating in winter,
    // but rarely 100% heating-shaped delta-T for days with an active
    // cooling call in between).
    const suspicious = total >= confirmCount && recentCooling.length === 0;
    await this.upsertFinding({
      scope: { equipmentId }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
      equipmentCode: ctx.equipment.equipmentCode, sensorRole: SensorRole.HVAC_RETURN_TEMP, ruleId: rule.ruleId, ruleGroup: rule.ruleGroup,
      conditionMet: suspicious, severity: rule.severity, confidence: rule.confidence,
      message: 'The last several Return/Supply air readings all show supply air warmer than return air — possible sensor configuration error (Return and Supply may be swapped).',
      measurements: { recentHeatingCount: recentHeating.length, recentCoolingCount: recentCooling.length }, reasonCode: rule.reasonCode, recommendedActions: rule.recommendedActions,
      notify: rule.notificationPolicy === 'IMMEDIATE',
    });
  }

  // COMBINED-001/002/003 — co-occurrence checks over whatever this equipment's
  // OTHER rules already decided today; run last so those findings exist.
  private async evaluateCombinedRules(ctx: { customerId: string; yolinkHomeId: string; equipment: Equipment }, equipmentId: string): Promise<void> {
    const activeFindings = await this.findingsRepo.find({ where: { equipmentId, status: FindingStatus.ACTIVE } });
    const activeRuleIds = new Set(activeFindings.map((f) => f.ruleId));

    // COMBINED-001 — delta-T + runtime + comfort all abnormal together.
    const rule1 = this.rule('HVAC-COMBINED-001');
    const combined1 = ['HVAC-COOL-001', 'HVAC-COOL-002'].some((r) => activeRuleIds.has(r)) && activeRuleIds.has('HVAC-RUNTIME-001') && activeRuleIds.has('HVAC-COMFORT-002');
    await this.upsertFinding({
      scope: { equipmentId }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
      equipmentCode: ctx.equipment.equipmentCode, sensorRole: null, ruleId: rule1.ruleId, ruleGroup: rule1.ruleGroup,
      conditionMet: combined1, severity: rule1.severity, confidence: rule1.confidence,
      message: 'Cooling performance, runtime, and indoor comfort are all abnormal at the same time — a stronger signal than any one of these alone.',
      measurements: { activeRuleIds: [...activeRuleIds] }, reasonCode: rule1.reasonCode, recommendedActions: rule1.recommendedActions,
      notify: rule1.notificationPolicy === 'IMMEDIATE',
    });

    // COMBINED-002 — 3+ independent findings, at least one persistent (3+ days).
    const rule2 = this.rule('HVAC-COMBINED-002');
    const persistentDays = 3;
    const persistentCutoff = new Date(Date.now() - persistentDays * 24 * 60 * 60 * 1000);
    const hasPersistent = activeFindings.some((f) => f.ruleId !== rule2.ruleId && f.detectedAt <= persistentCutoff);
    const combined2 = activeFindings.filter((f) => f.ruleId !== rule2.ruleId).length >= 3 && hasPersistent;
    await this.upsertFinding({
      scope: { equipmentId }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
      equipmentCode: ctx.equipment.equipmentCode, sensorRole: null, ruleId: rule2.ruleId, ruleGroup: rule2.ruleGroup,
      conditionMet: combined2, severity: rule2.severity, confidence: rule2.confidence,
      message: `${activeFindings.length} independent HVAC findings are active simultaneously, with at least one persisting ${persistentDays}+ days — high confidence this equipment needs a professional visit.`,
      measurements: { activeCount: activeFindings.length }, reasonCode: rule2.reasonCode, recommendedActions: rule2.recommendedActions,
      notify: rule2.notificationPolicy === 'IMMEDIATE',
    });

    // COMBINED-003 — repeated water events + repeated high humidity.
    const rule3 = this.rule('HVAC-COMBINED-003');
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const humidityFindingsRecent = await this.findingsRepo.count({ where: { equipmentId, ruleId: 'HVAC-HUMIDITY-001', detectedAt: MoreThan(since30) } });
    const combined3 = activeRuleIds.has('HVAC-WATER-003') && humidityFindingsRecent >= 2;
    await this.upsertFinding({
      scope: { equipmentId }, customerId: ctx.customerId, yolinkHomeId: ctx.yolinkHomeId,
      equipmentCode: ctx.equipment.equipmentCode, sensorRole: null, ruleId: rule3.ruleId, ruleGroup: rule3.ruleGroup,
      conditionMet: combined3, severity: rule3.severity, confidence: rule3.confidence,
      message: 'Repeated condensate water events plus repeated high-humidity-during-cooling readings together suggest an underlying drainage/airflow issue, not two unrelated symptoms.',
      measurements: { humidityFindingsRecent }, reasonCode: rule3.reasonCode, recommendedActions: rule3.recommendedActions,
      notify: rule3.notificationPolicy === 'IMMEDIATE',
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Shared helpers
  // ══════════════════════════════════════════════════════════════════════

  private rule(ruleId: string): RuleDefinition {
    return RULE_DEFINITIONS.find((r) => r.ruleId === ruleId)!;
  }

  private label(role: SensorRole): string {
    return SENSOR_ROLE_META[role]?.label ?? 'Sensor';
  }

  // Converts "how many standard deviations off baseline" into a severity,
  // using the shared BASELINE_*_STDDEV thresholds — every needsBaseline
  // rule in this file goes through this instead of a bespoke cutoff.
  private async severityFromDeviation(customerId: string, deviationStddevs: number): Promise<FindingSeverity | null> {
    const [watch, attention, critical] = await Promise.all([
      this.thresholdsService.getValue('BASELINE_WATCH_STDDEV', customerId),
      this.thresholdsService.getValue('BASELINE_ATTENTION_STDDEV', customerId),
      this.thresholdsService.getValue('BASELINE_CRITICAL_STDDEV', customerId),
    ]);
    if (deviationStddevs >= critical) return FindingSeverity.CRITICAL;
    if (deviationStddevs >= attention) return FindingSeverity.ATTENTION;
    if (deviationStddevs >= watch) return FindingSeverity.WATCH;
    return null;
  }

  // Generic active/resolve/create — mirrors the pattern AnalyticsEngineService
  // already uses for water/indoor-temp findings, generalized to also support
  // equipment-scoped findings (delta-T, runtime, etc. belong to "HVAC-01",
  // not one physical device) via scope.deviceRegistryId XOR scope.equipmentId.
  private async upsertFinding(params: {
    scope: { deviceRegistryId?: string; equipmentId?: string };
    customerId: string; yolinkHomeId: string; equipmentCode: string | null; sensorRole: SensorRole | null;
    ruleId: string; ruleGroup: string;
    conditionMet: boolean; severity: FindingSeverity; confidence: FindingConfidence;
    message: string; measurements: Record<string, any>; reasonCode: string; recommendedActions: string[];
    notify: boolean;
  }): Promise<void> {
    const scopeWhere = params.scope.deviceRegistryId
      ? { deviceRegistryId: params.scope.deviceRegistryId }
      : { equipmentId: params.scope.equipmentId };
    const active = await this.findingsRepo.findOne({
      where: { ...scopeWhere, ruleId: params.ruleId, status: FindingStatus.ACTIVE } as any,
      order: { detectedAt: 'DESC' },
    });

    if (!params.conditionMet) {
      if (active) { active.status = FindingStatus.RESOLVED; active.resolvedAt = new Date(); await this.findingsRepo.save(active); }
      return;
    }
    if (active) return; // already firing — don't duplicate while the condition persists

    const finding = await this.findingsRepo.save(this.findingsRepo.create({
      customerId: params.customerId, yolinkHomeId: params.yolinkHomeId,
      equipmentId: params.scope.equipmentId ?? null, equipmentCode: params.equipmentCode,
      deviceRegistryId: params.scope.deviceRegistryId ?? null, sensorRole: params.sensorRole,
      ruleId: params.ruleId, ruleGroup: params.ruleGroup, eventType: params.reasonCode.toLowerCase(),
      severity: params.severity, confidence: params.confidence, message: params.message,
      measurements: params.measurements, reasonCode: params.reasonCode, reasonCodes: [params.reasonCode],
      recommendedActions: params.recommendedActions, detectedAt: new Date(),
    }));

    if (params.notify) {
      try {
        const alert = await this.alertsService.createAlert({
          customerId: params.customerId, yolinkHomeId: params.yolinkHomeId,
          event: params.ruleId, severity: this.alertSeverityFor(params.severity), message: params.message,
          rawPayload: { findingId: finding.id }, categoryId: SNOOZABLE_FINDING_CATEGORY,
        });
        finding.linkedAlertId = alert.id;
        finding.lastAlertedAt = new Date();
        await this.findingsRepo.save(finding);
      } catch (err) {
        this.logger.warn(`Failed to alert for finding ${finding.id}: ${err}`);
      }
    }
  }

  private alertSeverityFor(s: FindingSeverity): AlertSeverity {
    return s === FindingSeverity.CRITICAL ? AlertSeverity.CRITICAL
      : s === FindingSeverity.HIGH || s === FindingSeverity.ATTENTION ? AlertSeverity.HIGH
      : AlertSeverity.MEDIUM;
  }

  // A run-cycle reconstruction shared by every runtime/cycling rule
  // (RUNTIME-001/002/003, COMPRESSOR-001/003, BLOWER-001) — walks a
  // device's power telemetry in order and derives ON/OFF cycle boundaries
  // from a wattage threshold, rather than each rule maintaining its own
  // state machine.
  private async computeRunCycles(deviceRegistryId: string, onWatts: number, sinceHoursAgo: number): Promise<{ start: Date; end: Date | null; durationMinutes: number | null }[]> {
    const since = new Date(Date.now() - sinceHoursAgo * 60 * 60 * 1000);
    const readings = await this.telemetryRepo.find({
      where: { deviceRegistryId, observedAt: MoreThan(since) },
      order: { observedAt: 'ASC' },
    });
    const cycles: { start: Date; end: Date | null; durationMinutes: number | null }[] = [];
    let currentStart: Date | null = null;
    for (const r of readings) {
      const watts = r.numericValue != null ? Number(r.numericValue) : null;
      if (watts == null) continue;
      const isOn = watts >= onWatts;
      if (isOn && !currentStart) {
        currentStart = r.observedAt;
      } else if (!isOn && currentStart) {
        cycles.push({ start: currentStart, end: r.observedAt, durationMinutes: (r.observedAt.getTime() - currentStart.getTime()) / 60000 });
        currentStart = null;
      }
    }
    if (currentStart) cycles.push({ start: currentStart, end: null, durationMinutes: null }); // still running
    return cycles;
  }

  private async equipmentByCode(homeId: string, equipmentCode: string): Promise<Equipment | null> {
    return this.equipmentRepo.findOne({ where: { homeId, equipmentCode } });
  }
}
