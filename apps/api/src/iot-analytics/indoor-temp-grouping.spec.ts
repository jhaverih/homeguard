import { indoorSensorLabel, indoorTempAlertMessage } from './indoor-temp-grouping';

describe('indoor-temp-grouping', () => {
  it('labels Nest thermostats by room and other indoor sensors generically', () => {
    expect(indoorSensorLabel({ provider: 'nest', currentProviderRoom: '1st Floor', currentProviderName: '1st Floor Thermostat' })).toBe('1st Floor thermostat');
    expect(indoorSensorLabel({ provider: 'nest', currentProviderRoom: null, currentProviderName: 'Hallway Thermostat' })).toBe('Hallway Thermostat');
    expect(indoorSensorLabel({ provider: 'yolink', currentProviderRoom: null, currentProviderName: 'ATV Indoor Temperature' })).toBe('Indoor sensor');
  });

  it('names the single sensor in alarm', () => {
    expect(indoorTempAlertMessage([{ sensorLabel: '2nd Floor thermostat', temperature: 96, kind: 'high', threshold: 95 }]))
      .toBe('High indoor temperature at 2nd Floor thermostat: 96°F (threshold 95°F)');
  });

  it('lists every sensor in alarm in one message', () => {
    expect(indoorTempAlertMessage([
      { sensorLabel: '1st Floor thermostat', temperature: 40, kind: 'low', threshold: 41 },
      { sensorLabel: 'Indoor sensor', temperature: 39.5, kind: 'low', threshold: 41 },
    ])).toBe('Low indoor temperature at 2 sensors: 1st Floor thermostat 40°F, Indoor sensor 39.5°F (threshold 41°F)');
    expect(indoorTempAlertMessage([
      { sensorLabel: '1st Floor thermostat', temperature: 40, kind: 'low', threshold: 41 },
      { sensorLabel: '2nd Floor thermostat', temperature: 96, kind: 'high', threshold: 95 },
    ])).toBe('Indoor temperature out of range at 2 sensors: 1st Floor thermostat 40°F (low), 2nd Floor thermostat 96°F (high)');
  });

  it('omits an unknown threshold from findings recorded before grouping', () => {
    expect(indoorTempAlertMessage([{ sensorLabel: 'Indoor sensor', temperature: 96, kind: 'high', threshold: NaN }]))
      .toBe('High indoor temperature at Indoor sensor: 96°F');
  });
});
