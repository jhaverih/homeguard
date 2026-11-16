import { FindingSeverity } from './entities/analytics-finding.entity';

// HVAC-COMBINED-002 — "several independent problems, at least one of them
// persistent". Independent means distinct rule groups: the same rule on two
// zone thermostats, or two rules about the same symptom (both humidity
// rules), is one problem. Informational advisories, sensor-health findings
// and the combined rules themselves are not HVAC problems and never count.
const NOT_A_PROBLEM_GROUPS = new Set(['HVAC_COMBINED', 'HVAC_ADVISORY', 'SENSOR_HEALTH']);
const NOT_A_PROBLEM_SEVERITIES = new Set([FindingSeverity.INFO, FindingSeverity.NORMAL]);

export const HIGH_CONFIDENCE_MIN_GROUPS = 3;
export const HIGH_CONFIDENCE_PERSISTENT_DAYS = 3;

export function evaluateHighConfidenceIssue(
  active: { ruleGroup: string | null; severity: FindingSeverity; detectedAt: Date }[],
  now: Date,
): { met: boolean; groups: string[] } {
  const problems = active.filter((f) => f.ruleGroup && !NOT_A_PROBLEM_GROUPS.has(f.ruleGroup) && !NOT_A_PROBLEM_SEVERITIES.has(f.severity));
  const groups = [...new Set(problems.map((f) => f.ruleGroup as string))].sort();
  const cutoff = now.getTime() - HIGH_CONFIDENCE_PERSISTENT_DAYS * 24 * 60 * 60 * 1000;
  const persistent = problems.some((f) => f.detectedAt.getTime() <= cutoff);
  return { met: groups.length >= HIGH_CONFIDENCE_MIN_GROUPS && persistent, groups };
}
