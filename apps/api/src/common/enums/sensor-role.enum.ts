// Physical role a tagged Yolink sensor plays, per the Attenteve Analytics
// tagging spec (device Room / Equipment / Sensor Role / Analytics Role).
// Keyed off YolinkDevice.deviceId (Yolink's own device EUI, immutable) —
// never re-derived from the device's own (customer-editable) Yolink name.
// Extensible: add new roles here as new sensor types get tagged; nothing
// switches on this exhaustively.
export enum SensorRole {
  DRAIN_WATER = 'DRAIN_WATER',
  AMBIENT_TEMP = 'AMBIENT_TEMP',
  RETURN_TEMP = 'RETURN_TEMP',
  SUPPLY_TEMP = 'SUPPLY_TEMP',
  OUTDOOR_TEMP = 'OUTDOOR_TEMP',
  OUTDOOR_HUMIDITY = 'OUTDOOR_HUMIDITY',
  INDOOR_HUMIDITY = 'INDOOR_HUMIDITY',
}

// Friendly labels for the installer-facing tagging UI — an installer picks
// "Drain / Water Leak", never types or sees the raw enum code.
export const SENSOR_ROLE_META: Record<SensorRole, { label: string }> = {
  [SensorRole.DRAIN_WATER]: { label: 'Drain / Water Leak' },
  [SensorRole.AMBIENT_TEMP]: { label: 'Ambient (Indoor) Temperature' },
  [SensorRole.RETURN_TEMP]: { label: 'Return Air Temperature' },
  [SensorRole.SUPPLY_TEMP]: { label: 'Supply Air Temperature' },
  [SensorRole.OUTDOOR_TEMP]: { label: 'Outdoor Temperature' },
  [SensorRole.OUTDOOR_HUMIDITY]: { label: 'Outdoor Humidity' },
  [SensorRole.INDOOR_HUMIDITY]: { label: 'Indoor Humidity' },
};
