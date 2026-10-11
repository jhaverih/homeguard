// Data validation/preprocessing ahead of anomaly detection (spec §4.2).
// Input is VALID telemetry (implausible values are already quarantined at
// ingest as dataQuality=INVALID by TelemetryService.qualityOf). Pure.

export interface Reading { t: Date; v: number; receivedAt?: Date }

// Rates use at least this interval: two reports seconds apart (a Pub/Sub
// event and a poll of the same reading) would otherwise turn a 0.5° step
// into "28°/min". About the sensors' real reporting resolution.
export const MIN_RATE_INTERVAL_MINUTES = 1;

export interface Segment { start: Date; end: Date; points: Reading[] }

export interface Preprocessed {
  points: Reading[];          // sorted by observation time, duplicates removed
  segments: Segment[];        // split wherever a gap exceeds maxGapMinutes
  duplicates: number;
  outOfOrder: number;         // arrived (receivedAt) out of observation order
  gaps: { from: Date; to: Date; minutes: number }[];
  // Consecutive in-segment changes faster than physically plausible for the
  // sensor — a sensor/communication problem, not an HVAC condition.
  implausibleRates: { t: Date; ratePerMin: number }[];
  latestAt: Date | null;
}

export function preprocess(readings: Reading[], cfg: { maxGapMinutes: number; maxRatePerMinute: number }): Preprocessed {
  // Out-of-order arrival: an observation older than one already received.
  let outOfOrder = 0;
  const byArrival = [...readings].filter((r) => r.receivedAt).sort((a, b) => a.receivedAt!.getTime() - b.receivedAt!.getTime());
  let maxSeen = -Infinity;
  for (const r of byArrival) {
    if (r.t.getTime() < maxSeen) outOfOrder++;
    maxSeen = Math.max(maxSeen, r.t.getTime());
  }

  const sorted = [...readings].sort((a, b) => a.t.getTime() - b.t.getTime());
  const points: Reading[] = [];
  let duplicates = 0;
  for (const r of sorted) {
    const prev = points[points.length - 1];
    // Same instant twice (e.g. a Pub/Sub event and a poll of one reading).
    if (prev && prev.t.getTime() === r.t.getTime()) { duplicates++; continue; }
    points.push(r);
  }

  const segments: Segment[] = [];
  const gaps: Preprocessed['gaps'] = [];
  const implausibleRates: Preprocessed['implausibleRates'] = [];
  let current: Reading[] = [];
  for (const p of points) {
    const prev = current[current.length - 1];
    if (prev) {
      const minutes = (p.t.getTime() - prev.t.getTime()) / 60_000;
      if (minutes > cfg.maxGapMinutes) {
        gaps.push({ from: prev.t, to: p.t, minutes: Math.round(minutes) });
        segments.push({ start: current[0].t, end: prev.t, points: current });
        current = [];
      } else if (minutes > 0 && Math.abs(p.v - prev.v) / Math.max(minutes, MIN_RATE_INTERVAL_MINUTES) > cfg.maxRatePerMinute) {
        implausibleRates.push({ t: p.t, ratePerMin: Math.round(((p.v - prev.v) / Math.max(minutes, MIN_RATE_INTERVAL_MINUTES)) * 100) / 100 });
      }
    }
    current.push(p);
  }
  if (current.length) segments.push({ start: current[0].t, end: current[current.length - 1].t, points: current });
  return { points, segments, duplicates, outOfOrder, gaps, implausibleRates, latestAt: points[points.length - 1]?.t ?? null };
}

// Per-minute rates between consecutive readings, within segments only —
// never across a gap, so a reconnect after an outage isn't a "jump".
export function segmentRates(segments: Segment[]): { t: Date; v: number; delta: number }[] {
  const out: { t: Date; v: number; delta: number }[] = [];
  for (const s of segments) {
    for (let i = 1; i < s.points.length; i++) {
      const minutes = (s.points[i].t.getTime() - s.points[i - 1].t.getTime()) / 60_000;
      const delta = s.points[i].v - s.points[i - 1].v;
      if (minutes > 0) out.push({ t: s.points[i].t, v: delta / Math.max(minutes, MIN_RATE_INTERVAL_MINUTES), delta });
    }
  }
  return out;
}
