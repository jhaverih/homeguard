import { Injectable } from '@nestjs/common';
import { SensorRole } from '../common/enums/sensor-role.enum';
import { AnalyticsFinding, FindingSeverity } from './entities/analytics-finding.entity';
import { RuleEvaluationOutcome } from './entities/rule-evaluation.entity';
import { COMPONENT_DEFINITIONS } from './component-health-definitions';
import { RULE_DEFINITIONS } from './rule-definitions';
import { InputAssessment, aggregateRole } from './data-quality';

// Legacy 4-state tile status — still returned (as `status`) so app builds
// that predate the evidence-based statuses keep rendering correctly.
export enum ComponentHealthStatus {
  GOOD = 'GOOD',
  ATTENTION = 'ATTENTION',
  CRITICAL = 'CRITICAL',
  NOT_MONITORED = 'NOT_MONITORED',
}

// Evidence-based status (Attenteve HVAC analytics spec §7). HEALTHY needs
// positive evidence — valid, fresh inputs AND a recent successful rule
// evaluation — never just the absence of an alert.
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  BASELINE_COLLECTING = 'BASELINE_COLLECTING',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  MONITOR = 'MONITOR',
  MAINTENANCE_RECOMMENDED = 'MAINTENANCE_RECOMMENDED',
  CRITICAL = 'CRITICAL',
  NOT_MONITORED = 'NOT_MONITORED',
}

export interface ComponentHealthResult {
  id: string;
  label: string;
  status: ComponentHealthStatus;
  healthStatus: HealthStatus;
  // Why the status is what it is, in plain language (null when Healthy).
  reason: string | null;
  // Inputs that are degraded while the tile is still assessed from the rest
  // (e.g. one of two zone thermostats offline).
  limitations: string[];
}

export interface ComponentHealthOverview {
  components: ComponentHealthResult[];
  overall: {
    status: ComponentHealthStatus;
    healthStatus: HealthStatus;
    monitoredCount: number;
    totalCount: number;
    lastUpdated: string;
  };
}

export interface HealthEvidence {
  inputs: InputAssessment[];
  evaluations: { ruleId: string; outcome: RuleEvaluationOutcome; reason: string | null; evaluatedAt: Date }[];
  now: Date;
  evidenceMaxAgeHours: number;
}

// Worst-active-finding-in-group -> status. INFO/NORMAL findings never
// escalate a tile — they're informational, not a health signal.
const SEVERITY_RANK: Record<FindingSeverity, number> = {
  [FindingSeverity.NORMAL]: 0,
  [FindingSeverity.INFO]: 0,
  [FindingSeverity.WATCH]: 1,
  [FindingSeverity.ATTENTION]: 2,
  [FindingSeverity.HIGH]: 2,
  [FindingSeverity.CRITICAL]: 3,
};
const FINDING_STATUS = [null, HealthStatus.MONITOR, HealthStatus.MAINTENANCE_RECOMMENDED, HealthStatus.CRITICAL] as const;

const OVERALL_RANK: Record<HealthStatus, number> = {
  [HealthStatus.NOT_MONITORED]: -1,
  [HealthStatus.HEALTHY]: 0,
  [HealthStatus.BASELINE_COLLECTING]: 1,
  [HealthStatus.INSUFFICIENT_DATA]: 2,
  [HealthStatus.MONITOR]: 3,
  [HealthStatus.MAINTENANCE_RECOMMENDED]: 4,
  [HealthStatus.CRITICAL]: 5,
};

export function legacyStatus(h: HealthStatus): ComponentHealthStatus {
  switch (h) {
    case HealthStatus.HEALTHY:
    case HealthStatus.BASELINE_COLLECTING: return ComponentHealthStatus.GOOD;
    case HealthStatus.MONITOR:
    case HealthStatus.MAINTENANCE_RECOMMENDED: return ComponentHealthStatus.ATTENTION;
    case HealthStatus.CRITICAL: return ComponentHealthStatus.CRITICAL;
    default: return ComponentHealthStatus.NOT_MONITORED;
  }
}

const RULE_GROUP = new Map(RULE_DEFINITIONS.map((r) => [r.ruleId, r.ruleGroup]));

// Pure read-side rollup over data the engines already produce — never
// creates/mutates a finding, so it can't interact with the snooze/re-alert
// path. See component-health-definitions.ts for the tile → sensor-role/
// rule-group mapping. Without `evidence` (legacy callers) it can only judge
// findings, so a monitored tile with no finding is INSUFFICIENT_DATA rather
// than Healthy.
@Injectable()
export class ComponentHealthService {
  computeComponentHealth(taggedRoles: Set<SensorRole>, activeFindings: AnalyticsFinding[], evidence?: HealthEvidence): ComponentHealthOverview {
    const now = evidence?.now ?? new Date();
    const components: ComponentHealthResult[] = COMPONENT_DEFINITIONS.map((def) => {
      const tagged = def.requiredSensorRoles.filter((r) => taggedRoles.has(r));
      const tileRules = RULE_DEFINITIONS.filter((r) => def.ruleGroups.includes(r.ruleGroup) && r.implemented);
      const base = { id: def.id, label: def.label, limitations: [] as string[] };
      if (tagged.length === 0 || tileRules.length === 0) {
        return { ...base, status: ComponentHealthStatus.NOT_MONITORED, healthStatus: HealthStatus.NOT_MONITORED, reason: 'No sensors installed for this component' };
      }

      // 1. Active findings always win — including CRITICAL water leaks,
      //    which must never be hidden by missing thermostat data.
      const groupFindings = activeFindings.filter((f) => f.ruleGroup && def.ruleGroups.includes(f.ruleGroup));
      const worst = groupFindings.reduce((max, f) => Math.max(max, SEVERITY_RANK[f.severity] ?? 0), 0);
      const findingStatus = FINDING_STATUS[worst];

      // 2. Input quality for this tile's installed sensor roles.
      const limitations: string[] = [];
      let missing: string | null = null;
      for (const role of tagged) {
        const roleInputs = evidence?.inputs.filter((i) => i.sensorRole === role) ?? [];
        if (roleInputs.length === 0) continue;
        const agg = aggregateRole(roleInputs);
        const bad = roleInputs.filter((i) => i.state !== 'OK').map((i) => `${i.label}: ${i.detail ?? i.state.toLowerCase()}`);
        if (agg === 'NONE') missing ??= bad.join('; ');
        else limitations.push(...bad);
      }
      if (findingStatus) {
        return { ...base, limitations, status: legacyStatus(findingStatus), healthStatus: findingStatus, reason: groupFindings[0]?.message ?? null };
      }
      if (!evidence) {
        return { ...base, status: ComponentHealthStatus.NOT_MONITORED, healthStatus: HealthStatus.INSUFFICIENT_DATA, reason: 'Not enough information to assess' };
      }
      if (missing) {
        return { ...base, limitations, status: legacyStatus(HealthStatus.INSUFFICIENT_DATA), healthStatus: HealthStatus.INSUFFICIENT_DATA, reason: missing };
      }

      // 3. Positive evidence: a recent successful evaluation of this tile's
      //    rules. Tiles whose rules don't record evaluations (the water
      //    rules, which alert on events) rely on input quality alone.
      const evaluatedRules = tileRules.filter((r) => r.recordsEvaluations);
      if (evaluatedRules.length === 0) {
        return { ...base, limitations, status: ComponentHealthStatus.GOOD, healthStatus: HealthStatus.HEALTHY, reason: null };
      }
      const maxAgeMs = evidence.evidenceMaxAgeHours * 60 * 60 * 1000;
      const recent = evidence.evaluations.filter((e) => def.ruleGroups.includes(RULE_GROUP.get(e.ruleId) ?? '') && now.getTime() - e.evaluatedAt.getTime() <= maxAgeMs);
      if (recent.some((e) => e.outcome === RuleEvaluationOutcome.CLEAR || e.outcome === RuleEvaluationOutcome.TRIGGERED)) {
        const collecting = recent.some((e) => e.outcome === RuleEvaluationOutcome.BASELINE_COLLECTING);
        if (collecting) limitations.push('Baseline collecting — comparisons against this home\'s normal pattern start once enough history exists');
        return { ...base, limitations, status: ComponentHealthStatus.GOOD, healthStatus: HealthStatus.HEALTHY, reason: null };
      }
      if (recent.some((e) => e.outcome === RuleEvaluationOutcome.BASELINE_COLLECTING)) {
        return { ...base, limitations, status: legacyStatus(HealthStatus.BASELINE_COLLECTING), healthStatus: HealthStatus.BASELINE_COLLECTING, reason: 'Baseline collecting — learning this home\'s normal pattern' };
      }
      const why = recent.find((e) => e.reason)?.reason ?? 'No recent operation to assess yet';
      return { ...base, limitations, status: legacyStatus(HealthStatus.INSUFFICIENT_DATA), healthStatus: HealthStatus.INSUFFICIENT_DATA, reason: why };
    });

    const monitored = components.filter((c) => c.healthStatus !== HealthStatus.NOT_MONITORED);
    const overall = monitored.length === 0
      ? HealthStatus.NOT_MONITORED
      : monitored.reduce((w, c) => (OVERALL_RANK[c.healthStatus] > OVERALL_RANK[w] ? c.healthStatus : w), HealthStatus.HEALTHY);

    return {
      components,
      overall: {
        status: legacyStatus(overall),
        healthStatus: overall,
        monitoredCount: monitored.length,
        totalCount: COMPONENT_DEFINITIONS.length,
        lastUpdated: now.toISOString(),
      },
    };
  }
}
