import { FindOperator } from 'typeorm';
import { CoolingRulesService } from './cooling-rules.service';
import { PerformanceEngineService } from './performance-engine.service';
import { THRESHOLD_DEFINITIONS } from './threshold-definitions';
import { FindingStatus } from './entities/analytics-finding.entity';
import { RuleEvaluationOutcome } from './entities/rule-evaluation.entity';
import { SensorRole } from '../common/enums/sensor-role.enum';
import { UNVERIFIED_MAPPING_REASON } from './hvac-configuration';

// In-memory repo understanding the FindOperators these services use.
function fakeRepo(rows: any[] = []) {
  const matchValue = (actual: any, v: any): boolean => {
    if (v instanceof FindOperator) {
      const inner = (v as any)._value;
      switch (v.type) {
        case 'in': return (inner as any[]).includes(actual);
        case 'moreThan': return actual > inner;
        case 'lessThanOrEqual': return actual <= inner;
        case 'between': return actual >= inner[0] && actual <= inner[1];
        case 'not': return inner instanceof FindOperator && inner.type === 'isNull' ? actual != null : actual !== inner;
        default: throw new Error(`unsupported operator ${v.type}`);
      }
    }
    return actual === v;
  };
  const match = (r: any, where: any) => Object.entries(where ?? {}).every(([k, v]) => matchValue(r[k], v));
  const sort = (list: any[], order?: Record<string, 'ASC' | 'DESC'>) => {
    const [key, dir] = Object.entries(order ?? {})[0] ?? [];
    if (!key) return list;
    return [...list].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (dir === 'DESC' ? -1 : 1));
  };
  let seq = 0;
  return {
    rows,
    find: jest.fn(async (opts: any = {}) => sort(rows.filter((r) => match(r, opts.where)), opts.order)),
    findOne: jest.fn(async (opts: any = {}) => sort(rows.filter((r) => match(r, opts.where)), opts.order)[0] ?? null),
    count: jest.fn(async (opts: any = {}) => rows.filter((r) => match(r, opts.where)).length),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => { if (!rows.includes(d)) { d.id ??= `row-${++seq}`; d.status ??= FindingStatus.ACTIVE; rows.push(d); } return d; }),
  };
}

const T0 = Date.UTC(2026, 6, 15, 14, 0);
const at = (min: number) => new Date(T0 + min * 60_000);
const DEFAULTS = Object.fromEntries(THRESHOLD_DEFINITIONS.map((d) => [d.key, d.defaultValue]));

describe('CoolingRulesService (pilot-house shaped: one AHU, two damper zones, line probes)', () => {
  let registry: ReturnType<typeof fakeRepo>;
  let assignments: ReturnType<typeof fakeRepo>;
  let equipment: ReturnType<typeof fakeRepo>;
  let telemetry: ReturnType<typeof fakeRepo>;
  let findings: ReturnType<typeof fakeRepo>;
  let evaluations: ReturnType<typeof fakeRepo>;
  let samples: { equipmentId: string; metricKey: string; value: number; observedAt: Date; context: any }[];
  let alerts: { createAlert: jest.Mock };
  let service: CoolingRulesService;
  const home: any = { id: 'yl-home', customerId: 'cust-1', homeId: 'home-1', isActive: true };

  const device = (id: string, providerDeviceId: string, role: SensorRole, extra: any = {}) => {
    registry.rows.push({ id, homeId: 'home-1', provider: 'nest', providerDeviceId, currentProviderName: 'Thermostat', currentProviderRoom: extra.room ?? null, connectivity: extra.connectivity ?? 'ONLINE' });
    assignments.rows.push({ deviceRegistryId: id, equipmentId: 'hvac-01', sensorRole: role });
  };
  const zone = (key: string, room: string, connectivity = 'ONLINE') => {
    device(`${key}-temp`, `${key}:temperature`, SensorRole.INDOOR_AMBIENT_TEMP, { room, connectivity });
    device(`${key}-hvac`, `${key}:hvac`, SensorRole.HVAC_STATE, { room, connectivity });
    device(`${key}-sp`, `${key}:setpoint`, SensorRole.HVAC_THERMOSTAT_SETPOINT, { room, connectivity });
  };
  const reading = (deviceRegistryId: string, min: number, value: string, numericValue: number | null = null) =>
    telemetry.rows.push({ deviceRegistryId, observedAt: at(min), value, numericValue, dataQuality: 'VALID' });
  const every5 = (deviceRegistryId: string, from: number, to: number, f: (m: number) => number) => {
    for (let m = from; m <= to; m += 5) reading(deviceRegistryId, m, String(f(m)), f(m));
  };
  const activeFindings = (ruleId: string) => findings.rows.filter((f) => f.ruleId === ruleId && f.status === FindingStatus.ACTIVE);
  const evaluationOf = (ruleId: string, scope?: string) => evaluations.rows.find((e) => e.ruleId === ruleId && (!scope || e.scopeKey === scope));

  beforeEach(() => {
    registry = fakeRepo(); assignments = fakeRepo(); telemetry = fakeRepo(); findings = fakeRepo(); evaluations = fakeRepo();
    equipment = fakeRepo([{ id: 'hvac-01', homeId: 'home-1', equipmentType: 'HVAC', equipmentNumber: '01', equipmentCode: 'HVAC-01', metadata: { hvacConfiguration: 'MULTIZONE', verified: true } }]);
    samples = [];
    alerts = { createAlert: jest.fn(async () => ({ id: 'alert-1' })) };
    const thresholds: any = { getValue: jest.fn(async (k: string) => DEFAULTS[k]) };
    const baselines: any = {
      recordSample: jest.fn(async (_c: string, equipmentId: string, metricKey: string, value: number, observedAt: Date, context: any) => { samples.push({ equipmentId, metricKey, value, observedAt, context }); }),
      getRecentSamples: jest.fn(async (equipmentId: string, metricKey: string) => samples.filter((s) => s.equipmentId === equipmentId && s.metricKey === metricKey).sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())),
    };
    const performance = new PerformanceEngineService(findings as any, equipment as any, registry as any, assignments as any, telemetry as any, {} as any, {} as any, alerts as any, thresholds, baselines);
    const weather: any = { outdoorBandAt: jest.fn(async () => '90s') };
    service = new CoolingRulesService(registry as any, assignments as any, equipment as any, telemetry as any, findings as any, evaluations as any, fakeRepo([home]) as any, thresholds, baselines, performance, weather);

    zone('k', 'Kitchen');
    zone('b', 'Master Bedroom');
    reading('k-sp', -300, 'COOL 72°F');
    reading('b-sp', -300, 'COOL 72°F');
  });

  it('2/18/19. a stuck cooldown raises one zone finding, stays single on re-evaluation, and resolves when cooling ends', async () => {
    reading('k-hvac', 0, 'COOLING', 1);
    every5('k-temp', 0, 90, () => 76.5);
    reading('b-hvac', 0, 'OFF', 0);
    every5('b-temp', 0, 90, () => 72);

    await service.evaluateEquipment('hvac-01', home, at(90));
    await service.evaluateEquipment('hvac-01', home, at(90)); // duplicate evaluation
    const kitchen = activeFindings('HVAC-COMFORT-001');
    expect(kitchen).toHaveLength(1);
    expect(kitchen[0]).toMatchObject({ deviceRegistryId: 'k-temp', equipmentId: 'hvac-01', ruleVersion: 2 });
    expect(kitchen[0].message).toMatch(/^Kitchen thermostat: Your HVAC system is taking longer than usual/);
    expect(evaluationOf('HVAC-COMFORT-001', 'device:b-temp')).toBeUndefined(); // bedroom wasn't cooling → not applicable, nothing recorded

    reading('k-hvac', 95, 'OFF', 0);
    every5('k-temp', 95, 100, () => 74);
    await service.evaluateEquipment('hvac-01', home, at(100));
    expect(activeFindings('HVAC-COMFORT-001')).toHaveLength(0);
    expect(findings.rows.find((f) => f.ruleId === 'HVAC-COMFORT-001').status).toBe(FindingStatus.RESOLVED);
  });

  it('15. verified multizone: zone hand-offs merge into one system cycle — no frequent-cycling finding', async () => {
    reading('k-hvac', 0, 'COOLING', 1); reading('b-hvac', 15, 'COOLING', 1);
    reading('k-hvac', 20, 'OFF', 0); reading('k-hvac', 40, 'COOLING', 1);
    reading('b-hvac', 45, 'OFF', 0); reading('k-hvac', 55, 'OFF', 0);
    every5('k-temp', 0, 58, () => 72); every5('b-temp', 0, 58, () => 72);
    await service.evaluateEquipment('hvac-01', home, at(58));
    expect(evaluationOf('HVAC-RUNTIME-003')).toMatchObject({ outcome: RuleEvaluationOutcome.CLEAR, inputs: expect.objectContaining({ coolingStarts: 1 }) });
    expect(activeFindings('HVAC-RUNTIME-003')).toHaveLength(0);
  });

  it('compressor cycling (no compressor sensor): quick restarts inferred from calls raise a dashboard-only WATCH finding', async () => {
    // Off for only 2 and 3 minutes between runs; the Bedroom hand-off at 40 is merged.
    reading('k-hvac', 0, 'COOLING', 1); reading('k-hvac', 10, 'OFF', 0);
    reading('k-hvac', 12, 'COOLING', 1); reading('k-hvac', 22, 'OFF', 0);
    reading('k-hvac', 25, 'COOLING', 1); reading('k-hvac', 40, 'OFF', 0); reading('b-hvac', 40.5, 'COOLING', 1); reading('b-hvac', 52, 'OFF', 0);
    every5('k-temp', 0, 58, () => 72); every5('b-temp', 0, 58, () => 72);
    await service.evaluateEquipment('hvac-01', home, at(58));
    expect(evaluationOf('HVAC-COMPRESSOR-006')).toMatchObject({ outcome: RuleEvaluationOutcome.TRIGGERED, inputs: expect.objectContaining({ quickRestartCount: 2, offMinutes: [2, 3] }) });
    const [f] = activeFindings('HVAC-COMPRESSOR-006');
    expect(f).toMatchObject({ ruleGroup: 'HVAC_COMPRESSOR', severity: 'WATCH' });
    expect(f.message).toContain('inferred from your thermostat');
    expect(alerts.createAlert).not.toHaveBeenCalled();
    // Runs were 10–27 min, so no short-run finding.
    expect(evaluationOf('HVAC-COMPRESSOR-005')).toMatchObject({ outcome: RuleEvaluationOutcome.CLEAR });
  });

  it('compressor cycling is left to the power-meter rule where a compressor sensor is installed', async () => {
    assignments.rows.push({ deviceRegistryId: 'comp-pwr', equipmentId: 'hvac-01', sensorRole: SensorRole.HVAC_COMPRESSOR_POWER });
    reading('k-hvac', 0, 'COOLING', 1); reading('k-hvac', 10, 'OFF', 0); reading('k-hvac', 12, 'COOLING', 1); reading('k-hvac', 22, 'OFF', 0);
    every5('k-temp', 0, 30, () => 72); every5('b-temp', 0, 30, () => 72);
    await service.evaluateEquipment('hvac-01', home, at(30));
    expect(evaluationOf('HVAC-COMPRESSOR-006')).toBeUndefined();
  });

  it('unverified multizone: zone-combining rules report Insufficient data instead of guessing', async () => {
    equipment.rows[0].metadata = null;
    reading('k-hvac', 0, 'COOLING', 1); every5('k-temp', 0, 30, () => 72);
    await service.evaluateEquipment('hvac-01', home, at(30));
    expect(evaluationOf('HVAC-RUNTIME-003')).toMatchObject({ outcome: RuleEvaluationOutcome.INSUFFICIENT_DATA, reason: UNVERIFIED_MAPPING_REASON });
    expect(findings.rows).toHaveLength(0);
  });

  it('resolves findings left by the previous version of a rewritten rule, marked superseded', async () => {
    findings.rows.push(
      { id: 'old-1', ruleId: 'HVAC-REFRIGERANT-001', ruleVersion: 1, status: FindingStatus.ACTIVE, sensorRole: SensorRole.HVAC_SUCTION_LINE_TEMP, measurements: {} },
      { id: 'pwr-1', ruleId: 'HVAC-RUNTIME-001', ruleVersion: 1, status: FindingStatus.ACTIVE, sensorRole: SensorRole.HVAC_POWER, measurements: {} },
    );
    expect(await service.supersedeOldFindings()).toBe(1);
    expect(findings.rows.find((f) => f.id === 'old-1')).toMatchObject({ status: FindingStatus.RESOLVED, measurements: { supersededBy: 'v2' } });
    expect(findings.rows.find((f) => f.id === 'pwr-1').status).toBe(FindingStatus.ACTIVE);
  });

  it('a stale "mapping not confirmed" reason is refreshed once the rule simply has nothing to assess', async () => {
    equipment.rows[0].metadata = null;
    reading('k-hvac', 0, 'COOLING', 1); every5('k-temp', 0, 30, () => 72);
    await service.evaluateEquipment('hvac-01', home, at(30));
    expect(evaluationOf('HVAC-RUNTIME-003')!.reason).toBe(UNVERIFIED_MAPPING_REASON);
    reading('k-hvac', 35, 'OFF', 0); every5('b-temp', 0, 60, () => 72); every5('k-temp', 35, 60, () => 72);
    registry.rows.push({ id: 'liquid', homeId: 'home-1', provider: 'yolink', providerDeviceId: 'eui-liquid' });
    assignments.rows.push({ deviceRegistryId: 'liquid', equipmentId: 'hvac-01', sensorRole: SensorRole.HVAC_LIQUID_LINE_TEMP });
    await service.evaluateEquipment('hvac-01', home, at(31));
    expect(evaluationOf('HVAC-REFRIGERANT-002')!.reason).toBe(UNVERIFIED_MAPPING_REASON);
    equipment.rows[0].metadata = { verified: true }; // mapping confirmed; the system has since stopped cooling
    await service.evaluateEquipment('hvac-01', home, at(60));
    expect(evaluationOf('HVAC-REFRIGERANT-002')).toMatchObject({ outcome: RuleEvaluationOutcome.INSUFFICIENT_DATA, reason: 'Not cooling' });
  });

  it('14. one zone thermostat offline: its rules are Insufficient data while the other zone is still evaluated', async () => {
    registry.rows.filter((d) => d.id.startsWith('k-')).forEach((d) => { d.connectivity = 'OFFLINE'; });
    reading('k-hvac', 0, 'COOLING', 1); every5('k-temp', 0, 90, () => 76.5);
    reading('b-hvac', 0, 'COOLING', 1); every5('b-temp', 0, 90, (m) => 76 - m * 0.05);
    await service.evaluateEquipment('hvac-01', home, at(90));
    expect(evaluationOf('HVAC-COMFORT-001', 'device:k-temp')).toMatchObject({ outcome: RuleEvaluationOutcome.INSUFFICIENT_DATA, reason: 'Thermostat is offline' });
    expect(evaluationOf('HVAC-COMFORT-001', 'device:b-temp')).toMatchObject({ outcome: RuleEvaluationOutcome.CLEAR });
    expect(activeFindings('HVAC-COMFORT-001')).toHaveLength(0);
  });

  it('5. suction-line anomaly during stable cooling against the learned baseline → finding; quiet off-cycle leaves it alone', async () => {
    registry.rows.push({ id: 'suction', homeId: 'home-1', provider: 'yolink', providerDeviceId: 'eui-suction', currentProviderName: 'ATV HVAC Suction Line Temp' });
    assignments.rows.push({ deviceRegistryId: 'suction', equipmentId: 'hvac-01', sensorRole: SensorRole.HVAC_SUCTION_LINE_TEMP });
    for (let c = 0; c < 4; c++) for (let i = 0; i < 6; i++) {
      samples.push({ equipmentId: 'hvac-01', metricKey: 'SUCTION_LINE_STABLE_COOLING_F', value: 48, observedAt: at(-2000 + c * 300 + i * 3), context: { band: '90s', cycleStart: `c${c}`, anomalous: false } });
    }
    reading('k-hvac', 0, 'COOLING', 1); every5('k-temp', 0, 40, (m) => 75 - m * 0.05);
    for (let m = 0; m <= 40; m += 3) reading('suction', m, String(m < 12 ? 66 : 60.5), m < 12 ? 66 : 60.5);

    await service.evaluateEquipment('hvac-01', home, at(40));
    const suction = activeFindings('HVAC-REFRIGERANT-001');
    expect(suction).toHaveLength(1);
    expect(suction[0].message).toMatch(/suction-line temperature differs from the system's normal pattern/);
    expect(suction[0].message).not.toMatch(/refrigerant (charge|leak)|compressor/i);

    reading('k-hvac', 45, 'OFF', 0);
    await service.evaluateEquipment('hvac-01', home, at(60));
    expect(activeFindings('HVAC-REFRIGERANT-001')).toHaveLength(1); // not resolved on a non-observation
  });
});
