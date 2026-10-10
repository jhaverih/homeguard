// Pure translation of Google Smart Device Management (SDM) thermostat traits
// into Attenteve readings — the "Provider Adapter" normalization step for
// Nest, the counterpart of YolinkService's celsiusToFahrenheit/leak-state
// handling. Nothing downstream (TelemetryService, the analytics engines)
// knows anything SDM-shaped.
// Trait reference: https://developers.google.com/nest/device-access/api/thermostat

export const TRAIT = {
  INFO: 'sdm.devices.traits.Info',
  CONNECTIVITY: 'sdm.devices.traits.Connectivity',
  TEMPERATURE: 'sdm.devices.traits.Temperature',
  HUMIDITY: 'sdm.devices.traits.Humidity',
  HVAC: 'sdm.devices.traits.ThermostatHvac',
  MODE: 'sdm.devices.traits.ThermostatMode',
  ECO: 'sdm.devices.traits.ThermostatEco',
  SETPOINT: 'sdm.devices.traits.ThermostatTemperatureSetpoint',
} as const;

export const THERMOSTAT_TYPE = 'sdm.devices.types.THERMOSTAT';

export type NestTraits = Record<string, Record<string, any>>;

export interface SdmDevice {
  name: string;
  type: string;
  traits?: NestTraits;
  parentRelations?: { parent: string; displayName?: string }[];
}

export type NestReadingKind = 'temperature' | 'humidity' | 'hvac' | 'setpoint';

export interface NestReading {
  kind: NestReadingKind;
  value: string;
  numericValue: number | null;
  unit: string | null;
}

export const celsiusToFahrenheit = (c: number): number => Math.round((c * 9 / 5 + 32) * 10) / 10;

export function isThermostat(device: SdmDevice): boolean {
  return device.type === THERMOSTAT_TYPE;
}

// "enterprises/<project>/devices/<id>" → "<id>"
export function sdmDeviceId(name: string): string {
  return name.split('/').pop() ?? name;
}

// The homeowner's own label for the thermostat (Info.customName, often left
// blank) and the Google Home room it's in — the room is what distinguishes
// a 1st-floor zone from a 2nd-floor one.
export function thermostatIdentity(device: SdmDevice): { displayName: string; roomName: string | null } {
  const roomName = device.parentRelations?.find((p) => p.displayName?.trim())?.displayName?.trim() ?? null;
  const customName = device.traits?.[TRAIT.INFO]?.customName?.trim();
  return { displayName: customName || (roomName ? `${roomName} Thermostat` : 'Nest Thermostat'), roomName };
}

// Pub/Sub events carry only the traits (and fields) that changed.
export function mergeTraits(prev: NestTraits, update: NestTraits): NestTraits {
  const merged: NestTraits = { ...prev };
  for (const [trait, fields] of Object.entries(update ?? {})) merged[trait] = { ...(prev?.[trait] ?? {}), ...fields };
  return merged;
}

// HEATING/COOLING are a call for conditioning (the system is running);
// OFF is idle — the mode can be HEAT while status is OFF between cycles.
export function hvacStatus(traits: NestTraits): 'HEATING' | 'COOLING' | 'OFF' | null {
  const status = traits?.[TRAIT.HVAC]?.status;
  return status === 'HEATING' || status === 'COOLING' || status === 'OFF' ? status : null;
}

// One active-setpoint reading from mode + eco + setpoint traits. Eco
// overrides the regular setpoints while on. numericValue is the setpoint the
// system is working toward right now — for a heat/cool range that depends
// on which way it's currently running, and is null when idle in a range.
export function describeSetpoint(traits: NestTraits): { value: string; numericValue: number | null } | null {
  const mode = traits?.[TRAIT.MODE]?.mode;
  if (!mode) return null;
  const status = hvacStatus(traits);
  const eco = traits?.[TRAIT.ECO];
  const sp = eco?.mode === 'MANUAL_ECO' ? eco : traits?.[TRAIT.SETPOINT];
  const heat = typeof sp?.heatCelsius === 'number' ? celsiusToFahrenheit(sp.heatCelsius) : null;
  const cool = typeof sp?.coolCelsius === 'number' ? celsiusToFahrenheit(sp.coolCelsius) : null;
  const prefix = eco?.mode === 'MANUAL_ECO' ? 'ECO' : mode;

  if (mode === 'OFF' && eco?.mode !== 'MANUAL_ECO') return { value: 'OFF', numericValue: null };
  if (heat != null && cool != null) {
    const active = status === 'COOLING' ? cool : status === 'HEATING' ? heat : null;
    return { value: `${prefix} ${heat}–${cool}°F`, numericValue: active };
  }
  if (heat != null) return { value: `${prefix} ${heat}°F`, numericValue: heat };
  if (cool != null) return { value: `${prefix} ${cool}°F`, numericValue: cool };
  return { value: prefix, numericValue: null };
}

const touches = (update: NestTraits, ...traits: string[]) => traits.some((t) => update?.[t] != null);

// Readings an update produces, given the thermostat's state before it.
// Temperature/humidity are recorded whenever reported (a time series);
// HVAC status and setpoint only when they actually change, since a run
// cycle is derived from HVAC status transitions and a poll re-reports the
// full, mostly unchanged trait set every 5 minutes.
export function readingsFor(prev: NestTraits, update: NestTraits): NestReading[] {
  const merged = mergeTraits(prev, update);
  const readings: NestReading[] = [];

  const tempC = update?.[TRAIT.TEMPERATURE]?.ambientTemperatureCelsius;
  if (typeof tempC === 'number') {
    const f = celsiusToFahrenheit(tempC);
    readings.push({ kind: 'temperature', value: String(f), numericValue: f, unit: '°F' });
  }

  const humidity = update?.[TRAIT.HUMIDITY]?.ambientHumidityPercent;
  if (typeof humidity === 'number') readings.push({ kind: 'humidity', value: String(humidity), numericValue: humidity, unit: '%' });

  const status = hvacStatus(merged);
  if (touches(update, TRAIT.HVAC) && status && status !== hvacStatus(prev)) {
    readings.push({ kind: 'hvac', value: status, numericValue: status === 'OFF' ? 0 : 1, unit: null });
  }

  if (touches(update, TRAIT.MODE, TRAIT.ECO, TRAIT.SETPOINT, TRAIT.HVAC)) {
    const now = describeSetpoint(merged);
    const before = describeSetpoint(prev);
    if (now && (now.value !== before?.value || now.numericValue !== before?.numericValue)) {
      readings.push({ kind: 'setpoint', value: now.value, numericValue: now.numericValue, unit: '°F' });
    }
  }
  return readings;
}
