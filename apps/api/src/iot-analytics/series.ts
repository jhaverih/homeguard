// Chart-ready series for the mobile component drill-down. Pure, so the
// bucketing is testable without a database.

export type ChartRange = 'day' | 'week' | 'month';

export const RANGE_HOURS: Record<ChartRange, number> = { day: 24, week: 24 * 7, month: 24 * 30 };
// Day shows every reading; longer ranges are averaged into buckets so a
// phone never has to draw thousands of points.
const BUCKET_MINUTES: Record<ChartRange, number> = { day: 0, week: 60, month: 240 };

export interface Point { t: string; v: number }
export interface Band { from: string; to: string; state: string }

export function bucketPoints(points: { t: Date; v: number }[], range: ChartRange): Point[] {
  const bucketMin = BUCKET_MINUTES[range];
  if (!bucketMin) return points.map((p) => ({ t: p.t.toISOString(), v: p.v }));
  const size = bucketMin * 60_000;
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const key = Math.floor(p.t.getTime() / size) * size;
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += p.v;
    b.n++;
    buckets.set(key, b);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0])
    .map(([key, b]) => ({ t: new Date(key + size / 2).toISOString(), v: Math.round((b.sum / b.n) * 10) / 10 }));
}

// Contiguous periods of a state (e.g. COOLING) from report-on-change
// samples, clipped to [from, to]. The state in effect at `from` comes from
// the last sample before it. Only states in `keep` produce bands.
export function stateBands(samples: { t: Date; state: string }[], from: Date, to: Date, keep: string[]): Band[] {
  const bands: Band[] = [];
  let current: { state: string; since: Date } | null = null;
  for (const s of samples) {
    if (s.t > to) break;
    if (current && current.state === s.state) continue;
    if (current && keep.includes(current.state) && s.t > from) {
      bands.push({ from: new Date(Math.max(current.since.getTime(), from.getTime())).toISOString(), to: s.t.toISOString(), state: current.state });
    }
    current = { state: s.state, since: s.t };
  }
  if (current && keep.includes(current.state)) {
    bands.push({ from: new Date(Math.max(current.since.getTime(), from.getTime())).toISOString(), to: to.toISOString(), state: current.state });
  }
  return bands;
}
