import { createHash } from 'crypto';
import { SensorRole } from '../../common/enums/sensor-role.enum';

// Event correlation (spec §5): related rule findings and statistical
// anomalies for the same HVAC component, close in time, become ONE event —
// original rule/anomaly IDs kept as contributing members. Pure.

export interface FindingRef {
  id: string; ruleId: string; ruleGroup: string | null; severity: string; status: string;
  detectedAt: Date; resolvedAt: Date | null; sensorRole: string | null;
}
export interface AnomalyRef {
  id: string; sensorRole: string; type: string; state: string;
  startedAt: Date; lastObservedAt: Date; robustZ: number | null; transition: boolean;
}
export interface EvaluationRef { ruleId: string; outcome: string }

export interface CorrelatedGroup {
  component: string;           // the domain's primary component (most members)
  components: string[];        // every component the event touches
  category: 'EQUIPMENT' | 'SENSOR' | 'ENERGY';
  startedAt: Date;
  lastOccurrenceAt: Date;
  active: boolean;
  findingIds: string[];
  anomalyIds: string[];
  severity: string;            // from rule findings only; anomaly-only = INFO
  disagreement: string | null; // rule says normal, statistics say abnormal
  evidenceHash: string;
}

// Which component a rule group / sensor role belongs to — same tiles as
// component-health-definitions.ts.
const GROUP_COMPONENT: Record<string, string> = {
  HVAC_PERFORMANCE: 'PERFORMANCE', INDOOR_CLIMATE: 'PERFORMANCE', HVAC_COMFORT: 'PERFORMANCE', HVAC_RUNTIME: 'PERFORMANCE', HVAC_COMBINED: 'PERFORMANCE',
  HVAC_REFRIGERANT: 'REFRIGERANT', HVAC_HUMIDITY: 'HUMIDITY', HVAC_WATER: 'CONDENSATE', HVAC_STATE: 'CONTROLS', HVAC_AIRFLOW: 'AIRFLOW',
  HVAC_BLOWER: 'BLOWER', HVAC_COMPRESSOR: 'COMPRESSOR', HVAC_ELECTRICAL: 'ELECTRICAL',
};
export const ROLE_COMPONENT: Partial<Record<string, string>> = {
  [SensorRole.HVAC_SUCTION_LINE_TEMP]: 'REFRIGERANT', [SensorRole.HVAC_LIQUID_LINE_TEMP]: 'REFRIGERANT',
  [SensorRole.INDOOR_AMBIENT_HUMIDITY]: 'HUMIDITY', [SensorRole.HVAC_SUPPLY_TEMP]: 'PERFORMANCE', [SensorRole.HVAC_RETURN_TEMP]: 'PERFORMANCE',
  [SensorRole.INDOOR_AMBIENT_TEMP]: 'PERFORMANCE', [SensorRole.HVAC_STATE]: 'CONTROLS', [SensorRole.HVAC_DRAIN_WATER]: 'CONDENSATE',
  [SensorRole.HVAC_STATIC_PRESSURE]: 'AIRFLOW',
};
// The rule that already judges a sensor role — used to spot disagreement.
const ROLE_RULE: Partial<Record<string, string>> = {
  [SensorRole.HVAC_SUCTION_LINE_TEMP]: 'HVAC-REFRIGERANT-001', [SensorRole.HVAC_LIQUID_LINE_TEMP]: 'HVAC-REFRIGERANT-002',
  [SensorRole.INDOOR_AMBIENT_HUMIDITY]: 'HVAC-HUMIDITY-001', [SensorRole.INDOOR_AMBIENT_TEMP]: 'HVAC-COMFORT-001',
};
// Components whose symptoms are physically related and may be one event:
// supply air and suction line are both the cooling circuit; humidity and the
// condensate drain are both moisture removal. Anything else (controls,
// sensors, energy) only correlates with itself — unrelated faults are never
// merged just for being close in time.
const DOMAIN: Record<string, string> = { PERFORMANCE: 'COOLING_CIRCUIT', REFRIGERANT: 'COOLING_CIRCUIT', HUMIDITY: 'MOISTURE', CONDENSATE: 'MOISTURE' };
const domainOf = (component: string) => DOMAIN[component] ?? component;

const SEVERITY_RANK: Record<string, number> = { INFO: 0, NORMAL: 0, WATCH: 1, ATTENTION: 2, HIGH: 3, CRITICAL: 4 };

export function componentOfFinding(f: FindingRef): string | null {
  return (f.ruleGroup && GROUP_COMPONENT[f.ruleGroup]) ?? null;
}

export function correlate(findings: FindingRef[], anomalies: AnomalyRef[], evaluations: EvaluationRef[], cfg: { windowMinutes: number }): CorrelatedGroup[] {
  const win = cfg.windowMinutes * 60_000;
  type Item = { kind: 'F' | 'A'; id: string; component: string; category: CorrelatedGroup['category']; start: number; end: number; active: boolean; ref: FindingRef | AnomalyRef };
  const items: Item[] = [];
  for (const f of findings) {
    const component = componentOfFinding(f);
    if (!component) continue; // sensor-health findings (SENSOR-00x) have no equipment component
    items.push({ kind: 'F', id: f.id, component, category: 'EQUIPMENT', start: f.detectedAt.getTime(), end: (f.resolvedAt ?? new Date()).getTime(), active: f.status === 'ACTIVE', ref: f });
  }
  for (const a of anomalies) {
    // Transitions are expected behavior; they never form or join an equipment event.
    if (a.transition) continue;
    const isSensor = a.type === 'SENSOR_QUALITY';
    const component = isSensor ? `SENSOR:${a.sensorRole}` : a.type === 'ENERGY_ADVISORY' ? 'ENERGY' : ROLE_COMPONENT[a.sensorRole];
    if (!component) continue;
    items.push({ kind: 'A', id: a.id, component, category: isSensor ? 'SENSOR' : a.type === 'ENERGY_ADVISORY' ? 'ENERGY' : 'EQUIPMENT', start: a.startedAt.getTime(), end: a.lastObservedAt.getTime(), active: a.state !== 'RESOLVED', ref: a });
  }

  // Per component, chain items whose time spans are within the window of
  // each other. Different components are never merged.
  const groups: CorrelatedGroup[] = [];
  const byDomain = new Map<string, Item[]>();
  for (const it of items) byDomain.set(domainOf(it.component), [...(byDomain.get(domainOf(it.component)) ?? []), it]);
  for (const list of byDomain.values()) {
    list.sort((a, b) => a.start - b.start);
    let current: Item[] = [];
    let currentEnd = -Infinity;
    const flush = () => {
      if (current.length === 0) return;
      const fs = current.filter((i) => i.kind === 'F').map((i) => i.ref as FindingRef);
      const as = current.filter((i) => i.kind === 'A').map((i) => i.ref as AnomalyRef);
      const severity = fs.reduce((w, f) => (SEVERITY_RANK[f.severity] ?? 0) > (SEVERITY_RANK[w] ?? 0) ? f.severity : w, 'INFO');
      const disagreements = as.filter((a) => a.type !== 'ISOLATED' && a.state === 'ACTIVE' && ROLE_RULE[a.sensorRole]
        && evaluations.some((e) => e.ruleId === ROLE_RULE[a.sensorRole] && e.outcome === 'CLEAR'));
      const hashInput = [
        ...current.map((i) => `${i.kind}:${i.id}:${i.active ? 1 : 0}`).sort(), `sev:${severity}`,
      ].join('|');
      const counts = new Map<string, number>();
      for (const i of current) counts.set(i.component, (counts.get(i.component) ?? 0) + 1);
      const components = [...counts.keys()].sort();
      const component = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      groups.push({
        component, components, category: current[0].category,
        startedAt: new Date(Math.min(...current.map((i) => i.start))),
        lastOccurrenceAt: new Date(Math.max(...current.map((i) => i.end))),
        active: current.some((i) => i.active),
        findingIds: fs.map((f) => f.id), anomalyIds: as.map((a) => a.id), severity,
        disagreement: disagreements.length
          ? `Statistical deviation on ${disagreements.map((a) => a.sensorRole).join(', ')} while ${[...new Set(disagreements.map((a) => ROLE_RULE[a.sensorRole]))].join(', ')} evaluated as normal — review`
          : null,
        evidenceHash: createHash('sha256').update(hashInput).digest('hex').slice(0, 16),
      });
      current = [];
    };
    for (const it of list) {
      if (current.length && it.start > currentEnd + win) flush();
      current.push(it);
      currentEnd = Math.max(currentEnd, it.end);
    }
    flush();
  }
  return groups.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

// Notify once per event, again only when severity rises (spec §5) — and
// only when notifications are enabled (off during the shadow phase).
export function shouldNotify(group: Pick<CorrelatedGroup, 'severity' | 'active'>, notifiedSeverity: string | null, enabled: boolean): boolean {
  if (!enabled || !group.active || group.severity === 'INFO') return false;
  return notifiedSeverity == null || (SEVERITY_RANK[group.severity] ?? 0) > (SEVERITY_RANK[notifiedSeverity] ?? 0);
}
