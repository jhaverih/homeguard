import { DeviceRegistry } from './entities/device-registry.entity';

// INDOOR-TEMP-001 groups every indoor temperature sensor in a home into ONE
// alert: a home can have a YoLink indoor sensor plus one Nest thermostat per
// zone (e.g. 1st and 2nd floor), and a whole-house hot/cold event trips all
// of them at once. Each sensor still keeps its own AnalyticsFinding (so it
// clears independently), but they share the first one's linkedAlertId, and
// the alert text lists every sensor currently in alarm.

export type IndoorTempKind = 'low' | 'high';

export interface IndoorTempReading {
  sensorLabel: string;
  temperature: number;
  kind: IndoorTempKind;
  threshold: number;
}

// Homeowner-facing location label. A Nest thermostat is identified by the
// room the homeowner assigned it in the Google Home app ("1st Floor",
// "Upstairs") since that's what distinguishes zones; any other indoor sensor
// is just "Indoor sensor" — never the installer's ATV-convention name.
export function indoorSensorLabel(device: Pick<DeviceRegistry, 'provider' | 'currentProviderRoom' | 'currentProviderName'>): string {
  if (device.provider === 'nest') {
    const where = device.currentProviderRoom?.trim() || device.currentProviderName?.trim();
    if (!where) return 'Nest thermostat';
    return /thermostat/i.test(where) ? where : `${where} thermostat`;
  }
  return 'Indoor sensor';
}

// Findings recorded before grouping existed carry no threshold — omit it
// rather than print "NaN".
const thresholdNote = (threshold: number) => (Number.isFinite(threshold) ? ` (threshold ${threshold}°F)` : '');

export function indoorTempAlertMessage(readings: IndoorTempReading[]): string {
  if (readings.length === 0) return 'Indoor temperature back in range';
  if (readings.length === 1) {
    const r = readings[0];
    return `${r.kind === 'low' ? 'Low' : 'High'} indoor temperature at ${r.sensorLabel}: ${r.temperature}°F${thresholdNote(r.threshold)}`;
  }
  const kinds = new Set(readings.map((r) => r.kind));
  if (kinds.size === 1) {
    const [kind] = kinds;
    const threshold = readings.map((r) => r.threshold).find(Number.isFinite) ?? NaN;
    const list = readings.map((r) => `${r.sensorLabel} ${r.temperature}°F`).join(', ');
    return `${kind === 'low' ? 'Low' : 'High'} indoor temperature at ${readings.length} sensors: ${list}${thresholdNote(threshold)}`;
  }
  const list = readings.map((r) => `${r.sensorLabel} ${r.temperature}°F (${r.kind})`).join(', ');
  return `Indoor temperature out of range at ${readings.length} sensors: ${list}`;
}
