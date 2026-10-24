import { CallSample, Evaluation, NumSample, SetpointSample, heldValue } from './cooling-analytics';

// Comfort analytics per zone thermostat (HVAC-COMFORT-002 v2, HVAC-COMFORT-004).
// The question is never "did the temperature move?" but "was the zone
// outside the range its own thermostat mode is trying to hold, at a moment
// when that mode could have corrected it?" Pure.
//
// Range per mode (± tolerance for the thermostat's normal differential):
//   COOL      — at or below the cooling setpoint
//   HEAT      — at or above the heating setpoint
//   HEATCOOL / ECO — between the heating and cooling setpoints
//   OFF / unknown  — no expectation at all
// A zone past its setpoint in a direction its mode can't act on (Cool mode,
// room colder than the setpoint because it's cold outside) is
// OUT_OF_AUTHORITY: a mode/setpoint choice, never an equipment problem.

const MIN = 60_000;
const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / MIN;
const round1 = (v: number) => Math.round(v * 10) / 10;

export type ComfortClass = 'IN_RANGE' | 'RECOVERING' | 'OUTSIDE_RUNNING' | 'OUTSIDE_IDLE' | 'OUT_OF_AUTHORITY' | 'NO_EXPECTATION' | 'UNKNOWN';

export interface ComfortConfig {
  toleranceF: number;
  holdMinutes: number;
  recoveryBaseMinutes: number;
  recoveryPerDegreeMinutes: number;
  stepMinutes?: number;
}

export interface ComfortSummary {
  minutes: Record<ComfortClass, number>;
  // Outside the range while the mode could correct it, and not recovering
  // from a setpoint/mode change — the only part that says anything about
  // the system's ability to hold the temperature.
  uncorrectedMinutes: number;
  uncorrectedDegreeMinutes: number;
  dominantMode: string;
  minF: number | null;
  maxF: number | null;
}

function setpointAt(setpoints: SetpointSample[], at: Date): SetpointSample | null {
  let last: SetpointSample | null = null;
  for (const s of setpoints) { if (s.t <= at) last = s; else break; }
  return last;
}

function callAt(calls: CallSample[], at: Date): CallSample['call'] | null {
  let last: CallSample | null = null;
  for (const c of calls) { if (c.t <= at) last = c; else break; }
  return last?.call ?? null;
}

// The relevant target moved by this much (°F) at a setpoint/mode change.
function changeMagnitude(prev: SetpointSample | null, next: SetpointSample): number {
  if (!prev || prev.mode !== next.mode) return 3; // a mode change: treat as a moderate change
  const d = (a: number | null, b: number | null) => (a != null && b != null ? Math.abs(a - b) : 0);
  return Math.max(d(prev.coolF, next.coolF), d(prev.heatF, next.heatF));
}

// Minutes after each setpoint/mode change during which being outside the
// new range is expected recovery, not a failure to hold it.
function recoveryWindows(setpoints: SetpointSample[], cfg: ComfortConfig): { from: Date; to: Date }[] {
  return setpoints.map((s, i) => {
    const minutes = Math.min(180, cfg.recoveryBaseMinutes + cfg.recoveryPerDegreeMinutes * changeMagnitude(i > 0 ? setpoints[i - 1] : null, s));
    return { from: s.t, to: new Date(s.t.getTime() + minutes * MIN) };
  });
}

export function classifyAt(tempF: number | null, sp: SetpointSample | null, call: CallSample['call'] | null, recovering: boolean, toleranceF: number): { cls: ComfortClass; excessF: number } {
  if (tempF == null || !sp) return { cls: 'UNKNOWN', excessF: 0 };
  const canCool = sp.mode === 'COOL' || sp.mode === 'HEATCOOL' || sp.mode === 'ECO';
  const canHeat = sp.mode === 'HEAT' || sp.mode === 'HEATCOOL' || sp.mode === 'ECO';
  if (!canCool && !canHeat) return { cls: 'NO_EXPECTATION', excessF: 0 };
  // Eco with one temperature is recorded without saying which limit it is.
  if (sp.mode === 'ECO' && (sp.coolF == null || sp.heatF == null)) return { cls: 'NO_EXPECTATION', excessF: 0 };
  const tooWarm = sp.coolF != null ? tempF - (sp.coolF + toleranceF) : null;   // > 0 = above the cooling limit
  const tooCold = sp.heatF != null ? (sp.heatF - toleranceF) - tempF : null;   // > 0 = below the heating limit
  if (canCool && tooWarm != null && tooWarm > 0) {
    if (recovering) return { cls: 'RECOVERING', excessF: tooWarm };
    return { cls: call === 'COOLING' ? 'OUTSIDE_RUNNING' : 'OUTSIDE_IDLE', excessF: tooWarm };
  }
  if (canHeat && tooCold != null && tooCold > 0) {
    if (recovering) return { cls: 'RECOVERING', excessF: tooCold };
    return { cls: call === 'HEATING' ? 'OUTSIDE_RUNNING' : 'OUTSIDE_IDLE', excessF: tooCold };
  }
  // Past the setpoint in the direction this mode cannot act on.
  if (sp.mode === 'COOL' && sp.coolF != null && tempF < sp.coolF - toleranceF) return { cls: 'OUT_OF_AUTHORITY', excessF: 0 };
  if (sp.mode === 'HEAT' && sp.heatF != null && tempF > sp.heatF + toleranceF) return { cls: 'OUT_OF_AUTHORITY', excessF: 0 };
  return { cls: 'IN_RANGE', excessF: 0 };
}

// Walks [from, to] in fixed steps and classifies each step for one zone.
export function summarizeComfort(temps: NumSample[], setpoints: SetpointSample[], calls: CallSample[], from: Date, to: Date, cfg: ComfortConfig): ComfortSummary {
  const step = cfg.stepMinutes ?? 5;
  const minutes: Record<ComfortClass, number> = { IN_RANGE: 0, RECOVERING: 0, OUTSIDE_RUNNING: 0, OUTSIDE_IDLE: 0, OUT_OF_AUTHORITY: 0, NO_EXPECTATION: 0, UNKNOWN: 0 };
  const recovery = recoveryWindows(setpoints, cfg);
  const modeMinutes: Record<string, number> = {};
  let degreeMinutes = 0;
  let minF: number | null = null;
  let maxF: number | null = null;
  for (let t = from.getTime(); t < to.getTime(); t += step * MIN) {
    const at = new Date(t);
    const temp = heldValue(temps, at, cfg.holdMinutes);
    const sp = setpointAt(setpoints, at);
    const recovering = recovery.some((w) => w.from <= at && at < w.to);
    const { cls, excessF } = classifyAt(temp, sp, callAt(calls, at), recovering, cfg.toleranceF);
    minutes[cls] += step;
    if (cls === 'OUTSIDE_RUNNING' || cls === 'OUTSIDE_IDLE') degreeMinutes += excessF * step;
    if (sp) modeMinutes[sp.mode] = (modeMinutes[sp.mode] ?? 0) + step;
    if (temp != null) { minF = minF == null ? temp : Math.min(minF, temp); maxF = maxF == null ? temp : Math.max(maxF, temp); }
  }
  const dominantMode = Object.entries(modeMinutes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UNKNOWN';
  return {
    minutes, uncorrectedMinutes: minutes.OUTSIDE_RUNNING + minutes.OUTSIDE_IDLE, uncorrectedDegreeMinutes: Math.round(degreeMinutes),
    dominantMode, minF: minF == null ? null : round1(minF), maxF: maxF == null ? null : round1(maxF),
  };
}

// ── HVAC-COMFORT-002 v2 — time outside the comfort range vs comparable days ──
export interface ComfortDay { uncorrectedMinutes: number; controllableMinutes: number; band: string; mode: string; end: Date }

export function evaluateComfortDays(days: ComfortDay[], cfg: { excessPercent: number; minMinutes: number; minBaselineDays: number; minControllableMinutes: number }): Evaluation {
  const latest = days[days.length - 1];
  if (!latest) return { outcome: 'NOT_APPLICABLE', reason: 'No completed day yet', evidence: {} };
  const evidence: Record<string, any> = { uncorrectedMinutes: latest.uncorrectedMinutes, outdoorBand: latest.band, mode: latest.mode };
  // A day the mode could barely act on (mostly off, or the room was always
  // on the side the mode can't change) says nothing about holding temperature.
  if (latest.controllableMinutes < cfg.minControllableMinutes) return { outcome: 'NOT_APPLICABLE', reason: 'The thermostat mode had little to control that day', evidence };
  const comparable = days.slice(0, -1)
    .filter((d) => d.band === latest.band && d.mode === latest.mode && d.controllableMinutes >= cfg.minControllableMinutes)
    .map((d) => d.uncorrectedMinutes).sort((a, b) => a - b);
  evidence.baselineDays = comparable.length;
  if (comparable.length < cfg.minBaselineDays) return { outcome: 'BASELINE_COLLECTING', reason: 'Baseline collecting', evidence };
  const median = comparable[Math.floor(comparable.length / 2)];
  evidence.baselineMedianMinutes = median;
  const limit = Math.max(cfg.minMinutes, median * (1 + cfg.excessPercent / 100));
  evidence.limitMinutes = Math.round(limit);
  return { outcome: latest.uncorrectedMinutes > limit ? 'TRIGGERED' : 'CLEAR', evidence };
}

// ── HVAC-COMFORT-004 — thermostat mode doesn't suit the weather (advisory) ──
// Cool mode, the zone well below the temperature this homeowner normally
// cools to, for a sustained period with the outdoors colder still (or the
// Heat-mode mirror). "Normally cools to" is the lowest cooling setpoint the
// zone used recently (referenceF) — a schedule that raises the cooling
// setpoint overnight leaves a comfortable room well below that night
// setpoint, which is not "too cold". Raised once per cold/warm spell: once
// active it stays until the MODE changes or the condition has been absent
// for clearHours; setpoint changes alone neither raise nor clear it.
export interface ModeAdvisoryInput {
  now: Date;
  temps: NumSample[];
  setpoints: SetpointSample[];
  // Lowest cooling setpoint (Cool mode) / highest heating setpoint (Heat
  // mode) the zone used recently; the current setpoint when unknown.
  referenceF: number | null;
  outdoorF: number | null;
  active: boolean;
  lastMetAt: Date | null;
}

// When the current mode began: the earliest sample of the latest unbroken
// run of setpoint samples in this mode.
function modeSince(setpoints: SetpointSample[], at: Date): Date | null {
  const upTo = setpoints.filter((s) => s.t <= at);
  const mode = upTo[upTo.length - 1]?.mode;
  if (!mode) return null;
  let since = upTo[upTo.length - 1].t;
  for (let i = upTo.length - 2; i >= 0 && upTo[i].mode === mode; i--) since = upTo[i].t;
  return since;
}

export function evaluateModeAdvisory(z: ModeAdvisoryInput, cfg: { marginF: number; sustainedMinutes: number; holdMinutes: number; clearHours: number }): Evaluation {
  const sp = setpointAt(z.setpoints, z.now);
  if (!sp || (sp.mode !== 'COOL' && sp.mode !== 'HEAT')) {
    return { outcome: 'NOT_APPLICABLE', reason: 'The thermostat mode can both heat and cool, or is off', evidence: { mode: sp?.mode ?? null } };
  }
  const cold = sp.mode === 'COOL';
  const setpointF = cold ? sp.coolF : sp.heatF;
  const reference = z.referenceF ?? setpointF;
  if (setpointF == null || reference == null) return { outcome: 'INSUFFICIENT_DATA', reason: 'No setpoint reported', evidence: { mode: sp.mode } };
  const windowStart = new Date(z.now.getTime() - cfg.sustainedMinutes * MIN);
  // A mode picked moments ago isn't a stale choice.
  const since = modeSince(z.setpoints, z.now);
  if (since && since > windowStart) return { outcome: 'NOT_APPLICABLE', reason: 'Thermostat mode changed recently', evidence: { mode: sp.mode } };
  const hold = (evidence: Record<string, any>): Evaluation | null =>
    z.active && z.lastMetAt && minutesBetween(z.lastMetAt, z.now) < cfg.clearHours * 60
      ? { outcome: 'TRIGGERED', evidence: { ...evidence, lastMetAt: z.lastMetAt.toISOString() } } : null;
  const samples: number[] = [];
  for (let t = windowStart.getTime(); t <= z.now.getTime(); t += 5 * MIN) {
    const v = heldValue(z.temps, new Date(t), cfg.holdMinutes);
    if (v == null) return hold({ mode: sp.mode }) ?? { outcome: 'INSUFFICIENT_DATA', reason: 'Gap in indoor temperature readings', evidence: { mode: sp.mode } };
    samples.push(v);
  }
  const current = samples[samples.length - 1];
  const evidence: Record<string, any> = {
    mode: sp.mode, direction: cold ? 'cold' : 'warm', setpointF, referenceF: reference, currentF: round1(current),
    extremeF: round1(cold ? Math.min(...samples) : Math.max(...samples)), outdoorF: z.outdoorF == null ? null : Math.round(z.outdoorF),
    windowMinutes: cfg.sustainedMinutes,
  };
  const beyond = (v: number) => (cold ? v <= reference - cfg.marginF : v >= reference + cfg.marginF);
  const outdoorDriving = z.outdoorF != null && (cold ? z.outdoorF < current : z.outdoorF > current);
  if (outdoorDriving && samples.every(beyond)) return { outcome: 'TRIGGERED', evidence: { ...evidence, lastMetAt: z.now.toISOString() } };
  // Stay raised through the milder hours between cold nights.
  return hold(evidence) ?? { outcome: 'CLEAR', evidence };
}

// The temperature a zone is normally held at in this mode: the lowest
// cooling setpoint (Cool) / highest heating setpoint (Heat) it used.
export function comfortReferenceF(setpoints: SetpointSample[], mode: 'COOL' | 'HEAT'): number | null {
  const values = setpoints.map((s) => (mode === 'COOL' ? s.coolF : s.heatF)).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return mode === 'COOL' ? Math.min(...values) : Math.max(...values);
}

// For the shadow statistics: a reading taken while the house drifts past a
// setpoint its zones' modes can't act on, with the system idle.
export function isOutOfAuthority(tempF: number, setpointsInEffect: (SetpointSample | null)[], anyCall: boolean, toleranceF: number): boolean {
  if (anyCall) return false;
  const known = setpointsInEffect.filter((s): s is SetpointSample => !!s);
  if (known.length === 0) return false;
  const canHeat = known.some((s) => s.mode === 'HEAT' || s.mode === 'HEATCOOL' || s.mode === 'ECO');
  const canCool = known.some((s) => s.mode === 'COOL' || s.mode === 'HEATCOOL' || s.mode === 'ECO');
  const coolTargets = known.map((s) => s.coolF).filter((v): v is number => v != null);
  const heatTargets = known.map((s) => s.heatF).filter((v): v is number => v != null);
  if (!canHeat && coolTargets.length && tempF < Math.min(...coolTargets) - toleranceF) return true;
  if (!canCool && heatTargets.length && tempF > Math.max(...heatTargets) + toleranceF) return true;
  return false;
}
