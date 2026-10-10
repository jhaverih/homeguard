import { ComponentHealthService, ComponentHealthStatus, HealthEvidence, HealthStatus } from './component-health.service';
import { RuleEvaluationOutcome } from './entities/rule-evaluation.entity';
import { FindingSeverity } from './entities/analytics-finding.entity';
import { SensorRole } from '../common/enums/sensor-role.enum';
import { InputAssessment } from './data-quality';

const now = new Date(Date.UTC(2026, 6, 15, 18, 0));
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const input = (sensorRole: SensorRole, label: string, state: InputAssessment['state'] = 'OK'): InputAssessment => ({
  sensorRole, deviceRegistryId: label, label, state, detail: state === 'OK' ? null : 'Device is offline', lastValidAt: hoursAgo(0.1),
});
const evaluation = (ruleId: string, outcome: RuleEvaluationOutcome, ageHours = 1, reason: string | null = null) => ({ ruleId, outcome, reason, evaluatedAt: hoursAgo(ageHours) });
const finding = (ruleGroup: string, severity: FindingSeverity) => ({ ruleGroup, severity, message: `${ruleGroup} finding` } as any);

// The pilot house: two Nest zones + YoLink indoor/drain/line probes, no supply/return air.
const pilotRoles = new Set([
  SensorRole.HVAC_STATE, SensorRole.HVAC_THERMOSTAT_SETPOINT, SensorRole.INDOOR_AMBIENT_TEMP, SensorRole.INDOOR_AMBIENT_HUMIDITY,
  SensorRole.HVAC_DRAIN_WATER, SensorRole.HVAC_SUCTION_LINE_TEMP, SensorRole.HVAC_LIQUID_LINE_TEMP,
]);
const pilotInputs = (over: Partial<Record<string, InputAssessment['state']>> = {}): InputAssessment[] => [
  input(SensorRole.HVAC_STATE, 'Kitchen thermostat', over.kitchen ?? 'OK'),
  input(SensorRole.HVAC_STATE, 'Master Bedroom thermostat', over.bedroom ?? 'OK'),
  input(SensorRole.INDOOR_AMBIENT_TEMP, 'Kitchen thermostat', over.kitchen ?? 'OK'),
  input(SensorRole.INDOOR_AMBIENT_TEMP, 'Master Bedroom thermostat', over.bedroom ?? 'OK'),
  input(SensorRole.HVAC_DRAIN_WATER, 'ATV HVAC Drain Pan'),
  input(SensorRole.HVAC_SUCTION_LINE_TEMP, 'ATV HVAC Suction Line Temp'),
];
const tile = (overview: ReturnType<ComponentHealthService['computeComponentHealth']>, id: string) => overview.components.find((c) => c.id === id)!;

describe('ComponentHealthService — evidence-based health', () => {
  const service = new ComponentHealthService();
  const evidence = (over: Partial<HealthEvidence> = {}): HealthEvidence => ({ inputs: pilotInputs(), evaluations: [], now, evidenceMaxAgeHours: 48, ...over });

  it('13. supply/return probes absent: performance is still monitored from thermostats', () => {
    const h = service.computeComponentHealth(pilotRoles, [], evidence({ evaluations: [evaluation('HVAC-COMFORT-001', RuleEvaluationOutcome.CLEAR)] }));
    expect(tile(h, 'PERFORMANCE').healthStatus).toBe(HealthStatus.HEALTHY);
    expect(tile(h, 'AIRFLOW').healthStatus).toBe(HealthStatus.NOT_MONITORED);
  });

  it('20. no finding is not enough — without a recent successful evaluation it is Insufficient data', () => {
    const h = service.computeComponentHealth(pilotRoles, [], evidence());
    expect(tile(h, 'PERFORMANCE').healthStatus).toBe(HealthStatus.INSUFFICIENT_DATA);
    const stale = service.computeComponentHealth(pilotRoles, [], evidence({ evaluations: [evaluation('HVAC-COMFORT-001', RuleEvaluationOutcome.CLEAR, 72)] }));
    expect(tile(stale, 'PERFORMANCE').healthStatus).toBe(HealthStatus.INSUFFICIENT_DATA);
    const legacy = service.computeComponentHealth(pilotRoles, []);
    expect(legacy.overall.healthStatus).not.toBe(HealthStatus.HEALTHY);
  });

  it('shows Baseline collecting when that is all the evidence says', () => {
    const h = service.computeComponentHealth(pilotRoles, [], evidence({ evaluations: [evaluation('HVAC-REFRIGERANT-001', RuleEvaluationOutcome.BASELINE_COLLECTING, 1, 'Baseline collecting')] }));
    expect(tile(h, 'REFRIGERANT')).toMatchObject({ healthStatus: HealthStatus.BASELINE_COLLECTING, status: ComponentHealthStatus.GOOD });
  });

  it('14. one zone thermostat offline: still assessed from the other, with the limitation stated', () => {
    const h = service.computeComponentHealth(pilotRoles, [], evidence({ inputs: pilotInputs({ kitchen: 'UNAVAILABLE' }), evaluations: [evaluation('HVAC-COMFORT-001', RuleEvaluationOutcome.CLEAR)] }));
    const perf = tile(h, 'PERFORMANCE');
    expect(perf.healthStatus).toBe(HealthStatus.HEALTHY);
    expect(perf.limitations.join(' ')).toMatch(/Kitchen thermostat: Device is offline/);
  });

  it('11. all thermostats unavailable (e.g. Nest auth failure) → Insufficient data, never Healthy', () => {
    const h = service.computeComponentHealth(pilotRoles, [], evidence({ inputs: pilotInputs({ kitchen: 'AUTH_FAILURE', bedroom: 'AUTH_FAILURE' }), evaluations: [evaluation('HVAC-COMFORT-001', RuleEvaluationOutcome.CLEAR)] }));
    expect(tile(h, 'PERFORMANCE').healthStatus).toBe(HealthStatus.INSUFFICIENT_DATA);
  });

  it('17. a water leak stays Critical while Nest is unavailable', () => {
    const h = service.computeComponentHealth(pilotRoles, [finding('HVAC_WATER', FindingSeverity.CRITICAL)], evidence({ inputs: pilotInputs({ kitchen: 'AUTH_FAILURE', bedroom: 'AUTH_FAILURE' }) }));
    expect(tile(h, 'CONDENSATE').healthStatus).toBe(HealthStatus.CRITICAL);
    expect(h.overall).toMatchObject({ healthStatus: HealthStatus.CRITICAL, status: ComponentHealthStatus.CRITICAL });
  });

  it('maps finding severities to Monitor / Maintenance recommended', () => {
    const watch = service.computeComponentHealth(pilotRoles, [finding('HVAC_COMFORT', FindingSeverity.WATCH)], evidence());
    expect(tile(watch, 'PERFORMANCE')).toMatchObject({ healthStatus: HealthStatus.MONITOR, status: ComponentHealthStatus.ATTENTION });
    const combined = service.computeComponentHealth(pilotRoles, [finding('HVAC_COMBINED', FindingSeverity.ATTENTION)], evidence());
    expect(tile(combined, 'PERFORMANCE').healthStatus).toBe(HealthStatus.MAINTENANCE_RECOMMENDED);
  });
});
