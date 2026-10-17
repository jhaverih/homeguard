import { RunCycle, mergeStateRunCycles } from './run-cycles';

// Pure, clock-injected evaluation of the thermostat-driven cooling rules
// (Attenteve HVAC analytics spec, Rules A, C, D/E, G, H, I). Nothing here
// touches a database or Date.now() — callers pass ordered VALID telemetry
// and `now`, which is what makes every rule deterministically testable
// with fixtures. None of these rules uses, requires or infers supply/return
// air temperature.
//
// Every evaluator returns one of four outcomes, mirroring RuleEvaluation:
//   NOT_APPLICABLE      — the situation the rule is about isn't happening
//                         (e.g. not cooling); the caller leaves any existing
//                         finding untouched rather than resolving it on a
//                         non-observation
//   INSUFFICIENT_DATA   — a required input is missing/stale/offline
//   BASELINE_COLLECTING — inputs fine, not enough history yet
//   CLEAR / TRIGGERED   — evaluated

export type Outcome = 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA' | 'BASELINE_COLLECTING' | 'CLEAR' | 'TRIGGERED';

export interface Evaluation {
  outcome: Outcome;
  reason?: string;
  evidence: Record<string, any>;
}

export interface NumSample { t: Date; v: number }
export type HvacCall = 'COOLING' | 'HEATING' | 'OFF';
export interface CallSample { t: Date; call: HvacCall }
export interface SetpointSample { t: Date; mode: string; coolF: number | null; heatF: number | null }

const MIN = 60_000;
const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / MIN;
const round1 = (v: number) => Math.round(v * 10) / 10;

// ── setpoint parsing — the values NestService records via describeSetpoint:
// "COOL 72°F", "HEAT 68°F", "HEATCOOL 68–75.2°F", "ECO 59–82.4°F", "OFF" ──
export function parseSetpoint(value: string, t: Date): SetpointSample {
  const [mode = 'UNKNOWN', rest = ''] = value.trim().split(/\s+/, 2);
  const nums = (rest.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  if (mode === 'COOL') return { t, mode, coolF: nums[0] ?? null, heatF: null };
  if (mode === 'HEAT') return { t, mode, coolF: null, heatF: nums[0] ?? null };
  if (mode === 'HEATCOOL' || mode === 'ECO') return { t, mode, coolF: nums[1] ?? null, heatF: nums[0] ?? null };
  return { t, mode, coolF: null, heatF: null };
}

// ── sample-and-hold over report-on-change series ──

// The value in effect at `at`: the latest sample at or before it, if no
// older than maxHoldMin. A gap longer than the hold is unknown, never a
// value — a missing update is not a temperature change.
export function heldValue(series: NumSample[], at: Date, maxHoldMin: number): number | null {
  let last: NumSample | null = null;
  for (const s of series) { if (s.t <= at) last = s; else break; }
  if (!last || minutesBetween(last.t, at) > maxHoldMin) return null;
  return last.v;
}

// Every held value across [from, to], or null if any part of the window has
// no value within the hold time.
export function valuesAcross(series: NumSample[], from: Date, to: Date, maxHoldMin: number): number[] | null {
  const start = heldValue(series, from, maxHoldMin);
  if (start == null) return null;
  const values = [start];
  // Gaps are measured from the actual last REPORT, not the window start — a
  // probe last heard from 40 min ago isn't current just because the window
  // began 10 min ago.
  let prev = [...series].reverse().find((s) => s.t <= from)!.t;
  for (const s of series) {
    if (s.t <= from) continue;
    if (s.t > to) break;
    if (minutesBetween(prev, s.t) > maxHoldMin) return null;
    values.push(s.v);
    prev = s.t;
  }
  if (minutesBetween(prev, to) > maxHoldMin) return null;
  return values;
}

// ── thermostat call state ──

// The call in effect at `at` and since when it has been continuously in
// effect (a repeated identical sample doesn't restart it).
export function callAt(calls: CallSample[], at: Date): { call: HvacCall; since: Date } | null {
  let current: { call: HvacCall; since: Date } | null = null;
  for (const c of calls) {
    if (c.t > at) break;
    if (!current || current.call !== c.call) current = { call: c.call, since: c.t };
  }
  return current;
}

export function setpointAt(setpoints: SetpointSample[], at: Date): SetpointSample | null {
  let last: SetpointSample | null = null;
  for (const s of setpoints) { if (s.t <= at) last = s; else break; }
  return last;
}

// Each recorded setpoint row is a change (NestService dedups unchanged ones).
export function lastSetpointChange(setpoints: SetpointSample[], at: Date): Date | null {
  return setpointAt(setpoints, at)?.t ?? null;
}

// A stop followed by a start this soon is one continuous run: zone
// hand-offs report one thermostat's OFF a moment before the other's
// COOLING, and no compressor restarts within a minute anyway.
export const HANDOFF_MERGE_MINUTES = 1;

// Whole-system COOLING cycles across every zone thermostat on one piece of
// equipment — running while any zone calls for cooling (zone dampers on one
// air handler), so a hand-off between zones is one cycle, never two.
export function systemCoolingCycles(callsByZone: CallSample[][]): RunCycle[] {
  const merged = callsByZone
    .flatMap((calls, i) => calls.map((c) => ({ deviceRegistryId: String(i), observedAt: c.t, numericValue: c.call === 'COOLING' ? 1 : 0 })))
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const out: RunCycle[] = [];
  for (const c of mergeStateRunCycles(merged)) {
    const prev = out[out.length - 1];
    if (prev?.end && minutesBetween(prev.end, c.start) <= HANDOFF_MERGE_MINUTES) {
      out[out.length - 1] = { start: prev.start, end: c.end, durationMinutes: c.end ? minutesBetween(prev.start, c.end) : null };
    } else out.push(c);
  }
  return out;
}

export function openCycleAt(cycles: RunCycle[], at: Date): RunCycle | null {
  return cycles.find((c) => c.start <= at && (c.end == null || c.end > at)) ?? null;
}

// ── zone context shared by Rules A, H, I ──

export interface ZoneInputs {
  now: Date;
  temps: NumSample[];
  setpoints: SetpointSample[];
  calls: CallSample[];
  online: boolean;
  tempStaleMinutes: number;
}

function zoneInputProblem(z: ZoneInputs): string | null {
  if (!z.online) return 'Thermostat is offline';
  const latest = z.temps[z.temps.length - 1];
  if (!latest) return 'No indoor temperature reported';
  if (minutesBetween(latest.t, z.now) > z.tempStaleMinutes) return `Indoor temperature not updated for ${Math.round(minutesBetween(latest.t, z.now))} minutes`;
  return null;
}

// The current continuous cooling call, measured from the later of its start
// and the last setpoint/mode change — a setpoint change mid-cycle restarts
// the clock, since the target itself moved.
function activeCooling(z: ZoneInputs): { since: Date; coolF: number; minutes: number } | null {
  const call = callAt(z.calls, z.now);
  if (call?.call !== 'COOLING') return null;
  const sp = setpointAt(z.setpoints, z.now);
  if (sp?.coolF == null) return null;
  const changed = lastSetpointChange(z.setpoints, z.now);
  const since = changed && changed > call.since ? changed : call.since;
  return { since, coolF: sp.coolF, minutes: minutesBetween(since, z.now) };
}

// ── Rule A — cooling performance degradation (HVAC-COMFORT-001) ──
export function evaluateCoolingPerformance(z: ZoneInputs, cfg: { minActiveMinutes: number; errorF: number; minProgressF: number; holdMinutes: number }): Evaluation {
  if (z.calls.length === 0) return { outcome: 'INSUFFICIENT_DATA', reason: 'Thermostat does not report its heating/cooling action', evidence: {} };
  const problem = zoneInputProblem(z);
  if (problem) return { outcome: 'INSUFFICIENT_DATA', reason: problem, evidence: {} };
  const active = activeCooling(z);
  if (!active) return { outcome: 'NOT_APPLICABLE', reason: 'Not actively cooling', evidence: {} };
  if (active.minutes < cfg.minActiveMinutes) return { outcome: 'NOT_APPLICABLE', reason: 'Cooling has not run long enough to assess', evidence: { activeMinutes: Math.round(active.minutes) } };

  const windowStart = new Date(z.now.getTime() - cfg.minActiveMinutes * MIN);
  const temps = valuesAcross(z.temps, windowStart, z.now, cfg.holdMinutes);
  if (!temps) return { outcome: 'INSUFFICIENT_DATA', reason: 'Gap in indoor temperature readings during the cooling call', evidence: {} };
  const errors = temps.map((t) => t - active.coolF);
  const startError = errors[0];
  const nowError = errors[errors.length - 1];
  const progress = startError - nowError;
  const evidence = {
    coolSetpointF: active.coolF, activeMinutes: Math.round(active.minutes),
    startErrorF: round1(startError), currentErrorF: round1(nowError), progressF: round1(progress), minErrorF: round1(Math.min(...errors)),
  };
  const triggered = errors.every((e) => e > cfg.errorF) && progress < cfg.minProgressF;
  return { outcome: triggered ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── Rule H — failure to make progress toward setpoint (HVAC-COMFORT-003) ──
export function evaluateSetpointProgress(z: ZoneInputs, cfg: { checkAfterMinutes: number; minInitialErrorF: number; minDecreaseF: number; holdMinutes: number }): Evaluation {
  if (z.calls.length === 0) return { outcome: 'INSUFFICIENT_DATA', reason: 'Thermostat does not report its heating/cooling action', evidence: {} };
  const problem = zoneInputProblem(z);
  if (problem) return { outcome: 'INSUFFICIENT_DATA', reason: problem, evidence: {} };
  const active = activeCooling(z);
  if (!active) return { outcome: 'NOT_APPLICABLE', reason: 'Not actively cooling', evidence: {} };
  if (active.minutes < cfg.checkAfterMinutes) return { outcome: 'NOT_APPLICABLE', reason: 'Too early in the cooling call', evidence: { activeMinutes: Math.round(active.minutes) } };

  const startTemp = heldValue(z.temps, active.since, cfg.holdMinutes);
  const nowTemp = heldValue(z.temps, z.now, cfg.holdMinutes);
  if (startTemp == null || nowTemp == null) return { outcome: 'INSUFFICIENT_DATA', reason: 'No indoor temperature at the start of the cooling call', evidence: {} };
  const startError = startTemp - active.coolF;
  const decrease = startTemp - nowTemp;
  const evidence = { coolSetpointF: active.coolF, activeMinutes: Math.round(active.minutes), startErrorF: round1(startError), decreaseF: round1(decrease) };
  if (startError < cfg.minInitialErrorF) return { outcome: 'CLEAR', reason: 'Started close to setpoint', evidence };
  return { outcome: decrease < cfg.minDecreaseF ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── Rule I (observed-state half) — expected cooling call not observed (HVAC-STATE-001) ──
// Only what the thermostat itself reports is used: Cool (or Heat·Cool) mode,
// zone well above its cooling setpoint for the whole grace period, yet no
// cooling call observed — and no setpoint/mode change during it. Says
// nothing about whether the compressor physically ran.
export function evaluateExpectedState(z: ZoneInputs, cfg: { errorF: number; graceMinutes: number; exclusionMinutes: number; holdMinutes: number }): Evaluation {
  if (z.calls.length === 0) return { outcome: 'INSUFFICIENT_DATA', reason: 'Thermostat does not report its heating/cooling action', evidence: {} };
  const problem = zoneInputProblem(z);
  if (problem) return { outcome: 'INSUFFICIENT_DATA', reason: problem, evidence: {} };
  const sp = setpointAt(z.setpoints, z.now);
  if (!sp || !(sp.mode === 'COOL' || sp.mode === 'HEATCOOL') || sp.coolF == null) return { outcome: 'NOT_APPLICABLE', reason: 'Not in a cooling mode', evidence: {} };

  const windowStart = new Date(z.now.getTime() - cfg.graceMinutes * MIN);
  const changed = lastSetpointChange(z.setpoints, z.now);
  if (changed && minutesBetween(changed, z.now) < cfg.graceMinutes + cfg.exclusionMinutes) {
    return { outcome: 'NOT_APPLICABLE', reason: 'Setpoint or mode changed recently', evidence: {} };
  }
  const temps = valuesAcross(z.temps, windowStart, z.now, cfg.holdMinutes);
  if (!temps) return { outcome: 'INSUFFICIENT_DATA', reason: 'Gap in indoor temperature readings', evidence: {} };
  const errors = temps.map((t) => t - sp.coolF!);
  const callAtStart = callAt(z.calls, windowStart);
  const coolingSeen = callAtStart?.call === 'COOLING' || z.calls.some((c) => c.t > windowStart && c.t <= z.now && c.call === 'COOLING');
  const evidence = { coolSetpointF: sp.coolF, mode: sp.mode, minErrorF: round1(Math.min(...errors)), windowMinutes: cfg.graceMinutes, coolingCallObserved: coolingSeen };
  return { outcome: errors.every((e) => e > cfg.errorF) && !coolingSeen ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── Rule C — frequent cooling cycling (HVAC-RUNTIME-003, HVAC_STATE path) ──
// Counts whole-system cooling STARTS (zone hand-offs merged), excluding
// starts shortly after any zone's setpoint/mode change.
export function evaluateFrequentCycling(cycles: RunCycle[], setpointChanges: Date[], now: Date, cfg: { maxStarts: number; windowMinutes: number; exclusionMinutes: number }): Evaluation {
  const windowStart = new Date(now.getTime() - cfg.windowMinutes * MIN);
  const starts = cycles.map((c) => c.start).filter((s) => s > windowStart && s <= now);
  const counted = starts.filter((s) => !setpointChanges.some((ch) => ch <= s && minutesBetween(ch, s) <= cfg.exclusionMinutes));
  const evidence = { coolingStarts: counted.length, excludedStarts: starts.length - counted.length, windowMinutes: cfg.windowMinutes };
  return { outcome: counted.length > cfg.maxStarts ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── Compressor cycling inferred from thermostat calls (HVAC-COMPRESSOR-005/006/007) ──
// No compressor sensor: a whole-system cooling call (zones merged) stands in
// for a compressor run. That's what the thermostat asked for, not proof the
// compressor started, so these are WATCH/ATTENTION patterns, never a diagnosis.
const near = (t: Date, changes: Date[], minutes: number) => changes.some((ch) => ch <= t && minutesBetween(ch, t) <= minutes);

// Short runs: completed cycles shorter than maxRunMinutes inside the window.
export function evaluateShortRuns(cycles: RunCycle[], setpointChanges: Date[], now: Date, cfg: { maxRunMinutes: number; count: number; windowMinutes: number; exclusionMinutes: number }): Evaluation {
  const windowStart = new Date(now.getTime() - cfg.windowMinutes * MIN);
  const completed = cycles.filter((c) => c.end && c.durationMinutes != null && c.end > windowStart && c.end <= now);
  const short = completed.filter((c) => c.durationMinutes! < cfg.maxRunMinutes);
  // A setpoint/mode change can legitimately end or start a brief run.
  const counted = short.filter((c) => !near(c.start, setpointChanges, cfg.exclusionMinutes) && !near(c.end!, setpointChanges, cfg.exclusionMinutes));
  const evidence = {
    shortRunCount: counted.length, excludedShortRuns: short.length - counted.length, completedRuns: completed.length,
    shortRunMinutes: counted.map((c) => round1(c.durationMinutes!)), maxRunMinutes: cfg.maxRunMinutes, windowMinutes: cfg.windowMinutes,
  };
  if (completed.length === 0) return { outcome: 'NOT_APPLICABLE', reason: 'No completed cooling runs in the window', evidence };
  return { outcome: counted.length >= cfg.count ? 'TRIGGERED' : 'CLEAR', evidence };
}

// Quick restarts: cooling starting again less than minOffMinutes after the
// previous run ended (the restart pattern compressor protection exists for).
export function evaluateQuickRestarts(cycles: RunCycle[], setpointChanges: Date[], now: Date, cfg: { minOffMinutes: number; count: number; windowMinutes: number; exclusionMinutes: number }): Evaluation {
  const windowStart = new Date(now.getTime() - cfg.windowMinutes * MIN);
  const restarts: { at: Date; offMinutes: number }[] = [];
  for (let i = 1; i < cycles.length; i++) {
    const prevEnd = cycles[i - 1].end;
    const start = cycles[i].start;
    if (!prevEnd || start <= windowStart || start > now) continue;
    restarts.push({ at: start, offMinutes: minutesBetween(prevEnd, start) });
  }
  const quick = restarts.filter((r) => r.offMinutes < cfg.minOffMinutes);
  const counted = quick.filter((r) => !near(r.at, setpointChanges, cfg.exclusionMinutes));
  const evidence = {
    quickRestartCount: counted.length, excludedQuickRestarts: quick.length - counted.length, restarts: restarts.length,
    offMinutes: counted.map((r) => round1(r.offMinutes)), minOffMinutes: cfg.minOffMinutes, windowMinutes: cfg.windowMinutes,
  };
  if (restarts.length === 0) return { outcome: 'NOT_APPLICABLE', reason: 'No cooling restarts in the window', evidence };
  return { outcome: counted.length >= cfg.count ? 'TRIGGERED' : 'CLEAR', evidence };
}

// Starts per day vs this home's own days in the same outdoor band. `days`
// are completed 24-hour periods (oldest→newest); the newest is judged.
export interface DailyStarts { starts: number; band: string; end: Date }
export function evaluateDailyStarts(days: DailyStarts[], cfg: { excessPercent: number; minBaselineDays: number }): Evaluation {
  const latest = days[days.length - 1];
  if (!latest) return { outcome: 'NOT_APPLICABLE', reason: 'No completed day of cooling yet', evidence: {} };
  const comparable = days.slice(0, -1).filter((d) => d.band === latest.band).map((d) => d.starts).sort((a, b) => a - b);
  const evidence: Record<string, any> = { dailyStarts: latest.starts, outdoorBand: latest.band, baselineDays: comparable.length };
  if (comparable.length < cfg.minBaselineDays) return { outcome: 'BASELINE_COLLECTING', reason: 'Baseline collecting', evidence };
  const median = comparable[Math.floor(comparable.length / 2)];
  evidence.baselineMedianStarts = median;
  // At least 3 more starts than usual, so a quiet baseline (e.g. 2/day)
  // doesn't flag a day with 4.
  return { outcome: latest.starts > median * (1 + cfg.excessPercent / 100) && latest.starts - median >= 3 ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── Rule B — extended cooling runtime (HVAC-RUNTIME-001, HVAC_STATE path) ──
export interface CycleRecord { minutes: number; band: string; setpointChanged: boolean; end: Date }

// `recent` = the latest completed cycles (oldest→newest), `baseline` = prior
// comparable cycles. Cycles with a setpoint change are excluded from both.
export function evaluateExtendedRuntime(recent: CycleRecord[], baseline: CycleRecord[], cfg: { excessPercent: number; consecutive: number; minBaselineCycles: number }): Evaluation {
  const valid = recent.filter((c) => !c.setpointChanged);
  if (valid.length < cfg.consecutive) return { outcome: 'NOT_APPLICABLE', reason: 'Not enough recent comparable cycles', evidence: { recentCycles: valid.length } };
  const lastN = valid.slice(-cfg.consecutive);
  const band = lastN[lastN.length - 1].band;
  if (lastN.some((c) => c.band !== band)) return { outcome: 'NOT_APPLICABLE', reason: 'Recent cycles ran under different outdoor conditions', evidence: {} };
  const comparable = baseline.filter((c) => !c.setpointChanged && c.band === band).map((c) => c.minutes).sort((a, b) => a - b);
  if (comparable.length < cfg.minBaselineCycles) {
    return { outcome: 'BASELINE_COLLECTING', reason: 'Baseline collecting', evidence: { baselineCycles: comparable.length, outdoorBand: band } };
  }
  const median = comparable[Math.floor(comparable.length / 2)];
  const limit = median * (1 + cfg.excessPercent / 100);
  const evidence = { outdoorBand: band, baselineMedianMinutes: round1(median), recentCycleMinutes: lastN.map((c) => round1(c.minutes)), limitMinutes: round1(limit) };
  return { outcome: lastN.every((c) => c.minutes >= limit) ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── Rules D/E — suction/liquid line temperature anomaly (HVAC-REFRIGERANT-001/002) ──
export interface LineBaseline { meanF: number; samples: number; cycles: number }

// Stable cooling = inside a whole-system cooling run, past its startup
// transient. Only then is a line temperature comparable to its baseline.
export function isStableCooling(cycles: RunCycle[], at: Date, stabilizationMinutes: number): RunCycle | null {
  const cycle = openCycleAt(cycles, at);
  if (!cycle || minutesBetween(cycle.start, at) < stabilizationMinutes) return null;
  return cycle;
}

export function evaluateLineTemp(line: NumSample[], cycles: RunCycle[], now: Date, baseline: LineBaseline | null, cfg: {
  stabilizationMinutes: number; deviationF: number; sustainedMinutes: number; holdMinutes: number; minSamples: number;
}): Evaluation {
  const cycle = openCycleAt(cycles, now);
  if (!cycle) return { outcome: 'NOT_APPLICABLE', reason: 'Not cooling', evidence: {} };
  const windowStart = new Date(now.getTime() - cfg.sustainedMinutes * MIN);
  if (minutesBetween(cycle.start, windowStart) < cfg.stabilizationMinutes) {
    return { outcome: 'NOT_APPLICABLE', reason: 'Cooling run still stabilizing', evidence: { runMinutes: Math.round(minutesBetween(cycle.start, now)) } };
  }
  const values = valuesAcross(line, windowStart, now, cfg.holdMinutes);
  if (!values) return { outcome: 'INSUFFICIENT_DATA', reason: 'Line-temperature probe has not reported recently during cooling', evidence: {} };
  if (!baseline || baseline.samples < cfg.minSamples || baseline.cycles < 3) {
    return { outcome: 'BASELINE_COLLECTING', reason: 'Baseline collecting', evidence: { baselineSamples: baseline?.samples ?? 0, baselineCycles: baseline?.cycles ?? 0 } };
  }
  const deviations = values.map((v) => v - baseline.meanF);
  const allHigh = deviations.every((d) => d >= cfg.deviationF);
  const allLow = deviations.every((d) => d <= -cfg.deviationF);
  const evidence = {
    baselineF: round1(baseline.meanF), currentF: values[values.length - 1], minDeviationF: round1(Math.min(...deviations.map(Math.abs))),
    direction: allHigh ? 'above' : allLow ? 'below' : null, sustainedMinutes: cfg.sustainedMinutes, runMinutes: Math.round(minutesBetween(cycle.start, now)),
  };
  return { outcome: allHigh || allLow ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── Rule G — sustained high indoor humidity during cooling (HVAC-HUMIDITY-001) ──
export function evaluateSustainedHumidity(humidity: NumSample[], cycles: RunCycle[], now: Date, cfg: {
  thresholdPercent: number; sustainedMinutes: number; minCoolingFraction: number; holdMinutes: number; staleMinutes: number;
}): Evaluation {
  const latest = humidity[humidity.length - 1];
  if (!latest) return { outcome: 'INSUFFICIENT_DATA', reason: 'No humidity reported', evidence: {} };
  if (minutesBetween(latest.t, now) > cfg.staleMinutes) return { outcome: 'INSUFFICIENT_DATA', reason: 'Humidity not updated recently', evidence: {} };
  const windowStart = new Date(now.getTime() - cfg.sustainedMinutes * MIN);
  const coolingMinutes = cycles.reduce((sum, c) => {
    const s = Math.max(c.start.getTime(), windowStart.getTime());
    const e = Math.min((c.end ?? now).getTime(), now.getTime());
    return sum + Math.max(0, e - s) / MIN;
  }, 0);
  if (coolingMinutes === 0) return { outcome: 'NOT_APPLICABLE', reason: 'Not cooling', evidence: {} };
  const values = valuesAcross(humidity, windowStart, now, cfg.holdMinutes);
  if (!values) return { outcome: 'INSUFFICIENT_DATA', reason: 'Gap in humidity readings', evidence: {} };
  const coolingFraction = coolingMinutes / cfg.sustainedMinutes;
  const evidence = { minHumidity: Math.min(...values), currentHumidity: values[values.length - 1], coolingMinutes: Math.round(coolingMinutes), windowMinutes: cfg.sustainedMinutes };
  if (coolingFraction < cfg.minCoolingFraction / 100) return { outcome: 'NOT_APPLICABLE', reason: 'Not enough cooling in the window', evidence };
  return { outcome: values.every((v) => v > cfg.thresholdPercent) ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── Rule F — combined performance degradation (HVAC-COMBINED-004) ──
// Correlated rule IDs collapse into one symptom so e.g. Rule A + Rule H on
// the same slow cooldown don't count as two independent problems.
export const SYMPTOM_GROUPS: Record<string, string> = {
  'HVAC-COMFORT-001': 'TEMPERATURE_RESPONSE',
  'HVAC-COMFORT-003': 'TEMPERATURE_RESPONSE',
  'HVAC-RUNTIME-001': 'RUNTIME',
  'HVAC-RUNTIME-003': 'CYCLING',
  // Same underlying symptom as frequent cycling — counted once.
  'HVAC-COMPRESSOR-005': 'CYCLING',
  'HVAC-COMPRESSOR-006': 'CYCLING',
  'HVAC-COMPRESSOR-007': 'CYCLING',
  'HVAC-REFRIGERANT-001': 'REFRIGERANT_LINE',
  'HVAC-REFRIGERANT-002': 'REFRIGERANT_LINE',
  'HVAC-HUMIDITY-001': 'HUMIDITY',
};

export function evaluateCombined(active: { ruleId: string; detectedAt: Date }[], now: Date, cfg: { alignmentHours: number }): Evaluation & { symptoms: string[] } {
  const since = now.getTime() - cfg.alignmentHours * 60 * MIN;
  const symptoms = [...new Set(active.filter((f) => SYMPTOM_GROUPS[f.ruleId] && f.detectedAt.getTime() >= since).map((f) => SYMPTOM_GROUPS[f.ruleId]))].sort();
  // Needs corroboration: two distinct symptoms, at least one of them about
  // the system's actual cooling performance (temperature response, runtime
  // or cycling) — two "side" signals alone (humidity + line temp) aren't
  // enough to call cooling performance degraded.
  const performance = symptoms.some((s) => ['TEMPERATURE_RESPONSE', 'RUNTIME', 'CYCLING'].includes(s));
  const triggered = symptoms.length >= 2 && performance;
  return { outcome: triggered ? 'TRIGGERED' : 'CLEAR', evidence: { symptoms }, symptoms };
}
