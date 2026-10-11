// Robust statistics for HVAC anomaly detection — median/MAD instead of
// mean/stddev so one bad reading can't drag the baseline. Pure.

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Median absolute deviation from the median.
export function mad(values: number[], center = median(values)): number {
  return median(values.map((v) => Math.abs(v - center)));
}

// Measurement-resolution floors for MAD, per unit. A sensor that reports a
// steady 68.0°F for hours has MAD 0, and every 0.1°F step would score as
// infinitely unusual. The floor is roughly the sensor's resolution: Nest and
// YoLink report temperature to ~0.1–0.5°F and humidity to 1%. Used in place
// of MAD whenever MAD is smaller — documented fallback, never ÷0 or ∞.
export const MAD_FLOOR: Record<string, number> = { '°F': 0.3, '%': 1.0, 'min': 1.0, 'perMin': 0.05, default: 0.5 };

export function madFloor(unit: string): number {
  return MAD_FLOOR[unit] ?? MAD_FLOOR.default;
}

// Iglewicz–Hoaglin modified z-score.
export function robustZ(x: number, center: number, deviation: number, floor: number): number {
  return (0.6745 * (x - center)) / Math.max(deviation, floor);
}

export interface Baseline { median: number; mad: number; n: number }

export function baselineOf(values: number[]): Baseline | null {
  if (values.length === 0) return null;
  const m = median(values);
  return { median: m, mad: mad(values, m), n: values.length };
}
