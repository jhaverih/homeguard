import { Injectable } from '@nestjs/common';
import { SensorRole } from '../common/enums/sensor-role.enum';
import { AnalyticsFinding, FindingSeverity } from './entities/analytics-finding.entity';
import { COMPONENT_DEFINITIONS } from './component-health-definitions';
import { RULE_DEFINITIONS } from './rule-definitions';

export enum ComponentHealthStatus {
  GOOD = 'GOOD',
  ATTENTION = 'ATTENTION',
  CRITICAL = 'CRITICAL',
  NOT_MONITORED = 'NOT_MONITORED',
}

export interface ComponentHealthResult {
  id: string;
  label: string;
  status: ComponentHealthStatus;
}

export interface ComponentHealthOverview {
  components: ComponentHealthResult[];
  overall: {
    status: ComponentHealthStatus;
    monitoredCount: number;
    totalCount: number;
    lastUpdated: string;
  };
}

// Worst-active-finding-in-group -> tile status. INFO/NORMAL findings never
// escalate a tile past GOOD — they're informational, not a health signal.
const SEVERITY_RANK: Record<FindingSeverity, number> = {
  [FindingSeverity.NORMAL]: 0,
  [FindingSeverity.INFO]: 0,
  [FindingSeverity.WATCH]: 1,
  [FindingSeverity.ATTENTION]: 1,
  [FindingSeverity.HIGH]: 2,
  [FindingSeverity.CRITICAL]: 2,
};

// Pure read-side rollup over data AnalyticsEngineService/IotAnalyticsService
// already produce — never creates/mutates a finding, so it can't interact
// with the snooze/re-alert cron path. See component-health-definitions.ts
// for the 8-tile -> sensor-role/rule-group mapping this walks.
@Injectable()
export class ComponentHealthService {
  computeComponentHealth(taggedRoles: Set<SensorRole>, activeFindings: AnalyticsFinding[]): ComponentHealthOverview {
    const components = COMPONENT_DEFINITIONS.map((def) => {
      const hasTaggedSensor = def.requiredSensorRoles.some((r) => taggedRoles.has(r));
      const hasImplementedRule = RULE_DEFINITIONS.some((r) => def.ruleGroups.includes(r.ruleGroup) && r.implemented);
      if (!hasTaggedSensor || !hasImplementedRule) {
        return { id: def.id, label: def.label, status: ComponentHealthStatus.NOT_MONITORED };
      }

      const groupFindings = activeFindings.filter((f) => f.ruleGroup && def.ruleGroups.includes(f.ruleGroup));
      const worstRank = groupFindings.reduce((max, f) => Math.max(max, SEVERITY_RANK[f.severity] ?? 0), 0);
      const status = worstRank === 2 ? ComponentHealthStatus.CRITICAL
        : worstRank === 1 ? ComponentHealthStatus.ATTENTION
        : ComponentHealthStatus.GOOD;
      return { id: def.id, label: def.label, status };
    });

    const monitored = components.filter((c) => c.status !== ComponentHealthStatus.NOT_MONITORED);
    // Zero components monitored isn't "Good" — nothing is actually being
    // watched yet, so the overview banner shouldn't claim health.
    const overallStatus = monitored.length === 0 ? ComponentHealthStatus.NOT_MONITORED
      : monitored.some((c) => c.status === ComponentHealthStatus.CRITICAL) ? ComponentHealthStatus.CRITICAL
      : monitored.some((c) => c.status === ComponentHealthStatus.ATTENTION) ? ComponentHealthStatus.ATTENTION
      : ComponentHealthStatus.GOOD;

    return {
      components,
      overall: {
        status: overallStatus,
        monitoredCount: monitored.length,
        totalCount: COMPONENT_DEFINITIONS.length,
        lastUpdated: new Date().toISOString(),
      },
    };
  }
}
