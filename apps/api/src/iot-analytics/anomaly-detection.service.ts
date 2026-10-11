import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { In, MoreThan, Not, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { AnalyticsAnomaly } from './entities/analytics-anomaly.entity';
import { TelemetryDataQuality, TelemetryEvent } from './entities/telemetry-event.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { SensorRole } from '../common/enums/sensor-role.enum';
import { ThresholdsService } from './thresholds.service';
import { EventCorrelationService } from './event-correlation.service';
import { CallSample, parseSetpoint } from './cooling-analytics';
import { preprocess, segmentRates } from './anomaly/preprocess';
import { AnomalyCandidate, DETECTOR_VERSION, DetectorConfig, detectDrift, detectSeries } from './anomaly/anomaly-detector';
import { buildContextTimeline, contextBaseline, ContextTimeline } from './anomaly/context';
import { ROLE_COMPONENT } from './anomaly/correlation';

// Sensors the statistical detector analyses, with the gap beyond which the
// series is split (never bridged) and the fastest physically plausible
// change for that kind of sensor (anything faster = sensor/communication
// problem, not HVAC behavior).
const ANALYSED: Partial<Record<SensorRole, { maxGapMinutes: number; maxRatePerMinute: number }>> = {
  [SensorRole.HVAC_SUCTION_LINE_TEMP]: { maxGapMinutes: 30, maxRatePerMinute: 15 },
  [SensorRole.HVAC_LIQUID_LINE_TEMP]: { maxGapMinutes: 30, maxRatePerMinute: 15 },
  [SensorRole.HVAC_SUPPLY_TEMP]: { maxGapMinutes: 30, maxRatePerMinute: 10 },
  [SensorRole.HVAC_RETURN_TEMP]: { maxGapMinutes: 30, maxRatePerMinute: 10 },
  [SensorRole.INDOOR_AMBIENT_TEMP]: { maxGapMinutes: 90, maxRatePerMinute: 3 },
  [SensorRole.INDOOR_AMBIENT_HUMIDITY]: { maxGapMinutes: 30, maxRatePerMinute: 10 },
};
const EVALUATION_MINUTES = 60;

// Statistical anomaly detection (spec §4) — runs alongside, never instead
// of, the deterministic rules. SHADOW by design: it writes analytics_
// anomalies only — no findings, no alerts, no component-health input.
@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(
    @InjectRepository(AnalyticsAnomaly) private anomaliesRepo: Repository<AnalyticsAnomaly>,
    @InjectRepository(TelemetryEvent) private telemetryRepo: Repository<TelemetryEvent>,
    @InjectRepository(SensorAssignment) private assignmentsRepo: Repository<SensorAssignment>,
    @InjectRepository(DeviceRegistry) private registryRepo: Repository<DeviceRegistry>,
    @InjectRepository(YolinkHome) private yolinkHomesRepo: Repository<YolinkHome>,
    private thresholds: ThresholdsService,
    private config: ConfigService,
    private correlation: EventCorrelationService,
  ) {}

  get enabled(): boolean {
    return this.config.get('HVAC_ANOMALY_ENABLED', 'true') !== 'false';
  }

  @Cron('45 */5 * * * *')
  async runAll(): Promise<void> {
    if (!this.enabled) return;
    const homes = await this.yolinkHomesRepo.find({ where: { isActive: true } });
    for (const home of homes) {
      if (!home.homeId) continue;
      await this.runForHome(home, new Date()).catch((e) => this.logger.warn(`Anomaly detection failed for home ${home.homeId}: ${e.message}`));
    }
  }

  async runForHome(home: YolinkHome, now: Date): Promise<void> {
    const homeId = home.homeId!;
    const t = await this.loadThresholds(home.customerId);
    const cfg: DetectorConfig = {
      zThreshold: t.ANOMALY_Z_THRESHOLD, rateZThreshold: t.ANOMALY_RATE_Z_THRESHOLD, minConsecutive: t.ANOMALY_MIN_CONSECUTIVE,
      persistenceMinutes: t.ANOMALY_PERSISTENCE_MINUTES, minSamples: t.ANOMALY_MIN_SAMPLES,
      transitionExclusionMinutes: t.SETPOINT_CHANGE_EXCLUSION_MINUTES, evaluationMinutes: EVALUATION_MINUTES,
    };
    const configVersion = createHash('sha256').update(JSON.stringify(t)).digest('hex').slice(0, 10);
    const devices = await this.registryRepo.find({ where: { homeId } });
    const assignments = await this.assignmentsRepo.find({ where: { deviceRegistryId: In(devices.map((d) => d.id)) } });
    const roleOf = new Map(assignments.map((a) => [a.deviceRegistryId, a]));
    const since = new Date(now.getTime() - t.ANOMALY_WINDOW_DAYS * 86_400_000);
    const timeline = await this.loadTimeline(devices, roleOf, since);
    const hvacEquipmentId = assignments.find((a) => a.sensorRole === SensorRole.HVAC_STATE)?.equipmentId ?? null;
    let scored = 0;
    let found = 0;

    for (const device of devices) {
      const assignment = roleOf.get(device.id);
      const spec = assignment ? ANALYSED[assignment.sensorRole] : undefined;
      if (!assignment || !spec) continue;
      const rows = await this.telemetryRepo.find({
        where: { deviceRegistryId: device.id, observedAt: MoreThan(since), dataQuality: TelemetryDataQuality.VALID },
        order: { observedAt: 'ASC' },
      });
      const numeric = rows.filter((r) => r.numericValue != null).map((r) => ({ t: r.observedAt, v: Number(r.numericValue), receivedAt: r.receivedAt }));
      const pre = preprocess(numeric, spec);
      if (!pre.latestAt) continue;
      const ageMin = (now.getTime() - pre.latestAt.getTime()) / 60_000;
      // Stale series are not scored at all — a missing update is not a change.
      if (ageMin > spec.maxGapMinutes) continue;

      const evalStart = now.getTime() - EVALUATION_MINUTES * 60_000;
      const current = timeline.at(pre.latestAt);
      const history = pre.points.filter((p) => p.t.getTime() < evalStart);
      const base = contextBaseline(history, timeline, current, cfg.minSamples);
      const baselineRates = segmentRates(pre.segments)
        .filter((r) => r.t.getTime() < evalStart && timeline.at(r.t).mode === current.mode).map((r) => r.v);
      const unit = rows.find((r) => r.unit)?.unit ?? '';
      const { candidates } = detectSeries({ now, unit, pre, baselineValues: base.values, baselineRates, transitions: timeline.transitions, operatingStateKnown: current.mode !== 'UNKNOWN' }, cfg);

      const common = {
        customerId: home.customerId, homeId, equipmentId: assignment.equipmentId ?? hvacEquipmentId, deviceRegistryId: device.id,
        sensorRole: assignment.sensorRole, component: ROLE_COMPONENT[assignment.sensorRole] ?? 'OTHER', configVersion,
        dataQuality: { duplicates: pre.duplicates, outOfOrder: pre.outOfOrder, gaps: pre.gaps.length, latestReadingAgeMinutes: Math.round(ageMin) },
        context: { ...current, baselineLevel: base.level, reducedContext: base.reducedContext },
      };
      await this.store(candidates, common, t.ANOMALY_WINDOW_DAYS);
      await this.resolveMissing(device.id, candidates, now);
      scored++;
      found += candidates.filter((c) => c.state === 'ACTIVE' && !c.transition).length;
    }

    // Hourly: drift + energy advisories (slower-moving signals).
    if (now.getUTCMinutes() < 5) {
      await this.detectDriftForHome(home, devices, roleOf, t, configVersion, now, hvacEquipmentId);
      await this.detectEnergyAdvisories(home, devices, roleOf, t, configVersion, now, hvacEquipmentId);
    }
    const events = await this.correlation.correlateHome(home, now);
    // One line per run so a quiet run is visibly a run, not silence.
    this.logger.log(`Anomaly detection (shadow) home ${homeId}: ${scored} sensor(s) evaluated, ${found} active anomaly candidate(s), ${events.filter((e) => e.status === 'ACTIVE').length} active event(s)`);
  }

  // ── storage ───────────────────────────────────────────────────────────────

  private async store(candidates: AnomalyCandidate[], common: Partial<AnalyticsAnomaly>, windowDays: number): Promise<void> {
    for (const c of candidates) {
      const key = { deviceRegistryId: common.deviceRegistryId!, type: c.type, startedAt: c.startedAt };
      let row = await this.anomaliesRepo.findOne({ where: key });
      if (!row) row = this.anomaliesRepo.create({ ...key, shadow: true });
      Object.assign(row, common, {
        state: c.state, lastObservedAt: c.lastObservedAt, resolvedAt: c.state === 'RESOLVED' ? c.lastObservedAt : null,
        observed: c.observed, baseline: c.baseline ? { ...c.baseline, windowDays } : null, deviation: c.deviation, unit: c.unit,
        robustZ: c.robustZ, consecutive: c.consecutive, method: c.method, detectorVersion: DETECTOR_VERSION,
        transition: c.transition, note: c.note ?? null, supporting: null,
      });
      await this.anomaliesRepo.save(row);
    }
  }

  // An open persistent/unconfirmed deviation not re-detected this pass has ended.
  private async resolveMissing(deviceRegistryId: string, candidates: AnomalyCandidate[], now: Date): Promise<void> {
    const open = await this.anomaliesRepo.find({ where: { deviceRegistryId, type: 'PERSISTENT', state: Not('RESOLVED') } });
    for (const a of open) {
      if (candidates.some((c) => c.type === 'PERSISTENT' && c.startedAt.getTime() === a.startedAt.getTime())) continue;
      a.state = 'RESOLVED';
      a.resolvedAt = now;
      await this.anomaliesRepo.save(a);
    }
  }

  // ── context ───────────────────────────────────────────────────────────────

  private async loadTimeline(devices: DeviceRegistry[], roleOf: Map<string, SensorAssignment>, since: Date): Promise<ContextTimeline> {
    const ids = (role: SensorRole) => devices.filter((d) => roleOf.get(d.id)?.sensorRole === role).map((d) => d.id);
    const rows = async (role: SensorRole) => {
      const deviceIds = ids(role);
      if (deviceIds.length === 0) return [];
      return this.telemetryRepo.find({ where: { deviceRegistryId: In(deviceIds), observedAt: MoreThan(since), dataQuality: TelemetryDataQuality.VALID }, order: { observedAt: 'ASC' } });
    };
    const [calls, setpoints, outdoor] = await Promise.all([rows(SensorRole.HVAC_STATE), rows(SensorRole.HVAC_THERMOSTAT_SETPOINT), rows(SensorRole.HVAC_OUTDOOR_TEMP)]);
    const byZone = new Map<string, CallSample[]>();
    for (const r of calls) byZone.set(r.deviceRegistryId, [...(byZone.get(r.deviceRegistryId) ?? []), { t: r.observedAt, call: r.value as CallSample['call'] }]);
    return buildContextTimeline([...byZone.values()], outdoor.filter((r) => r.numericValue != null).map((r) => ({ t: r.observedAt, v: Number(r.numericValue) })), setpoints.map((r) => r.observedAt));
  }

  private async loadThresholds(customerId: string): Promise<Record<string, number>> {
    const keys = ['ANOMALY_WINDOW_DAYS', 'ANOMALY_MIN_SAMPLES', 'ANOMALY_Z_THRESHOLD', 'ANOMALY_RATE_Z_THRESHOLD', 'ANOMALY_MIN_CONSECUTIVE',
      'ANOMALY_PERSISTENCE_MINUTES', 'SETPOINT_CHANGE_EXCLUSION_MINUTES', 'DRIFT_RECENT_DAYS', 'DRIFT_PRIOR_DAYS', 'DRIFT_MIN_SHIFT_MAD',
      'ENERGY_SETPOINT_CHANGES_PER_DAY', 'ENERGY_MODE_FLIPS_PER_DAY'];
    const values = await Promise.all(keys.map((k) => this.thresholds.getValue(k, customerId)));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  }

  // ── drift (spec §4.3 D) ───────────────────────────────────────────────────
  // Stable-cooling readings (15+ min into a run): recent vs prior medians.

  private async detectDriftForHome(home: YolinkHome, devices: DeviceRegistry[], roleOf: Map<string, SensorAssignment>,
    t: Record<string, number>, configVersion: string, now: Date, hvacEquipmentId: string | null): Promise<void> {
    const totalDays = t.DRIFT_RECENT_DAYS + t.DRIFT_PRIOR_DAYS;
    const since = new Date(now.getTime() - totalDays * 86_400_000);
    const timeline = await this.loadTimeline(devices, roleOf, since);
    const split = now.getTime() - t.DRIFT_RECENT_DAYS * 86_400_000;
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    for (const device of devices) {
      const assignment = roleOf.get(device.id);
      if (!assignment || !ANALYSED[assignment.sensorRole]) continue;
      const rows = await this.telemetryRepo.find({ where: { deviceRegistryId: device.id, observedAt: MoreThan(since), dataQuality: TelemetryDataQuality.VALID }, order: { observedAt: 'ASC' } });
      const stable = rows.filter((r) => r.numericValue != null).map((r) => ({ t: r.observedAt, v: Number(r.numericValue) }))
        .filter((r) => { const c = timeline.at(r.t); return c.mode === 'COOLING' && c.cycleBucket === '15+'; });
      const unit = rows.find((r) => r.unit)?.unit ?? '';
      const drift = detectDrift(stable.filter((r) => r.t.getTime() >= split), stable.filter((r) => r.t.getTime() < split).map((r) => r.v), unit,
        { minShiftMad: t.DRIFT_MIN_SHIFT_MAD, minSamples: t.ANOMALY_MIN_SAMPLES });
      if (!drift) {
        const open = await this.anomaliesRepo.find({ where: { deviceRegistryId: device.id, type: 'DRIFT', state: 'ACTIVE' } });
        for (const a of open) { a.state = 'RESOLVED'; a.resolvedAt = now; await this.anomaliesRepo.save(a); }
        continue;
      }
      await this.store([{ ...drift, startedAt: dayStart }], {
        customerId: home.customerId, homeId: home.homeId!, equipmentId: assignment.equipmentId ?? hvacEquipmentId, deviceRegistryId: device.id,
        sensorRole: assignment.sensorRole, component: ROLE_COMPONENT[assignment.sensorRole] ?? 'OTHER', configVersion,
        dataQuality: { recentSamples: stable.filter((r) => r.t.getTime() >= split).length },
        context: { mode: 'COOLING', cycleBucket: '15+', recentDays: t.DRIFT_RECENT_DAYS, priorDays: t.DRIFT_PRIOR_DAYS },
      }, totalDays);
    }
  }

  // ── energy advisories (spec §9) — advisory only, no savings estimates ────

  private async detectEnergyAdvisories(home: YolinkHome, devices: DeviceRegistry[], roleOf: Map<string, SensorAssignment>,
    t: Record<string, number>, configVersion: string, now: Date, hvacEquipmentId: string | null): Promise<void> {
    const since = new Date(now.getTime() - 86_400_000);
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    for (const device of devices.filter((d) => roleOf.get(d.id)?.sensorRole === SensorRole.HVAC_THERMOSTAT_SETPOINT)) {
      const rows = await this.telemetryRepo.find({ where: { deviceRegistryId: device.id, observedAt: MoreThan(since) }, order: { observedAt: 'ASC' } });
      const modes = rows.map((r) => parseSetpoint(r.value, r.observedAt).mode);
      let flips = 0;
      for (let i = 1; i < modes.length; i++) if ((modes[i - 1] === 'HEAT' && modes[i] === 'COOL') || (modes[i - 1] === 'COOL' && modes[i] === 'HEAT')) flips++;
      const advisories: { kind: string; value: number; limit: number; note: string }[] = [];
      if (rows.length > t.ENERGY_SETPOINT_CHANGES_PER_DAY) advisories.push({ kind: 'setpoint_changes', value: rows.length, limit: t.ENERGY_SETPOINT_CHANGES_PER_DAY, note: `${rows.length} setpoint/mode changes in 24 hours` });
      if (flips > t.ENERGY_MODE_FLIPS_PER_DAY) advisories.push({ kind: 'mode_flips', value: flips, limit: t.ENERGY_MODE_FLIPS_PER_DAY, note: `${flips} heating↔cooling switches in 24 hours` });
      for (const a of advisories) {
        const startedAt = new Date(dayStart.getTime() + (a.kind === 'mode_flips' ? 1 : 0)); // distinct key per kind per day
        let row = await this.anomaliesRepo.findOne({ where: { deviceRegistryId: device.id, type: 'ENERGY_ADVISORY', startedAt } });
        if (!row) row = this.anomaliesRepo.create({ deviceRegistryId: device.id, type: 'ENERGY_ADVISORY', startedAt, shadow: true });
        Object.assign(row, {
          customerId: home.customerId, homeId: home.homeId!, equipmentId: roleOf.get(device.id)?.equipmentId ?? hvacEquipmentId,
          sensorRole: SensorRole.HVAC_THERMOSTAT_SETPOINT, component: 'ENERGY', state: 'ACTIVE', lastObservedAt: now, resolvedAt: null,
          observed: a.value, baseline: null, deviation: a.value - a.limit, unit: 'count', robustZ: null, consecutive: a.value,
          method: `energy-${a.kind}`, detectorVersion: DETECTOR_VERSION, configVersion, dataQuality: null,
          context: { windowHours: 24, limit: a.limit }, supporting: null, transition: false, note: `${a.note} — advisory only; no energy savings are estimated`,
        });
        await this.anomaliesRepo.save(row);
      }
    }
  }
}
