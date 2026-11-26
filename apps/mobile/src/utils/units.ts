// What a priced service counts, in plain words ("ladder" / "ladders").
// The API resolves these per service (unitOne / unitMany / billedByTheHour,
// see PricingService.withDisplay); the fallbacks cover an older server or
// a service missing from the loaded catalog.
export type UnitInfo = { one: string; many: string; hourly: boolean };

const FALLBACK: Record<string, [string, string]> = {
  HOUR: ['hour', 'hours'],
  SQ_FT: ['sq ft', 'sq ft'],
  LINEAR_FEET: ['foot', 'feet'],
};

export function describeUnit(item: any): UnitInfo {
  const code: string = item?.quantityLabel ?? '';
  const hourly = item?.billedByTheHour ?? (item?.pricingMethod === 'PER_UNIT' && code === 'HOUR');
  if (item?.unitOne) return { one: item.unitOne, many: item.unitMany || `${item.unitOne}s`, hourly };
  if (FALLBACK[code]) return { one: FALLBACK[code][0], many: FALLBACK[code][1], hourly };
  const one = code && code !== 'NONE' ? code.toLowerCase().replace(/_/g, ' ') : 'item';
  return { one, many: `${one}s`, hourly };
}

// "1 ladder", "3 ladders", "1.5 hours".
export function countOf(qty: number, unit: UnitInfo): string {
  const n = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 10) / 10);
  return `${n} ${qty === 1 ? unit.one : unit.many}`;
}
