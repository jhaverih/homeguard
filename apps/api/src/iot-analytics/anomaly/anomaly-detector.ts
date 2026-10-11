import { Baseline, baselineOf, madFloor, median, robustZ, mad } from './statistics';
import { Preprocessed, segmentRates } from './preprocess';

// Statistical anomaly candidates for one sensor (spec §4.3–4.5). Pure: the
// caller supplies preprocessed readings, a context-matched baseline sample
// set and `now`. Never fabricates a value: no baseline → no score.

export const DETECTOR_VERSION = 'hvac-anomaly-1.0.0';

export type AnomalyType = 'ISOLATED' | 'RAPID_CHANGE' | 'PERSISTENT' | 'DRIFT' | 'SENSOR_QUALITY';
export type AnomalyState = 'ACTIVE' | 'RESOLVED' | 'UNCONFIRMED';

export interface AnomalyCandidate {
  type: AnomalyType;
  state: AnomalyState;
  startedAt: Date;
  lastObservedAt: Date;
  observed: number;
  baseline: Baseline | null;
  deviation: number;          // observed − baseline median, in `unit`
  unit: string;
  robustZ: number | null;
  consecutive: number;
  method: string;
  // Started within the exclusion period after a mode/setpoint change —
  // expected behavior, never an equipment anomaly.
  transition: boolean;
  note?: string;
}

export interface DetectorConfig {
  zThreshold: number;           // |robust z| beyond this is unusual
  rateZThreshold: number;
  minConsecutive: number;       // persistence: readings…
  persistenceMinutes: number;   // …and minutes, both required
  minSamples: number;           // baseline size needed to score at all
  transitionExclusionMinutes: number;
  evaluationMinutes: number;    // only recent readings are candidates
}

export interface SeriesInput {
  now: Date;
  unit: string;
  pre: Preprocessed;
  baselineValues: number[];     // same-context history, excluding the evaluation window
  baselineRates: number[];
  transitions: Date[];          // mode / setpoint changes
}

const nearTransition = (t: Date, transitions: Date[], minutes: number) =>
  transitions.some((x) => x <= t && t.getTime() - x.getTime() <= minutes * 60_000);

export function detectSeries(input: SeriesInput, cfg: DetectorConfig): { candidates: AnomalyCandidate[]; skipped?: string } {
  const { pre, unit, now } = input;
  const candidates: AnomalyCandidate[] = [];

  // Sensor/communication problems first — they are not HVAC conditions.
  for (const r of pre.implausibleRates.filter((x) => now.getTime() - x.t.getTime() <= cfg.evaluationMinutes * 60_000)) {
    candidates.push({
      type: 'SENSOR_QUALITY', state: 'ACTIVE', startedAt: r.t, lastObservedAt: r.t, observed: r.ratePerMin, baseline: null,
      deviation: r.ratePerMin, unit: `${unit}/min`, robustZ: null, consecutive: 1, method: 'physical-rate-limit', transition: false,
      note: 'Change faster than physically plausible for this sensor',
    });
  }

  const baseline = baselineOf(input.baselineValues);
  if (!baseline || baseline.n < cfg.minSamples) return { candidates, skipped: `Baseline has ${baseline?.n ?? 0} readings (needs ${cfg.minSamples})` };
  const floor = madFloor(unit);
  const windowStart = now.getTime() - cfg.evaluationMinutes * 60_000;
  const recent = pre.points.filter((p) => p.t.getTime() >= windowStart);
  if (recent.length === 0) return { candidates, skipped: 'No recent readings' };
  const z = recent.map((p) => ({ p, z: robustZ(p.v, baseline.median, baseline.mad, floor) }));

  // A. / C. Trailing run of same-sign exceedances → persistent vs unconfirmed.
  const latest = z[z.length - 1];
  if (Math.abs(latest.z) > cfg.zThreshold) {
    const sign = Math.sign(latest.z);
    let i = z.length - 1;
    while (i > 0 && Math.abs(z[i - 1].z) > cfg.zThreshold && Math.sign(z[i - 1].z) === sign) i--;
    const run = z.slice(i);
    const minutes = (run[run.length - 1].p.t.getTime() - run[0].p.t.getTime()) / 60_000;
    const persistent = run.length >= cfg.minConsecutive && minutes >= cfg.persistenceMinutes;
    const transition = nearTransition(run[0].p.t, input.transitions, cfg.transitionExclusionMinutes);
    candidates.push({
      type: 'PERSISTENT', state: persistent && !transition ? 'ACTIVE' : 'UNCONFIRMED',
      startedAt: run[0].p.t, lastObservedAt: latest.p.t, observed: latest.p.v, baseline,
      deviation: round(latest.p.v - baseline.median), unit, robustZ: round(latest.z), consecutive: run.length,
      method: 'rolling-median-mad', transition,
      note: persistent ? undefined : `Needs ${cfg.minConsecutive} readings over ${cfg.persistenceMinutes} min (has ${run.length} over ${Math.round(minutes)})`,
    });
  }

  // Isolated deviations: one reading out, the next one back — noise or a
  // glitch, recorded (resolved) so repeated occurrences stay visible.
  for (let k = 0; k < z.length - 1; k++) {
    const before = k > 0 ? Math.abs(z[k - 1].z) <= cfg.zThreshold : true;
    if (Math.abs(z[k].z) > cfg.zThreshold && before && Math.abs(z[k + 1].z) <= cfg.zThreshold) {
      candidates.push({
        type: 'ISOLATED', state: 'RESOLVED', startedAt: z[k].p.t, lastObservedAt: z[k + 1].p.t, observed: z[k].p.v, baseline,
        deviation: round(z[k].p.v - baseline.median), unit, robustZ: round(z[k].z), consecutive: 1, method: 'rolling-median-mad',
        transition: nearTransition(z[k].p.t, input.transitions, cfg.transitionExclusionMinutes),
      });
    }
  }

  // B. Rapid change, against this sensor's own typical rates (in-segment only).
  const rateBase = baselineOf(input.baselineRates);
  if (rateBase && rateBase.n >= cfg.minSamples) {
    for (const r of segmentRates(pre.segments).filter((x) => x.t.getTime() >= windowStart)) {
      const rz = robustZ(r.v, rateBase.median, rateBase.mad, madFloor('perMin'));
      if (Math.abs(rz) > cfg.rateZThreshold && !pre.implausibleRates.some((x) => x.t.getTime() === r.t.getTime())) {
        candidates.push({
          type: 'RAPID_CHANGE', state: 'ACTIVE', startedAt: r.t, lastObservedAt: r.t, observed: round(r.v), baseline: rateBase,
          deviation: round(r.v - rateBase.median), unit: `${unit}/min`, robustZ: round(rz), consecutive: 1, method: 'rate-of-change-mad',
          transition: nearTransition(r.t, input.transitions, cfg.transitionExclusionMinutes),
        });
      }
    }
  }
  return { candidates };
}

// D. Baseline drift: recent vs prior period medians of comparable samples
// (e.g. stable-cooling suction temps, cooling-cycle minutes).
export function detectDrift(recent: { t: Date; v: number }[], prior: number[], unit: string, cfg: { minShiftMad: number; minSamples: number }): AnomalyCandidate | null {
  if (recent.length < cfg.minSamples || prior.length < cfg.minSamples) return null;
  const priorMedian = median(prior);
  const priorMad = Math.max(mad(prior, priorMedian), madFloor(unit));
  const recentMedian = median(recent.map((r) => r.v));
  const shift = recentMedian - priorMedian;
  if (Math.abs(shift) < cfg.minShiftMad * priorMad) return null;
  return {
    type: 'DRIFT', state: 'ACTIVE', startedAt: recent[0].t, lastObservedAt: recent[recent.length - 1].t, observed: round(recentMedian),
    baseline: { median: priorMedian, mad: priorMad, n: prior.length }, deviation: round(shift), unit,
    robustZ: round((0.6745 * shift) / priorMad), consecutive: recent.length, method: 'median-shift', transition: false,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;
