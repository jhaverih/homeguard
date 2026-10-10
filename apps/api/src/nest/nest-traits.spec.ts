import { TRAIT, describeSetpoint, mergeTraits, readingsFor, sdmDeviceId, thermostatIdentity } from './nest-traits';

const fullTraits = {
  [TRAIT.INFO]: { customName: '' },
  [TRAIT.TEMPERATURE]: { ambientTemperatureCelsius: 22.5 },
  [TRAIT.HUMIDITY]: { ambientHumidityPercent: 48 },
  [TRAIT.HVAC]: { status: 'COOLING' },
  [TRAIT.MODE]: { mode: 'COOL', availableModes: ['HEAT', 'COOL', 'HEATCOOL', 'OFF'] },
  [TRAIT.ECO]: { mode: 'OFF', heatCelsius: 15, coolCelsius: 28 },
  [TRAIT.SETPOINT]: { coolCelsius: 22.2 },
};

describe('nest-traits', () => {
  it('identifies a thermostat by its Google Home room when it has no custom name', () => {
    const id = thermostatIdentity({
      name: 'enterprises/p/devices/abc', type: 'sdm.devices.types.THERMOSTAT', traits: fullTraits,
      parentRelations: [{ parent: 'enterprises/p/structures/s/rooms/r', displayName: '2nd Floor' }],
    });
    expect(id).toEqual({ displayName: '2nd Floor Thermostat', roomName: '2nd Floor' });
    expect(sdmDeviceId('enterprises/p/devices/abc')).toBe('abc');
  });

  it('produces temperature (°F), humidity, HVAC call and setpoint readings from a full trait set', () => {
    const readings = readingsFor({}, fullTraits);
    expect(readings).toEqual([
      { kind: 'temperature', value: '72.5', numericValue: 72.5, unit: '°F' },
      { kind: 'humidity', value: '48', numericValue: 48, unit: '%' },
      { kind: 'hvac', value: 'COOLING', numericValue: 1, unit: null },
      { kind: 'setpoint', value: 'COOL 72°F', numericValue: 72, unit: '°F' },
    ]);
  });

  it('does not repeat an unchanged HVAC status or setpoint on a re-poll, but always records temperature', () => {
    const readings = readingsFor(fullTraits, fullTraits);
    expect(readings.map((r) => r.kind)).toEqual(['temperature', 'humidity']);
  });

  it('records the HEATING/COOLING → OFF transition from a partial Pub/Sub update', () => {
    const readings = readingsFor(fullTraits, { [TRAIT.HVAC]: { status: 'OFF' } });
    expect(readings).toEqual([{ kind: 'hvac', value: 'OFF', numericValue: 0, unit: null }]);
  });

  it('merges partial updates field-by-field', () => {
    const merged = mergeTraits(fullTraits, { [TRAIT.ECO]: { mode: 'MANUAL_ECO' } });
    expect(merged[TRAIT.ECO]).toEqual({ mode: 'MANUAL_ECO', heatCelsius: 15, coolCelsius: 28 });
    expect(merged[TRAIT.TEMPERATURE]).toEqual(fullTraits[TRAIT.TEMPERATURE]);
  });

  it('describes eco, heat/cool range and off setpoints', () => {
    expect(describeSetpoint(mergeTraits(fullTraits, { [TRAIT.ECO]: { mode: 'MANUAL_ECO' } }))).toEqual({ value: 'ECO 59–82.4°F', numericValue: 82.4 });
    const range = mergeTraits(fullTraits, { [TRAIT.MODE]: { mode: 'HEATCOOL' }, [TRAIT.SETPOINT]: { heatCelsius: 20, coolCelsius: 24 }, [TRAIT.HVAC]: { status: 'OFF' } });
    expect(describeSetpoint(range)).toEqual({ value: 'HEATCOOL 68–75.2°F', numericValue: null });
    expect(describeSetpoint(mergeTraits(range, { [TRAIT.HVAC]: { status: 'HEATING' } }))?.numericValue).toBe(68);
    expect(describeSetpoint(mergeTraits(fullTraits, { [TRAIT.MODE]: { mode: 'OFF' } }))).toEqual({ value: 'OFF', numericValue: null });
  });
});
