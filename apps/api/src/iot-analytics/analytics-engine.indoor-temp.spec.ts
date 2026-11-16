import { FindOperator } from 'typeorm';
import { AnalyticsEngineService } from './analytics-engine.service';
import { FindingStatus } from './entities/analytics-finding.entity';
import { SensorRole } from '../common/enums/sensor-role.enum';

// In-memory findings repo that understands the two FindOperators the
// engine uses here (Not(IsNull()) on linkedAlertId).
function fakeFindingsRepo() {
  const rows: any[] = [];
  const matches = (row: any, where: Record<string, any>) => Object.entries(where).every(([k, v]) => {
    if (v instanceof FindOperator) {
      // `.value` unwraps nested operators, so read the raw inner one.
      const inner = (v as any)._value;
      if (v.type === 'not' && inner instanceof FindOperator && inner.type === 'isNull') return row[k] != null;
      throw new Error(`unsupported operator ${v.type}`);
    }
    return row[k] === v;
  });
  const sorted = (list: any[], order?: Record<string, 'ASC' | 'DESC'>) => {
    if (!order?.detectedAt) return list;
    const dir = order.detectedAt === 'ASC' ? 1 : -1;
    return [...list].sort((a, b) => dir * (a.detectedAt.getTime() - b.detectedAt.getTime()));
  };
  let seq = 0;
  return {
    rows,
    findOne: jest.fn(async ({ where, order }: any) => sorted(rows.filter((r) => matches(r, where)), order)[0] ?? null),
    find: jest.fn(async ({ where, order }: any) => sorted(rows.filter((r) => matches(r, where)), order)),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      if (!data.id) { data.id = `finding-${++seq}`; data.status = data.status ?? FindingStatus.ACTIVE; rows.push(data); }
      return data;
    }),
  };
}

const home: any = { id: 'yl-home-1', customerId: 'cust-1' };
const assignment: any = { sensorRole: SensorRole.INDOOR_AMBIENT_TEMP, equipmentId: null };
const device = (id: string, provider: string, room: string | null): any => ({
  id, provider, providerDeviceId: `${id}-pid`, providerDeviceType: null, currentProviderName: room ? `${room} Thermostat` : 'ATV Indoor Temperature', currentProviderRoom: room,
});
const firstFloor = device('nest-1', 'nest', '1st Floor');
const secondFloor = device('nest-2', 'nest', '2nd Floor');
const yolinkIndoor = device('yl-1', 'yolink', null);

describe('AnalyticsEngineService INDOOR-TEMP-001 grouping', () => {
  let findingsRepo: ReturnType<typeof fakeFindingsRepo>;
  let alertsService: { createAlert: jest.Mock; updateMessage: jest.Mock };
  let engine: AnalyticsEngineService;
  let alertSeq: number;
  let clock: number;

  beforeEach(() => {
    findingsRepo = fakeFindingsRepo();
    alertSeq = 0;
    alertsService = { createAlert: jest.fn(async () => ({ id: `alert-${++alertSeq}` })), updateMessage: jest.fn(async () => {}) };
    const thresholds: any = { getValue: jest.fn(async (key: string) => (key === 'INDOOR_TEMP_LOW_F' ? 41 : 95)) };
    const equipmentRepo: any = { findOne: jest.fn(async () => null) };
    engine = new AnalyticsEngineService(findingsRepo as any, equipmentRepo, alertsService as any, thresholds, { canNotify: jest.fn(async () => true) } as any, { recheckCombinedFindings: jest.fn() } as any);
    clock = Date.UTC(2026, 9, 10, 12, 0);
    jest.useFakeTimers({ now: clock, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  const advance = (min: number) => { clock += min * 60000; jest.setSystemTime(clock); };

  it('sends one alert naming the first sensor, then folds later sensors into it without re-notifying', async () => {
    await engine.evaluateIndoorTempEvent(secondFloor, assignment, home, 96);
    expect(alertsService.createAlert).toHaveBeenCalledTimes(1);
    expect(alertsService.createAlert.mock.calls[0][0].message).toBe('High indoor temperature at 2nd Floor thermostat: 96°F (threshold 95°F)');

    advance(2);
    await engine.evaluateIndoorTempEvent(yolinkIndoor, assignment, home, 97);
    expect(alertsService.createAlert).toHaveBeenCalledTimes(1);
    expect(alertsService.updateMessage).toHaveBeenLastCalledWith('alert-1',
      'High indoor temperature at 2 sensors: 2nd Floor thermostat 96°F, Indoor sensor 97°F (threshold 95°F)');
    expect(findingsRepo.rows.map((f) => f.linkedAlertId)).toEqual(['alert-1', 'alert-1']);

    // A normal reading from a sensor that isn't in alarm changes nothing.
    await engine.evaluateIndoorTempEvent(firstFloor, assignment, home, 72);
    expect(alertsService.updateMessage).toHaveBeenCalledTimes(1);

    // 2nd floor recovers — the alert now lists only what's still in alarm.
    advance(5);
    await engine.evaluateIndoorTempEvent(secondFloor, assignment, home, 80);
    expect(alertsService.updateMessage).toHaveBeenLastCalledWith('alert-1', 'High indoor temperature at Indoor sensor: 97°F (threshold 95°F)');
  });

  it('serializes simultaneous reports so two sensors tripping at once still send only one alert', async () => {
    await Promise.all([
      engine.evaluateIndoorTempEvent(firstFloor, assignment, home, 40),
      engine.evaluateIndoorTempEvent(secondFloor, assignment, home, 39),
    ]);
    expect(alertsService.createAlert).toHaveBeenCalledTimes(1);
    expect(alertsService.updateMessage).toHaveBeenLastCalledWith('alert-1',
      'Low indoor temperature at 2 sensors: 1st Floor thermostat 40°F, 2nd Floor thermostat 39°F (threshold 41°F)');
  });

  it('re-alerts a grouped alarm as a single reminder listing every sensor', async () => {
    await engine.evaluateIndoorTempEvent(firstFloor, assignment, home, 96);
    advance(1);
    await engine.evaluateIndoorTempEvent(secondFloor, assignment, home, 98);
    advance(31);
    await engine.reAlertActiveFindings();

    expect(alertsService.createAlert).toHaveBeenCalledTimes(2);
    expect(alertsService.createAlert.mock.calls[1][0].message).toBe(
      'Still active: High indoor temperature at 2 sensors: 1st Floor thermostat 96°F, 2nd Floor thermostat 98°F (threshold 95°F)');
    expect(findingsRepo.rows.every((f) => f.linkedAlertId === 'alert-2')).toBe(true);
  });
});

describe('AnalyticsEngineService SENSOR-005 (Nest integration failure)', () => {
  it('11. raises one dashboard finding on failure, never duplicates it, and resolves on recovery', async () => {
    const findingsRepo = fakeFindingsRepo();
    const alertsService = { createAlert: jest.fn(), updateMessage: jest.fn() };
    const engine = new AnalyticsEngineService(findingsRepo as any, { findOne: jest.fn() } as any, alertsService as any, { getValue: jest.fn() } as any, { canNotify: jest.fn(async () => true) } as any, { recheckCombinedFindings: jest.fn() } as any);
    await engine.evaluateIntegrationFailure(home, 'nest', 'Google access was revoked or expired — reconnect Nest');
    await engine.evaluateIntegrationFailure(home, 'nest', 'Google access was revoked or expired — reconnect Nest');
    expect(findingsRepo.rows).toHaveLength(1);
    expect(findingsRepo.rows[0]).toMatchObject({ ruleId: 'SENSOR-005', status: FindingStatus.ACTIVE, message: 'Thermostat data is unavailable, so some performance analytics are temporarily limited.' });
    expect(alertsService.createAlert).not.toHaveBeenCalled();
    await engine.evaluateIntegrationFailure(home, 'nest', null);
    expect(findingsRepo.rows[0].status).toBe(FindingStatus.RESOLVED);
  });
});

describe('AnalyticsEngineService reminders', () => {
  const HOUR = 3600_000;
  const make = (canNotify = true) => {
    const findingsRepo = fakeFindingsRepo();
    const alertsService = { createAlert: jest.fn(async () => ({ id: 'alert-new' })), updateMessage: jest.fn() };
    const access = { canNotify: jest.fn(async () => canNotify) };
    const performance = { recheckCombinedFindings: jest.fn() };
    const engine = new AnalyticsEngineService(findingsRepo as any, {} as any, alertsService as any, {} as any, access as any, performance as any);
    const combined: any = {
      id: 'f-combined', customerId: 'cust-1', yolinkHomeId: 'yl-home-1', equipmentId: 'hvac-01', deviceRegistryId: null, ruleId: 'HVAC-COMBINED-002', ruleGroup: 'HVAC_COMBINED',
      severity: 'HIGH', status: FindingStatus.ACTIVE, linkedAlertId: 'alert-1', message: 'm', measurements: {},
      detectedAt: new Date(Date.now() - 48 * HOUR), lastAlertedAt: new Date(Date.now() - 12 * HOUR), snoozedUntil: null,
    };
    findingsRepo.rows.push(combined);
    return { engine, alertsService, performance, combined };
  };

  it('reminds while the condition is still active', async () => {
    const { engine, alertsService, performance } = make();
    await engine.reAlertActiveFindings();
    expect(performance.recheckCombinedFindings).toHaveBeenCalledWith('hvac-01');
    expect(alertsService.createAlert).toHaveBeenCalledTimes(1);
  });

  it('sends nothing once a re-check finds the combined condition cleared', async () => {
    const { engine, alertsService, performance, combined } = make();
    performance.recheckCombinedFindings.mockImplementation(async () => { combined.status = FindingStatus.RESOLVED; });
    await engine.reAlertActiveFindings();
    expect(alertsService.createAlert).not.toHaveBeenCalled();
  });

  it('sends nothing for a rule the plan does not include', async () => {
    const { engine, alertsService } = make(false);
    await engine.reAlertActiveFindings();
    expect(alertsService.createAlert).not.toHaveBeenCalled();
  });
});
