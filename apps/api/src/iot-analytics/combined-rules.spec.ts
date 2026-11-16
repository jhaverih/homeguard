import { evaluateHighConfidenceIssue } from './combined-rules';
import { FindingSeverity } from './entities/analytics-finding.entity';

const NOW = new Date('2026-11-14T02:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const f = (ruleGroup: string, severity: FindingSeverity, days: number) => ({ ruleGroup, severity, detectedAt: daysAgo(days) });

describe('HVAC-COMBINED-002 (high-confidence issue)', () => {
  it('does not fire on the 2026-11-14 false positive: one humidity rule on two zones plus an Info advisory', () => {
    const r = evaluateHighConfidenceIssue([
      f('HVAC_HUMIDITY', FindingSeverity.WATCH, 10),
      f('HVAC_HUMIDITY', FindingSeverity.WATCH, 10),
      f('HVAC_ADVISORY', FindingSeverity.INFO, 0.5),
    ], NOW);
    expect(r).toEqual({ met: false, groups: ['HVAC_HUMIDITY'] });
  });

  it('fires on three different kinds of problem with one persisting 3+ days', () => {
    const r = evaluateHighConfidenceIssue([
      f('HVAC_HUMIDITY', FindingSeverity.WATCH, 4),
      f('HVAC_RUNTIME', FindingSeverity.WATCH, 1),
      f('HVAC_REFRIGERANT', FindingSeverity.ATTENTION, 0.1),
    ], NOW);
    expect(r.met).toBe(true);
    expect(r.groups).toHaveLength(3);
  });

  it('needs a persistent problem, and ignores other combined or sensor-health findings', () => {
    expect(evaluateHighConfidenceIssue([
      f('HVAC_HUMIDITY', FindingSeverity.WATCH, 1), f('HVAC_RUNTIME', FindingSeverity.WATCH, 1), f('HVAC_REFRIGERANT', FindingSeverity.ATTENTION, 1),
    ], NOW).met).toBe(false);
    expect(evaluateHighConfidenceIssue([
      f('HVAC_HUMIDITY', FindingSeverity.WATCH, 5), f('HVAC_RUNTIME', FindingSeverity.WATCH, 5),
      f('HVAC_COMBINED', FindingSeverity.HIGH, 5), f('SENSOR_HEALTH', FindingSeverity.WATCH, 5),
    ], NOW).met).toBe(false);
  });
});
