import { NestService, CHANNEL_SPECS } from './nest.service';
import { TRAIT } from './nest-traits';
import { SensorRole } from '../common/enums/sensor-role.enum';

function repo<T extends { id?: string }>(rows: T[]) {
  const match = (r: any, where: any) => Object.entries(where).every(([k, v]) => r[k] === v);
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => match(r, where)) ?? null),
    find: jest.fn(async ({ where }: any = {}) => rows.filter((r) => !where || match(r, where))),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => { if (!rows.includes(d)) rows.push(d); return d; }),
  };
}

describe('NestService event ingestion', () => {
  const account: any = { id: 'acct-1', customerId: 'cust-1', homeId: 'home-1', isActive: true, refreshToken: 'x' };
  const yolinkHome: any = { id: 'yl-1', customerId: 'cust-1', isActive: true };
  let thermostat: any;
  let service: NestService;
  let registry: any;
  let telemetry: any;
  let analytics: any;
  let performance: any;

  beforeEach(() => {
    thermostat = {
      id: 'th-1', nestAccountId: 'acct-1', sdmDeviceName: 'enterprises/p/devices/dev1', sdmDeviceId: 'dev1',
      displayName: '2nd Floor Thermostat', roomName: '2nd Floor',
      traits: { [TRAIT.HVAC]: { status: 'OFF' }, [TRAIT.MODE]: { mode: 'COOL' }, [TRAIT.SETPOINT]: { coolCelsius: 22.2 } },
    };
    const devices = new Map<string, any>();
    registry = {
      upsertFromProvider: jest.fn(async (homeId: string, provider: string, providerDeviceId: string, meta: any, spec: any) => {
        const d = devices.get(providerDeviceId) ?? { id: `reg-${providerDeviceId}`, homeId, provider, providerDeviceId, currentProviderName: meta.name, currentProviderRoom: meta.room, spec };
        devices.set(providerDeviceId, d);
        return d;
      }),
      getDeviceAndAssignment: jest.fn(async (id: string) => {
        const d = [...devices.values()].find((x) => x.id === id);
        return d ? { device: d, assignment: { sensorRole: d.spec.sensorRole, equipmentId: 'eq' } } : null;
      }),
    };
    telemetry = { record: jest.fn(async () => ({})) };
    analytics = { evaluateIndoorTempEvent: jest.fn(async () => {}) };
    performance = { handleHumidityReading: jest.fn(async () => {}), handleHvacStateReading: jest.fn(async () => {}), handleSetpointReading: jest.fn(async () => {}) };
    service = new NestService(
      repo([account]) as any, repo([thermostat]) as any, repo([yolinkHome]) as any,
      { get: () => 'secret' } as any, registry, telemetry, analytics, performance, {} as any,
    );
  });

  const event = (traits: any) => ({ timestamp: '2026-10-10T12:00:00Z', resourceUpdate: { name: 'enterprises/p/devices/dev1', traits } });

  it('routes each trait to its own registry device, fixed role, telemetry and analytics', async () => {
    await service.handleEvent(event({
      [TRAIT.TEMPERATURE]: { ambientTemperatureCelsius: 35.6 },
      [TRAIT.HUMIDITY]: { ambientHumidityPercent: 61 },
      [TRAIT.HVAC]: { status: 'COOLING' },
    }));

    expect(registry.upsertFromProvider.mock.calls.map((c: any[]) => [c[1], c[2], c[4].sensorRole])).toEqual([
      ['nest', 'dev1:temperature', SensorRole.INDOOR_AMBIENT_TEMP],
      ['nest', 'dev1:humidity', SensorRole.INDOOR_AMBIENT_HUMIDITY],
      ['nest', 'dev1:hvac', SensorRole.HVAC_STATE],
    ]); // no setpoint reading: COOL 72°F is unchanged by the system starting to cool
    expect(registry.upsertFromProvider.mock.calls[0][3]).toEqual({ deviceType: 'NestThermostat', name: '2nd Floor Thermostat', room: '2nd Floor' });
    expect(analytics.evaluateIndoorTempEvent).toHaveBeenCalledWith(expect.objectContaining({ providerDeviceId: 'dev1:temperature' }), expect.anything(), yolinkHome, 96.1);
    expect(performance.handleHumidityReading).toHaveBeenCalledWith(expect.anything(), expect.anything(), yolinkHome, 61, new Date('2026-10-10T12:00:00Z'));
    expect(performance.handleHvacStateReading).toHaveBeenCalledTimes(1);
    expect(telemetry.record.mock.calls.find((c: any[]) => c[0].providerDeviceId === 'dev1:hvac').slice(2, 4)).toEqual(['COOLING', 1]);
    expect(thermostat.traits[TRAIT.HVAC].status).toBe('COOLING');
  });

  it('records an HVAC call only on change, so a repeated status does not split a run cycle', async () => {
    await service.handleEvent(event({ [TRAIT.HVAC]: { status: 'COOLING' } }));
    await service.handleEvent(event({ [TRAIT.HVAC]: { status: 'COOLING' } }));
    await service.handleEvent(event({ [TRAIT.HVAC]: { status: 'OFF' } }));
    const hvac = telemetry.record.mock.calls.filter((c: any[]) => c[0].providerDeviceId === 'dev1:hvac').map((c: any[]) => c[2]);
    expect(hvac).toEqual(['COOLING', 'OFF']);
  });

  it('records a setpoint change', async () => {
    await service.handleEvent(event({ [TRAIT.SETPOINT]: { coolCelsius: 23.3 } }));
    const call = telemetry.record.mock.calls.find((c: any[]) => c[0].providerDeviceId === 'dev1:setpoint');
    expect(call.slice(2, 4)).toEqual(['COOL 73.9°F', 73.9]);
    expect(performance.handleSetpointReading).toHaveBeenCalledWith(expect.anything(), expect.anything(), yolinkHome, 73.9, expect.any(Date));
  });

  it('ignores events for devices it does not track', async () => {
    await service.handleEvent({ resourceUpdate: { name: 'enterprises/p/devices/camera', traits: {} } });
    await service.handleEvent(null);
    expect(registry.upsertFromProvider).not.toHaveBeenCalled();
  });

  it('puts every thermostat channel except indoor temperature on the shared HVAC-01 equipment', () => {
    expect(CHANNEL_SPECS.temperature.equipmentType).toBe('HOME');
    for (const kind of ['humidity', 'hvac', 'setpoint'] as const) {
      expect(CHANNEL_SPECS[kind]).toMatchObject({ equipmentType: 'HVAC', equipmentNumber: '01' });
    }
  });
});
