import {
  CallSample, CycleRecord, NumSample, SetpointSample, ZoneInputs, evaluateCombined, evaluateCoolingPerformance, evaluateExpectedState,
  evaluateDailyStarts, evaluateExtendedRuntime, evaluateFrequentCycling, evaluateLineTemp, evaluateQuickRestarts, evaluateShortRuns, evaluateSetpointProgress, evaluateSustainedHumidity, heldValue,
  parseSetpoint, systemCoolingCycles, valuesAcross,
} from './cooling-analytics';

// Fake clock: everything is minutes after a fixed instant.
const T0 = Date.UTC(2026, 6, 15, 14, 0);
const at = (min: number) => new Date(T0 + min * 60_000);
const temps = (pairs: [number, number][]): NumSample[] => pairs.map(([m, v]) => ({ t: at(m), v }));
const calls = (pairs: [number, CallSample['call']][]): CallSample[] => pairs.map(([m, call]) => ({ t: at(m), call }));
const setpoint = (min: number, value: string): SetpointSample => parseSetpoint(value, at(min));
// Nest is polled every 5 min, so a zone's temperature lands every 5 min.
const every5 = (from: number, to: number, f: (m: number) => number): NumSample[] => {
  const out: NumSample[] = [];
  for (let m = from; m <= to; m += 5) out.push({ t: at(m), v: f(m) });
  return out;
};

const perfCfg = { minActiveMinutes: 60, errorF: 3, minProgressF: 1, holdMinutes: 30 };
const progressCfg = { checkAfterMinutes: 30, minInitialErrorF: 2, minDecreaseF: 0.5, holdMinutes: 30 };
const stateCfg = { errorF: 2, graceMinutes: 20, exclusionMinutes: 10, holdMinutes: 30 };
const lineCfg = { stabilizationMinutes: 10, deviationF: 10, sustainedMinutes: 10, holdMinutes: 30, minSamples: 20 };
const zone = (over: Partial<ZoneInputs>): ZoneInputs => ({ now: at(90), temps: [], setpoints: [setpoint(-120, 'COOL 72°F')], calls: [], online: true, tempStaleMinutes: 15, ...over });

describe('helpers', () => {
  it('parses every setpoint shape NestService records', () => {
    expect(parseSetpoint('COOL 72°F', at(0))).toMatchObject({ mode: 'COOL', coolF: 72, heatF: null });
    expect(parseSetpoint('HEATCOOL 68–75.2°F', at(0))).toMatchObject({ mode: 'HEATCOOL', coolF: 75.2, heatF: 68 });
    expect(parseSetpoint('ECO 59–82.4°F', at(0))).toMatchObject({ mode: 'ECO', coolF: 82.4 });
    expect(parseSetpoint('OFF', at(0))).toMatchObject({ mode: 'OFF', coolF: null });
  });

  it('holds a report-on-change value only up to the hold limit — a gap is unknown, not a value', () => {
    const s = temps([[0, 50], [25, 49]]);
    expect(heldValue(s, at(20), 30)).toBe(50);
    expect(heldValue(s, at(60), 30)).toBeNull();
    expect(valuesAcross(s, at(5), at(30), 30)).toEqual([50, 49]);
    expect(valuesAcross(temps([[0, 50], [45, 49]]), at(5), at(50), 30)).toBeNull();
  });
});

describe('Rule A — cooling performance (HVAC-COMFORT-001)', () => {
  it('1. normal cooling: temperature approaches setpoint → CLEAR', () => {
    const z = zone({ temps: every5(0, 90, (m) => 77 - m * 0.05), calls: calls([[0, 'COOLING']]) });
    expect(evaluateCoolingPerformance(z, perfCfg).outcome).toBe('CLEAR');
  });

  it('2. cooling active 60+ min, >3°F above setpoint, no progress → TRIGGERED', () => {
    const z = zone({ temps: every5(0, 90, () => 76.5), calls: calls([[0, 'COOLING']]) });
    const r = evaluateCoolingPerformance(z, perfCfg);
    expect(r.outcome).toBe('TRIGGERED');
    expect(r.evidence).toMatchObject({ coolSetpointF: 72, currentErrorF: 4.5 });
  });

  it('a recent setpoint change restarts the clock — not assessed yet', () => {
    const z = zone({ temps: every5(0, 90, () => 76.5), calls: calls([[0, 'COOLING']]), setpoints: [setpoint(-120, 'COOL 74°F'), setpoint(60, 'COOL 72°F')] });
    expect(evaluateCoolingPerformance(z, perfCfg).outcome).toBe('NOT_APPLICABLE');
  });

  it('9. Cool mode selected but thermostat idle → not treated as cooling', () => {
    const z = zone({ temps: every5(0, 90, () => 76.5), calls: calls([[0, 'OFF']]) });
    expect(evaluateCoolingPerformance(z, perfCfg).outcome).toBe('NOT_APPLICABLE');
  });

  it('20. stale or offline data never evaluates as CLEAR', () => {
    const stale = zone({ temps: every5(0, 40, () => 72), calls: calls([[0, 'COOLING']]) });
    expect(evaluateCoolingPerformance(stale, perfCfg).outcome).toBe('INSUFFICIENT_DATA');
    const offline = zone({ temps: every5(0, 90, () => 72), calls: calls([[0, 'COOLING']]), online: false });
    expect(evaluateCoolingPerformance(offline, perfCfg).outcome).toBe('INSUFFICIENT_DATA');
    const noAction = zone({ temps: every5(0, 90, () => 76.5), calls: [] });
    expect(evaluateCoolingPerformance(noAction, perfCfg)).toMatchObject({ outcome: 'INSUFFICIENT_DATA', reason: expect.stringMatching(/does not report/) });
  });
});

describe('Rule H — progress toward setpoint (HVAC-COMFORT-003)', () => {
  it('warns when the gap has not shrunk by 0.5°F after 30 minutes', () => {
    const z = zone({ now: at(35), temps: every5(0, 35, () => 75), calls: calls([[0, 'COOLING']]) });
    expect(evaluateSetpointProgress(z, progressCfg).outcome).toBe('TRIGGERED');
  });
  it('is clear when progressing, and skips small starting gaps', () => {
    const progressing = zone({ now: at(35), temps: every5(0, 35, (m) => 75 - m * 0.03), calls: calls([[0, 'COOLING']]) });
    expect(evaluateSetpointProgress(progressing, progressCfg).outcome).toBe('CLEAR');
    const small = zone({ now: at(35), temps: every5(0, 35, () => 73), calls: calls([[0, 'COOLING']]) });
    expect(evaluateSetpointProgress(small, progressCfg)).toMatchObject({ outcome: 'CLEAR', reason: 'Started close to setpoint' });
  });
});

describe('Rule I — expected operating state (HVAC-STATE-001)', () => {
  it('9/10. Cool mode, zone well above setpoint for the grace period, no cooling call → TRIGGERED', () => {
    const z = zone({ now: at(60), temps: every5(0, 60, () => 76), calls: calls([[0, 'OFF']]) });
    expect(evaluateExpectedState(z, stateCfg).outcome).toBe('TRIGGERED');
  });
  it('does not trigger if a cooling call was observed, or right after a setpoint change', () => {
    const called = zone({ now: at(60), temps: every5(0, 60, () => 76), calls: calls([[0, 'OFF'], [50, 'COOLING']]) });
    expect(evaluateExpectedState(called, stateCfg).outcome).toBe('CLEAR');
    const changed = zone({ now: at(60), temps: every5(0, 60, () => 76), calls: calls([[0, 'OFF']]), setpoints: [setpoint(45, 'COOL 72°F')] });
    expect(evaluateExpectedState(changed, stateCfg).outcome).toBe('NOT_APPLICABLE');
  });
});

describe('Rule C — frequent cycling (HVAC-RUNTIME-003)', () => {
  const cfg = { maxStarts: 3, windowMinutes: 60, exclusionMinutes: 10 };
  it('4. more than 3 cooling starts in 60 minutes → TRIGGERED', () => {
    const c = systemCoolingCycles([calls([[0, 'COOLING'], [6, 'OFF'], [15, 'COOLING'], [21, 'OFF'], [30, 'COOLING'], [36, 'OFF'], [45, 'COOLING'], [51, 'OFF']])]);
    expect(evaluateFrequentCycling(c, [], at(55), cfg)).toMatchObject({ outcome: 'TRIGGERED', evidence: { coolingStarts: 4 } });
  });
  it('excludes starts right after a setpoint change', () => {
    const c = systemCoolingCycles([calls([[0, 'COOLING'], [6, 'OFF'], [15, 'COOLING'], [21, 'OFF'], [30, 'COOLING'], [36, 'OFF'], [45, 'COOLING'], [51, 'OFF']])]);
    expect(evaluateFrequentCycling(c, [at(43)], at(55), cfg)).toMatchObject({ outcome: 'CLEAR', evidence: { coolingStarts: 3, excludedStarts: 1 } });
  });
  it('15. two zones handing off on one multizone system is one run, not cycling', () => {
    const down = calls([[0, 'COOLING'], [20, 'OFF'], [40, 'COOLING'], [55, 'OFF']]);
    const up = calls([[15, 'COOLING'], [45, 'OFF']]);
    const merged = systemCoolingCycles([down, up]);
    expect(merged).toEqual([{ start: at(0), end: at(55), durationMinutes: 55 }]);
    expect(evaluateFrequentCycling(merged, [], at(58), cfg).outcome).toBe('CLEAR');
  });
  it('16. separate systems are evaluated from their own thermostat only', () => {
    const systemA = systemCoolingCycles([calls([[0, 'COOLING'], [20, 'OFF']])]);
    const systemB = systemCoolingCycles([calls([[15, 'COOLING'], [45, 'OFF']])]);
    expect(systemA).toHaveLength(1);
    expect(systemB).toEqual([{ start: at(15), end: at(45), durationMinutes: 30 }]);
  });
  it('18. duplicate repeated state events do not create extra starts', () => {
    const c = systemCoolingCycles([calls([[0, 'COOLING'], [1, 'COOLING'], [2, 'COOLING'], [20, 'OFF'], [21, 'OFF']])]);
    expect(c).toHaveLength(1);
  });
});

describe('Rule B — extended runtime (HVAC-RUNTIME-001)', () => {
  const cfg = { excessPercent: 30, consecutive: 3, minBaselineCycles: 10 };
  const cyc = (minutes: number, band = '90s', setpointChanged = false): CycleRecord => ({ minutes, band, setpointChanged, end: at(0) });
  const baseline = Array.from({ length: 12 }, () => cyc(20));
  it('3. three comparable cycles ≥30% over baseline → TRIGGERED', () => {
    expect(evaluateExtendedRuntime([cyc(27), cyc(28), cyc(30)], baseline, cfg).outcome).toBe('TRIGGERED');
  });
  it('one long cycle is not enough, and setpoint-change cycles are excluded', () => {
    expect(evaluateExtendedRuntime([cyc(20), cyc(21), cyc(45)], baseline, cfg).outcome).toBe('CLEAR');
    expect(evaluateExtendedRuntime([cyc(27), cyc(28, '90s', true), cyc(30)], baseline, cfg).outcome).toBe('NOT_APPLICABLE');
  });
  it('shows Baseline collecting until enough comparable cycles exist', () => {
    expect(evaluateExtendedRuntime([cyc(27), cyc(28), cyc(30)], baseline.slice(0, 4), cfg)).toMatchObject({ outcome: 'BASELINE_COLLECTING', reason: 'Baseline collecting' });
    expect(evaluateExtendedRuntime([cyc(27), cyc(28), cyc(30)], baseline.map((c) => ({ ...c, band: '70s' })), cfg).outcome).toBe('BASELINE_COLLECTING');
  });
});

describe('Rules D/E — refrigerant line temperature (HVAC-REFRIGERANT-001/002)', () => {
  // Pilot-house cadence: report-on-change, typically 2–3 minutes apart.
  const cycles = systemCoolingCycles([calls([[0, 'COOLING']])]);
  const suction = (f: (m: number) => number) => {
    const out: NumSample[] = [];
    for (let m = 0; m <= 40; m += 3) out.push({ t: at(m), v: f(m) });
    return out;
  };
  const baseline = { meanF: 48, samples: 40, cycles: 5 };
  it('5. suction line 10°F+ above its stable-cooling baseline for 10 minutes → TRIGGERED', () => {
    const r = evaluateLineTemp(suction((m) => (m < 15 ? 60 : 59.5)), cycles, at(40), baseline, lineCfg);
    expect(r).toMatchObject({ outcome: 'TRIGGERED', evidence: { direction: 'above', baselineF: 48 } });
  });
  it('6. liquid line below baseline is caught in the other direction', () => {
    const r = evaluateLineTemp(suction(() => 70), cycles, at(40), { meanF: 85, samples: 40, cycles: 5 }, lineCfg);
    expect(r).toMatchObject({ outcome: 'TRIGGERED', evidence: { direction: 'below' } });
  });
  it('normal readings are CLEAR; a single excursion does not trigger', () => {
    expect(evaluateLineTemp(suction(() => 49), cycles, at(40), baseline, lineCfg).outcome).toBe('CLEAR');
    expect(evaluateLineTemp(suction((m) => (m === 36 ? 49 : 60)), cycles, at(40), baseline, lineCfg).outcome).toBe('CLEAR');
  });
  it('ignores the startup transient and the system being off', () => {
    expect(evaluateLineTemp(suction(() => 70), cycles, at(15), baseline, lineCfg).outcome).toBe('NOT_APPLICABLE');
    const off = systemCoolingCycles([calls([[0, 'COOLING'], [20, 'OFF']])]);
    expect(evaluateLineTemp(suction(() => 70), off, at(40), baseline, lineCfg).outcome).toBe('NOT_APPLICABLE');
  });
  it('12. a probe silent past the hold time during cooling is INSUFFICIENT_DATA, not a reading', () => {
    expect(evaluateLineTemp(temps([[0, 60]]), cycles, at(40), baseline, lineCfg).outcome).toBe('INSUFFICIENT_DATA');
  });
  it('waits for a baseline from at least 3 cooling runs', () => {
    expect(evaluateLineTemp(suction(() => 70), cycles, at(40), { meanF: 48, samples: 40, cycles: 2 }, lineCfg).outcome).toBe('BASELINE_COLLECTING');
    expect(evaluateLineTemp(suction(() => 70), cycles, at(40), null, lineCfg).outcome).toBe('BASELINE_COLLECTING');
  });
});

describe('Rule G — sustained humidity (HVAC-HUMIDITY-001)', () => {
  const cfg = { thresholdPercent: 60, sustainedMinutes: 60, minCoolingFraction: 50, holdMinutes: 30, staleMinutes: 15 };
  const cooling = systemCoolingCycles([calls([[0, 'COOLING'], [50, 'OFF']])]);
  it('8. above 60% for 60 minutes during cooling → TRIGGERED', () => {
    expect(evaluateSustainedHumidity(every5(0, 60, () => 64), cooling, at(60), cfg).outcome).toBe('TRIGGERED');
  });
  it('does not trigger on high humidity while idle (e.g. the pilot house at 64% with the system off)', () => {
    expect(evaluateSustainedHumidity(every5(0, 60, () => 64), [], at(60), cfg).outcome).toBe('NOT_APPLICABLE');
  });
  it('a dip below the threshold inside the window clears it', () => {
    expect(evaluateSustainedHumidity(every5(0, 60, (m) => (m === 30 ? 58 : 64)), cooling, at(60), cfg).outcome).toBe('CLEAR');
  });
});

describe('Rule F — combined degradation (HVAC-COMBINED-004)', () => {
  const cfg = { alignmentHours: 24 };
  it('7. two independent, time-aligned symptoms including a performance one → TRIGGERED', () => {
    const r = evaluateCombined([{ ruleId: 'HVAC-COMFORT-001', detectedAt: at(0) }, { ruleId: 'HVAC-REFRIGERANT-001', detectedAt: at(30) }], at(60), cfg);
    expect(r).toMatchObject({ outcome: 'TRIGGERED', symptoms: ['REFRIGERANT_LINE', 'TEMPERATURE_RESPONSE'] });
  });
  it('correlated rules on the same symptom are counted once', () => {
    expect(evaluateCombined([{ ruleId: 'HVAC-COMFORT-001', detectedAt: at(0) }, { ruleId: 'HVAC-COMFORT-003', detectedAt: at(1) }], at(60), cfg).outcome).toBe('CLEAR');
  });
  it('side signals alone (humidity + line temp) are not enough, nor symptoms days apart', () => {
    expect(evaluateCombined([{ ruleId: 'HVAC-HUMIDITY-001', detectedAt: at(0) }, { ruleId: 'HVAC-REFRIGERANT-002', detectedAt: at(1) }], at(60), cfg).outcome).toBe('CLEAR');
    expect(evaluateCombined([{ ruleId: 'HVAC-COMFORT-001', detectedAt: at(-3000) }, { ruleId: 'HVAC-RUNTIME-003', detectedAt: at(0) }], at(60), cfg).outcome).toBe('CLEAR');
  });
});

describe('compressor cycling inferred from thermostat calls', () => {
  const ex = 15;
  it('merges an OFF→COOLING hand-off within a minute into one run', () => {
    const kitchen = calls([[0, 'COOLING'], [20, 'OFF']]);
    const bedroom = calls([[20.5, 'COOLING'], [40, 'OFF']]);
    expect(systemCoolingCycles([kitchen, bedroom])).toEqual([{ start: at(0), end: at(40), durationMinutes: 40 }]);
    // A real 3-minute pause stays two runs.
    expect(systemCoolingCycles([calls([[0, 'COOLING'], [20, 'OFF'], [23, 'COOLING'], [40, 'OFF']])])).toHaveLength(2);
  });

  it('flags repeated short runs, ignoring ones right after a setpoint change', () => {
    const cfg = { maxRunMinutes: 5, count: 3, windowMinutes: 180, exclusionMinutes: ex };
    const c = systemCoolingCycles([calls([[0, 'COOLING'], [3, 'OFF'], [30, 'COOLING'], [33.5, 'OFF'], [60, 'COOLING'], [62, 'OFF'], [90, 'COOLING'], [110, 'OFF']])]);
    expect(evaluateShortRuns(c, [], at(120), cfg)).toMatchObject({ outcome: 'TRIGGERED', evidence: { shortRunCount: 3, shortRunMinutes: [3, 3.5, 2], completedRuns: 4 } });
    expect(evaluateShortRuns(c, [at(55)], at(120), cfg)).toMatchObject({ outcome: 'CLEAR', evidence: { shortRunCount: 2, excludedShortRuns: 1 } });
    expect(evaluateShortRuns([], [], at(120), cfg).outcome).toBe('NOT_APPLICABLE');
  });

  it('pilot week: normal 8–16 min runs with one 2.4 min run are not flagged', () => {
    const cfg = { maxRunMinutes: 5, count: 3, windowMinutes: 180, exclusionMinutes: ex };
    const c = systemCoolingCycles([calls([[0, 'COOLING'], [10, 'OFF'], [35, 'COOLING'], [37.4, 'OFF'], [70, 'COOLING'], [86, 'OFF']])]);
    expect(evaluateShortRuns(c, [], at(100), cfg)).toMatchObject({ outcome: 'CLEAR', evidence: { shortRunCount: 1 } });
  });

  it('flags quick restarts after a short off time, not hand-offs', () => {
    const cfg = { minOffMinutes: 5, count: 2, windowMinutes: 180, exclusionMinutes: ex };
    const c = systemCoolingCycles([calls([[0, 'COOLING'], [10, 'OFF'], [12, 'COOLING'], [22, 'OFF'], [25, 'COOLING'], [35, 'OFF'], [60, 'COOLING'], [70, 'OFF']])]);
    expect(evaluateQuickRestarts(c, [], at(80), cfg)).toMatchObject({ outcome: 'TRIGGERED', evidence: { quickRestartCount: 2, offMinutes: [2, 3], restarts: 3 } });
    expect(evaluateQuickRestarts(c, [at(20)], at(80), cfg)).toMatchObject({ outcome: 'CLEAR', evidence: { quickRestartCount: 1, excludedQuickRestarts: 1 } });
    // Two zones handing off (OFF then COOLING 30 s later) is one run → no restart at all.
    const handoff = systemCoolingCycles([calls([[0, 'COOLING'], [10, 'OFF']]), calls([[10.5, 'COOLING'], [30, 'OFF']])]);
    expect(evaluateQuickRestarts(handoff, [], at(40), cfg).outcome).toBe('NOT_APPLICABLE');
  });

  it('compares daily starts with comparable days only, after a baseline', () => {
    const cfg = { excessPercent: 50, minBaselineDays: 7 };
    const day = (starts: number, band: string, d: number) => ({ starts, band, end: at(d * 1440) });
    const normal = [20, 18, 22, 19, 21, 20, 23].map((s, i) => day(s, '80s', i));
    expect(evaluateDailyStarts([...normal, day(36, '80s', 8)], cfg)).toMatchObject({ outcome: 'TRIGGERED', evidence: { dailyStarts: 36, baselineMedianStarts: 20 } });
    expect(evaluateDailyStarts([...normal, day(26, '80s', 8)], cfg).outcome).toBe('CLEAR');
    // Hotter days aren't comparable, so the baseline is still collecting.
    expect(evaluateDailyStarts([...normal, day(36, '90s', 8)], cfg)).toMatchObject({ outcome: 'BASELINE_COLLECTING', evidence: { baselineDays: 0 } });
    // A quiet baseline needs at least 3 extra starts.
    const quiet = [2, 2, 2, 2, 2, 2, 2].map((s, i) => day(s, '70s', i));
    expect(evaluateDailyStarts([...quiet, day(4, '70s', 8)], cfg).outcome).toBe('CLEAR');
  });
});
