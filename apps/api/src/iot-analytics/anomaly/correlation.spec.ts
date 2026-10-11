import { correlate, shouldNotify } from './correlation';
import { assessConfidence } from './confidence';

const T0 = Date.UTC(2026, 6, 15, 12, 0);
const at = (min: number) => new Date(T0 + min * 60_000);
const anomaly = (id: string, sensorRole: string, startMin: number, endMin: number, extra: any = {}) => ({
  id, sensorRole, type: 'PERSISTENT', state: 'ACTIVE', startedAt: at(startMin), lastObservedAt: at(endMin), robustZ: 6, transition: false, ...extra,
});
const finding = (id: string, ruleId: string, ruleGroup: string, minute: number, severity = 'WATCH') => ({
  id, ruleId, ruleGroup, severity, status: 'ACTIVE', detectedAt: at(minute), resolvedAt: null, sensorRole: null,
});
const W = { windowMinutes: 60 };

describe('correlate', () => {
  it('4. simultaneous supply and suction changes form one cooling-circuit event; unrelated controls stay separate', () => {
    const groups = correlate([], [
      anomaly('a-supply', 'HVAC_SUPPLY_TEMP', 0, 30),
      anomaly('a-suction', 'HVAC_SUCTION_LINE_TEMP', 5, 30),
      anomaly('a-call', 'HVAC_STATE', 10, 30),
    ], [], W);
    expect(groups).toHaveLength(2);
    const circuit = groups.find((g) => g.anomalyIds.includes('a-suction'))!;
    expect(circuit).toMatchObject({ components: ['PERFORMANCE', 'REFRIGERANT'], anomalyIds: ['a-supply', 'a-suction'] });
    expect(groups.find((g) => g.anomalyIds.includes('a-call'))!.components).toEqual(['CONTROLS']);
  });

  it('groups a rule finding and an anomaly on the same component, keeping both original IDs', () => {
    const groups = correlate([finding('f-1', 'HVAC-REFRIGERANT-001', 'HVAC_REFRIGERANT', 10, 'ATTENTION')], [anomaly('a-1', 'HVAC_SUCTION_LINE_TEMP', 0, 30)], [], W);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ component: 'REFRIGERANT', findingIds: ['f-1'], anomalyIds: ['a-1'], severity: 'ATTENTION', active: true });
  });

  it('does not merge same-component findings far apart in time', () => {
    const groups = correlate([], [anomaly('a-1', 'HVAC_SUCTION_LINE_TEMP', 0, 10), anomaly('a-2', 'HVAC_SUCTION_LINE_TEMP', 200, 210)], [], W);
    expect(groups).toHaveLength(2);
  });

  it('8. sensor-quality anomalies become their own sensor event, never an equipment one', () => {
    const groups = correlate([], [anomaly('a-q', 'HVAC_SUCTION_LINE_TEMP', 0, 0, { type: 'SENSOR_QUALITY' })], [], W);
    expect(groups[0]).toMatchObject({ category: 'SENSOR', component: 'SENSOR:HVAC_SUCTION_LINE_TEMP' });
  });

  it('5. a mode-transition anomaly does not create an equipment event', () => {
    expect(correlate([], [anomaly('a-t', 'HVAC_SUCTION_LINE_TEMP', 0, 20, { transition: true })], [], W)).toEqual([]);
  });

  it('flags disagreement when the statistics are abnormal but the rule evaluated as normal', () => {
    const groups = correlate([], [anomaly('a-1', 'HVAC_SUCTION_LINE_TEMP', 0, 30)], [{ ruleId: 'HVAC-REFRIGERANT-001', outcome: 'CLEAR' }], W);
    expect(groups[0].disagreement).toMatch(/HVAC-REFRIGERANT-001 evaluated as normal/);
    expect(groups[0].severity).toBe('INFO'); // anomaly-only events never take a rule severity
  });

  it('keeps the evidence hash stable for unchanged evidence and changes it when evidence changes', () => {
    const a = correlate([], [anomaly('a-1', 'HVAC_SUCTION_LINE_TEMP', 0, 30)], [], W)[0].evidenceHash;
    const b = correlate([], [anomaly('a-1', 'HVAC_SUCTION_LINE_TEMP', 0, 31)], [], W)[0].evidenceHash;
    const c = correlate([finding('f-1', 'HVAC-REFRIGERANT-001', 'HVAC_REFRIGERANT', 10)], [anomaly('a-1', 'HVAC_SUCTION_LINE_TEMP', 0, 31)], [], W)[0].evidenceHash;
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});

describe('shouldNotify', () => {
  it('10. notifies once, again only on a severity increase, never while disabled or for anomaly-only events', () => {
    expect(shouldNotify({ severity: 'WATCH', active: true }, null, true)).toBe(true);
    expect(shouldNotify({ severity: 'WATCH', active: true }, 'WATCH', true)).toBe(false);
    expect(shouldNotify({ severity: 'ATTENTION', active: true }, 'WATCH', true)).toBe(true);
    expect(shouldNotify({ severity: 'ATTENTION', active: true }, null, false)).toBe(false);
    expect(shouldNotify({ severity: 'INFO', active: true }, null, true)).toBe(false);
  });
});

describe('assessConfidence', () => {
  const base = { robustZs: [6], ruleFindings: 0, independentSignals: 1, inputsOk: 5, inputsTotal: 5, sensorQualityProblem: false, disagreement: false };
  it('keeps anomaly strength separate from diagnostic confidence', () => {
    const r = assessConfidence({ ...base, robustZs: [12] });
    expect(r).toMatchObject({ anomalyStrength: 'STRONG', evidenceCompleteness: 'COMPLETE', confidence: 'low' });
    expect(r.rationale.join(' ')).toMatch(/large statistical deviation alone/);
  });
  it('requires corroboration, completeness and a rule finding for high', () => {
    expect(assessConfidence({ ...base, independentSignals: 3, ruleFindings: 1 }).confidence).toBe('high');
    expect(assessConfidence({ ...base, independentSignals: 3, ruleFindings: 1, inputsOk: 3 }).confidence).toBe('medium');
    expect(assessConfidence({ ...base, independentSignals: 2, disagreement: true }).confidence).toBe('low');
  });
  it('a sensor-quality problem or poor data means insufficient evidence', () => {
    expect(assessConfidence({ ...base, independentSignals: 3, ruleFindings: 1, sensorQualityProblem: true }).confidence).toBe('insufficient_evidence');
    expect(assessConfidence({ ...base, inputsOk: 1 }).confidence).toBe('insufficient_evidence');
  });
});
