import { DetectorConfig, detectDrift, detectSeries } from './anomaly-detector';
import { Reading, preprocess, segmentRates } from './preprocess';
import { median, robustZ } from './statistics';

const T0 = Date.UTC(2026, 6, 15, 12, 0);
const at = (min: number) => new Date(T0 + min * 60_000);
// Deterministic noise (seeded LCG) — realistic jitter, repeatable tests.
function noise(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
}
// Report-on-change probe cadence: ~2–3 minutes between readings.
function series(fromMin: number, toMin: number, f: (m: number) => number, seed = 1, step = 2.5): Reading[] {
  const n = noise(seed);
  const out: Reading[] = [];
  for (let m = fromMin; m <= toMin; m += step) out.push({ t: at(m), v: Math.round((f(m) + n() * 0.6) * 10) / 10 });
  return out;
}
const cfg: DetectorConfig = { zThreshold: 3.5, rateZThreshold: 4, minConsecutive: 3, persistenceMinutes: 15, minSamples: 30, transitionExclusionMinutes: 10, evaluationMinutes: 60 };
const pre = (r: Reading[]) => preprocess(r, { maxGapMinutes: 30, maxRatePerMinute: 15 });
// Baseline: a day of normal stable-cooling suction readings around 48°F.
const baselineReadings = series(-1500, -100, () => 48, 7);
const baselineValues = baselineReadings.map((r) => r.v);
const baselineRates = segmentRates(pre(baselineReadings).segments).map((r) => r.v);
const run = (readings: Reading[], now: number, transitions: Date[] = []) =>
  detectSeries({ now: at(now), unit: '°F', pre: pre(readings), baselineValues, baselineRates, transitions }, cfg);

describe('robust statistics', () => {
  it('uses the MAD floor so a perfectly steady sensor never yields an infinite score', () => {
    expect(robustZ(68.1, 68, 0, 0.3)).toBeCloseTo(0.6745 * 0.1 / 0.3);
    expect(Number.isFinite(robustZ(70, 68, 0, 0.3))).toBe(true);
    expect(median([3, 1, 2, 4])).toBe(2.5);
  });
});

describe('detectSeries', () => {
  it('1. normal stable cooling produces no anomalies', () => {
    expect(run(series(0, 60, () => 48, 3), 60).candidates).toEqual([]);
  });

  it('3. a persistent suction deviation is confirmed only once it has lasted long enough', () => {
    const early = run([...series(0, 40, () => 48, 3), ...series(42.5, 50, () => 60, 4)], 50);
    expect(early.candidates.find((c) => c.type === 'PERSISTENT')).toMatchObject({ state: 'UNCONFIRMED' });
    const later = run([...series(0, 40, () => 48, 3), ...series(42.5, 60, () => 60, 4)], 60);
    const p = later.candidates.find((c) => c.type === 'PERSISTENT')!;
    expect(p).toMatchObject({ state: 'ACTIVE', startedAt: at(42.5), unit: '°F', method: 'rolling-median-mad' });
    expect(p.deviation).toBeGreaterThan(10);
    expect(p.consecutive).toBeGreaterThanOrEqual(3);
  });

  it('2. an abrupt change is detected and timestamped at the reading where it happened', () => {
    const r = run([...series(0, 40, () => 48, 3), { t: at(42), v: 60 }, ...series(44.5, 60, () => 60, 4)], 60);
    expect(r.candidates.find((c) => c.type === 'RAPID_CHANGE')).toMatchObject({ startedAt: at(42), unit: '°F/min' });
  });

  it('an isolated single-reading excursion is recorded as resolved noise, not an active anomaly', () => {
    const r = run([...series(0, 30, () => 48, 3), { t: at(32), v: 58 }, ...series(34.5, 60, () => 48, 4)], 60);
    expect(r.candidates.filter((c) => c.type === 'ISOLATED')).toEqual([expect.objectContaining({ state: 'RESOLVED', startedAt: at(32) })]);
    expect(r.candidates.find((c) => c.type === 'PERSISTENT')).toBeUndefined();
  });

  it('5. a deviation starting right after a mode/setpoint change is a transition, never an active equipment anomaly', () => {
    const r = run([...series(0, 40, () => 48, 3), ...series(42.5, 70, () => 60, 4)], 70, [at(38)]);
    expect(r.candidates.find((c) => c.type === 'PERSISTENT')).toMatchObject({ transition: true, state: 'UNCONFIRMED' });
  });

  it('8. a physically implausible jump is a sensor-quality finding, not an HVAC rapid change', () => {
    const r = run([...series(0, 40, () => 48, 3), { t: at(41), v: 110 }, ...series(43.5, 60, () => 48, 4)], 60);
    expect(r.candidates.find((c) => c.type === 'SENSOR_QUALITY')).toMatchObject({ startedAt: at(41) });
    expect(r.candidates.filter((c) => c.type === 'RAPID_CHANGE' && c.startedAt.getTime() === at(41).getTime())).toEqual([]);
  });

  it('6. without enough baseline history nothing is scored (no fabricated baseline)', () => {
    const r = detectSeries({ now: at(60), unit: '°F', pre: pre(series(0, 60, () => 60)), baselineValues: [48, 48, 49], baselineRates: [], transitions: [] }, cfg);
    expect(r.candidates).toEqual([]);
    expect(r.skipped).toMatch(/Baseline has 3 readings/);
  });
});

describe('preprocess', () => {
  it('7. removes duplicates, counts out-of-order arrivals, and never bridges a gap', () => {
    const readings: Reading[] = [
      { t: at(0), v: 48, receivedAt: at(0) }, { t: at(0), v: 48, receivedAt: at(1) },        // duplicate
      { t: at(5), v: 48.2, receivedAt: at(9) }, { t: at(3), v: 48.1, receivedAt: at(10) },  // late arrival
      { t: at(70), v: 60, receivedAt: at(70) },                                          // after a 65-min gap
    ];
    const p = pre(readings);
    expect(p).toMatchObject({ duplicates: 1, outOfOrder: 1 });
    expect(p.points.map((x) => x.t)).toEqual([at(0), at(3), at(5), at(70)]);
    expect(p.gaps).toEqual([{ from: at(5), to: at(70), minutes: 65 }]);
    expect(p.segments).toHaveLength(2);
    // The 48→60 step spans the gap: no rate is computed across it.
    expect(segmentRates(p.segments).every((r) => r.t.getTime() !== at(70).getTime())).toBe(true);
  });

  it('6. missing readings stay missing — nothing is filled with zeros', () => {
    const p = pre([{ t: at(0), v: 48 }, { t: at(60), v: 48 }]);
    expect(p.points.map((x) => x.v)).toEqual([48, 48]);
    expect(p.points.some((x) => x.v === 0)).toBe(false);
  });
});

describe('detectDrift', () => {
  it('flags a sustained shift between recent and prior comparable samples, and ignores noise', () => {
    const n = noise(9);
    const prior = Array.from({ length: 60 }, () => 48 + n());
    const recent = Array.from({ length: 30 }, (_, i) => ({ t: at(i * 60), v: 52 + n() }));
    expect(detectDrift(recent, prior, '°F', { minShiftMad: 2, minSamples: 20 })).toMatchObject({ type: 'DRIFT', method: 'median-shift' });
    const steady = Array.from({ length: 30 }, (_, i) => ({ t: at(i * 60), v: 48 + n() }));
    expect(detectDrift(steady, prior, '°F', { minShiftMad: 2, minSamples: 20 })).toBeNull();
  });
});

describe('context-aware baselines', () => {
  const { buildContextTimeline, contextBaseline } = require('./context');
  const calls = [[{ t: at(0), call: 'COOLING' }, { t: at(30), call: 'OFF' }, { t: at(100), call: 'HEATING' }, { t: at(130), call: 'OFF' }]];
  const timeline = buildContextTimeline(calls, [{ t: at(-10), v: 92 }], []);

  it('classifies mode, cycle stage and outdoor band at any moment', () => {
    expect(timeline.at(at(3))).toEqual({ mode: 'COOLING', band: '90s', cycleBucket: '0-5' });
    expect(timeline.at(at(20))).toEqual({ mode: 'COOLING', band: '90s', cycleBucket: '15+' });
    expect(timeline.at(at(110))).toMatchObject({ mode: 'HEATING' });
    expect(timeline.at(at(60))).toMatchObject({ mode: 'IDLE', cycleBucket: 'off' });
    expect(timeline.at(at(400)).band).toBe('UNKNOWN'); // outdoor reading too old
    expect(timeline.transitions).toEqual([at(0), at(30), at(100), at(130)]);
  });

  it('never compares cooling against heating, broadening only within the same mode', () => {
    const history = [
      ...Array.from({ length: 5 }, (_, i) => ({ t: at(16 + i), v: 48 })),   // cooling 15+
      ...Array.from({ length: 5 }, (_, i) => ({ t: at(102 + i), v: 90 })),  // heating
    ];
    const b = contextBaseline(history, timeline, { mode: 'COOLING', band: '80s', cycleBucket: '15+' }, 3);
    expect(b).toMatchObject({ level: 'mode+cycle', reducedContext: true });
    expect(b.values.every((v: number) => v === 48)).toBe(true);
  });
});
