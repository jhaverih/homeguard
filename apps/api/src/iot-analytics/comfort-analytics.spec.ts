import { CallSample, NumSample, SetpointSample, parseSetpoint } from './cooling-analytics';
import { classifyAt, comfortReferenceF, evaluateComfortDays, evaluateModeAdvisory, isOutOfAuthority, summarizeComfort } from './comfort-analytics';

// Fake clock: minutes after a fixed instant.
const T0 = Date.UTC(2026, 9, 19, 0, 0);
const at = (min: number) => new Date(T0 + min * 60_000);
const temps = (pairs: [number, number][]): NumSample[] => pairs.map(([m, v]) => ({ t: at(m), v }));
const calls = (pairs: [number, CallSample['call']][]): CallSample[] => pairs.map(([m, call]) => ({ t: at(m), call }));
const sp = (min: number, value: string): SetpointSample => parseSetpoint(value, at(min));
const cfg = { toleranceF: 1, holdMinutes: 30, recoveryBaseMinutes: 30, recoveryPerDegreeMinutes: 15 };
// Readings every 10 minutes from a function of the minute.
const every10 = (from: number, to: number, f: (m: number) => number) => temps(Array.from({ length: Math.floor((to - from) / 10) + 1 }, (_, i) => [from + i * 10, f(from + i * 10)] as [number, number]));

describe('classifyAt — the range each mode is trying to hold', () => {
  const cool = sp(0, 'COOL 67.8°F');
  const heat = sp(0, 'HEAT 68°F');
  const both = sp(0, 'HEATCOOL 66–75°F');
  it('Cool mode: above the limit is outside; well below is out of the mode\'s authority, not a fault', () => {
    expect(classifyAt(68.5, cool, 'OFF', false, 1).cls).toBe('IN_RANGE');
    expect(classifyAt(70, cool, 'COOLING', false, 1)).toMatchObject({ cls: 'OUTSIDE_RUNNING', excessF: expect.closeTo(1.2, 5) });
    expect(classifyAt(70, cool, 'OFF', false, 1).cls).toBe('OUTSIDE_IDLE');
    expect(classifyAt(61.5, cool, 'OFF', false, 1).cls).toBe('OUT_OF_AUTHORITY');
    expect(classifyAt(70, cool, 'COOLING', true, 1).cls).toBe('RECOVERING');
  });
  it('Heat mode mirrors it; Heat·Cool holds a band; Off has no expectation', () => {
    expect(classifyAt(65, heat, 'HEATING', false, 1).cls).toBe('OUTSIDE_RUNNING');
    expect(classifyAt(74, heat, 'OFF', false, 1).cls).toBe('OUT_OF_AUTHORITY');
    expect(classifyAt(70, both, 'OFF', false, 1).cls).toBe('IN_RANGE');
    expect(classifyAt(64, both, 'HEATING', false, 1).cls).toBe('OUTSIDE_RUNNING');
    expect(classifyAt(77, both, 'COOLING', false, 1).cls).toBe('OUTSIDE_RUNNING');
    expect(classifyAt(55, sp(0, 'OFF'), 'OFF', false, 1).cls).toBe('NO_EXPECTATION');
    expect(classifyAt(null, cool, 'OFF', false, 1).cls).toBe('UNKNOWN');
    // Eco with a single temperature can't say whether it's a heating or cooling limit.
    expect(classifyAt(75, sp(0, 'ECO 80°F'), 'OFF', false, 1).cls).toBe('NO_EXPECTATION');
    expect(classifyAt(60, sp(0, 'ECO 62–80°F'), 'HEATING', false, 1).cls).toBe('OUTSIDE_RUNNING');
  });
});

describe('summarizeComfort', () => {
  it('pilot night of 2026-10-19: Cool mode, house drifts to 61.5°F with 40°F outside → no uncorrected time', () => {
    // Cooling setpoint 67.8°F all night; room slides from 67.5 to 61.5 with the system idle.
    const s = summarizeComfort(every10(0, 600, (m) => 67.5 - (6 * m) / 600), [sp(-60, 'COOL 67.8°F')], calls([[-60, 'OFF']]), at(0), at(600), cfg);
    expect(s.uncorrectedMinutes).toBe(0);
    expect(s.minutes.OUT_OF_AUTHORITY).toBeGreaterThan(400);
    expect(s).toMatchObject({ dominantMode: 'COOL', minF: 61.6, maxF: 67.5 });
  });

  it('a hot afternoon where cooling runs but the room stays above the setpoint counts as uncorrected', () => {
    const s = summarizeComfort(every10(0, 120, () => 71), [sp(-600, 'COOL 68°F')], calls([[-60, 'COOLING']]), at(0), at(120), cfg);
    expect(s.uncorrectedMinutes).toBe(120);
    expect(s.minutes.OUTSIDE_RUNNING).toBe(120);
    expect(s.uncorrectedDegreeMinutes).toBe(240); // 2°F over the 69°F limit × 120 min
  });

  it('time right after a setpoint change is recovery, scaled by how far the setpoint moved', () => {
    // Setpoint lowered 75 → 70 at minute 0: recovery = 30 + 15×5 = 105 min.
    const s = summarizeComfort(every10(0, 180, (m) => Math.max(70, 75 - m / 30)), [sp(-60, 'COOL 75°F'), sp(0, 'COOL 70°F')], calls([[0, 'COOLING']]), at(0), at(180), cfg);
    expect(s.minutes.RECOVERING).toBe(105);
    expect(s.uncorrectedMinutes).toBe(15); // 105–120 min: still above 71°F after recovery ended
  });
});

describe('evaluateComfortDays — against comparable days only', () => {
  const day = (uncorrected: number, band = '80s', mode = 'COOL', controllable = 1200, d = 0) => ({ uncorrectedMinutes: uncorrected, controllableMinutes: controllable, band, mode, end: at(d * 1440) });
  const normal = [10, 20, 15, 0, 25, 10, 20].map((u, i) => day(u, '80s', 'COOL', 1200, i));
  const c = { excessPercent: 100, minMinutes: 60, minBaselineDays: 7, minControllableMinutes: 240 };
  it('flags a day well above usual, never below the minimum', () => {
    expect(evaluateComfortDays([...normal, day(150, '80s', 'COOL', 1200, 8)], c)).toMatchObject({ outcome: 'TRIGGERED', evidence: { uncorrectedMinutes: 150, baselineMedianMinutes: 15, limitMinutes: 60 } });
    expect(evaluateComfortDays([...normal, day(50, '80s', 'COOL', 1200, 8)], c).outcome).toBe('CLEAR');
  });
  it('a different mode or outdoor band is not comparable; a day the mode barely controlled is not judged', () => {
    expect(evaluateComfortDays([...normal, day(150, '40s', 'COOL', 1200, 8)], c)).toMatchObject({ outcome: 'BASELINE_COLLECTING', evidence: { baselineDays: 0 } });
    expect(evaluateComfortDays([...normal, day(150, '80s', 'HEAT', 1200, 8)], c).outcome).toBe('BASELINE_COLLECTING');
    expect(evaluateComfortDays([...normal, day(150, '80s', 'COOL', 120, 8)], c).outcome).toBe('NOT_APPLICABLE');
  });
});

describe('evaluateModeAdvisory — Cool mode on a cold night', () => {
  const c = { marginF: 4, sustainedMinutes: 60, holdMinutes: 30, clearHours: 24 };
  const night = every10(0, 120, (m) => 63 - m / 60); // 63 → 61°F
  it('suggests a mode change when the room stays well below the cooling setpoint and it is colder outside', () => {
    const e = evaluateModeAdvisory({ now: at(120), temps: night, setpoints: [sp(-600, 'COOL 67.8°F')], referenceF: null, outdoorF: 40, active: false, lastMetAt: null }, c);
    expect(e).toMatchObject({ outcome: 'TRIGGERED', evidence: { direction: 'cold', setpointF: 67.8, extremeF: 61, outdoorF: 40 } });
  });
  it('not when the outdoors is warmer (the room is just satisfied), within the margin, or in Heat·Cool', () => {
    expect(evaluateModeAdvisory({ now: at(120), temps: night, setpoints: [sp(-600, 'COOL 67.8°F')], referenceF: null, outdoorF: 70, active: false, lastMetAt: null }, c).outcome).toBe('CLEAR');
    expect(evaluateModeAdvisory({ now: at(120), temps: every10(0, 120, () => 65), setpoints: [sp(-600, 'COOL 67.8°F')], referenceF: null, outdoorF: 40, active: false, lastMetAt: null }, c).outcome).toBe('CLEAR');
    expect(evaluateModeAdvisory({ now: at(120), temps: night, setpoints: [sp(-600, 'HEATCOOL 66–75°F')], referenceF: null, outdoorF: 40, active: false, lastMetAt: null }, c).outcome).toBe('NOT_APPLICABLE');
    expect(evaluateModeAdvisory({ now: at(120), temps: night, setpoints: [sp(100, 'COOL 67.8°F')], referenceF: null, outdoorF: 40, active: false, lastMetAt: null }, c).outcome).toBe('NOT_APPLICABLE');
  });
  it('stays raised through the warmer day after (shown once per cold spell), clears after 24 h without it', () => {
    const day = every10(600, 720, () => 67);
    expect(evaluateModeAdvisory({ now: at(720), temps: day, setpoints: [sp(-600, 'COOL 67.8°F')], referenceF: null, outdoorF: 70, active: true, lastMetAt: at(120) }, c).outcome).toBe('TRIGGERED');
    const later = every10(1560, 1680, () => 67);
    expect(evaluateModeAdvisory({ now: at(1680), temps: later, setpoints: [sp(-600, 'COOL 67.8°F')], referenceF: null, outdoorF: 70, active: true, lastMetAt: at(120) }, c).outcome).toBe('CLEAR');
  });
  it('pilot zone 1: a schedule raising the night cooling setpoint to 75.3°F leaves a comfortable 67°F room — no tip', () => {
    // This zone normally cools to 64.3°F; the overnight setback setpoint is 75.3°F.
    const e = evaluateModeAdvisory({ now: at(120), temps: every10(0, 120, () => 67.4), setpoints: [sp(-600, 'COOL 75.3°F')], referenceF: 64.3, outdoorF: 50, active: false, lastMetAt: null }, { ...c, marginF: 3 });
    expect(e.outcome).toBe('CLEAR');
  });
  it('pilot zone 2, 2026-10-19: 61.5°F against the 65.7°F it is normally cooled to, 42°F outside — tip', () => {
    const e = evaluateModeAdvisory({ now: at(120), temps: every10(0, 120, (m) => 62.4 - (0.9 * m) / 120), setpoints: [sp(-600, 'COOL 66.7°F')], referenceF: 65.7, outdoorF: 42, active: false, lastMetAt: null }, { ...c, marginF: 3 });
    expect(e).toMatchObject({ outcome: 'TRIGGERED', evidence: { referenceF: 65.7, extremeF: 61.5, outdoorF: 42 } });
  });
  it('a scheduled setpoint change neither clears an active tip nor re-raises it — only a mode change does', () => {
    const base = { temps: every10(600, 720, () => 66), referenceF: 65.7, outdoorF: 60, active: true, lastMetAt: at(120) };
    // Setpoint changed by the schedule 30 min ago, still Cool mode → stays raised.
    expect(evaluateModeAdvisory({ ...base, now: at(720), setpoints: [sp(-600, 'COOL 66.7°F'), sp(690, 'COOL 68°F')] }, { ...c, marginF: 3 }).outcome).toBe('TRIGGERED');
    // Switched to Heat·Cool → no longer applicable (resolves).
    expect(evaluateModeAdvisory({ ...base, now: at(720), setpoints: [sp(-600, 'COOL 66.7°F'), sp(690, 'HEATCOOL 64–75°F')] }, { ...c, marginF: 3 }).outcome).toBe('NOT_APPLICABLE');
  });
  it('comfortReferenceF: the lowest cooling / highest heating setpoint the zone used', () => {
    expect(comfortReferenceF([sp(0, 'COOL 67.8°F'), sp(1, 'COOL 75.3°F'), sp(2, 'COOL 64.3°F')], 'COOL')).toBe(64.3);
    expect(comfortReferenceF([sp(0, 'HEAT 68°F'), sp(1, 'HEAT 62°F')], 'HEAT')).toBe(68);
    expect(comfortReferenceF([], 'COOL')).toBeNull();
  });
  it('Heat mode on a hot day is the mirror case', () => {
    const e = evaluateModeAdvisory({ now: at(120), temps: every10(0, 120, () => 77), setpoints: [sp(-600, 'HEAT 70°F')], referenceF: null, outdoorF: 90, active: false, lastMetAt: null }, c);
    expect(e).toMatchObject({ outcome: 'TRIGGERED', evidence: { direction: 'warm', setpointF: 70, extremeF: 77 } });
  });
});

describe('isOutOfAuthority — for the shadow statistics', () => {
  it('only while idle and no zone\'s mode can act in the drift direction', () => {
    const cool = [sp(0, 'COOL 67.8°F'), sp(0, 'COOL 75.3°F')];
    expect(isOutOfAuthority(61.5, cool, false, 1)).toBe(true);
    expect(isOutOfAuthority(61.5, cool, true, 1)).toBe(false);          // a zone is calling
    expect(isOutOfAuthority(67.5, cool, false, 1)).toBe(false);         // at the setpoint
    expect(isOutOfAuthority(61.5, [sp(0, 'COOL 67.8°F'), sp(0, 'HEATCOOL 64–75°F')], false, 1)).toBe(false); // one zone can heat
    expect(isOutOfAuthority(61.5, [null, null], false, 1)).toBe(false);  // unknown mode
  });
});
