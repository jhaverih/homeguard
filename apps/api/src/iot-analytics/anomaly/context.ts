import { CallSample, SetpointSample, systemCoolingCycles } from '../cooling-analytics';
import { mergeStateRunCycles, RunCycle } from '../run-cycles';
import { outdoorBand } from '../weather.service';

// Operating context for context-aware baselines (spec §4.4). Pure.

// UNKNOWN = no thermostat call-state data covers that moment. Never treated
// as idle: an unknown-mode reading is neither scored nor used as baseline.
export type Mode = 'COOLING' | 'HEATING' | 'IDLE' | 'UNKNOWN';

export interface Ctx { mode: Mode; band: string; cycleBucket: string }

export interface ContextTimeline {
  at(t: Date): Ctx;
  transitions: Date[];          // cycle starts/stops + mode/setpoint changes
  cooling: RunCycle[];
  heating: RunCycle[];
  // Each zone's mode/setpoint in effect at t (null = not known yet).
  setpointsAt(t: Date): (SetpointSample | null)[];
}

const OUTDOOR_MAX_AGE_MS = 3 * 3600_000;

export function buildContextTimeline(callsByZone: CallSample[][], outdoor: { t: Date; v: number }[], setpointChanges: Date[], setpointsByZone: SetpointSample[][] = []): ContextTimeline {
  const cooling = systemCoolingCycles(callsByZone);
  const heating = mergeStateRunCycles(callsByZone
    .flatMap((calls, i) => calls.map((c) => ({ deviceRegistryId: String(i), observedAt: c.t, numericValue: c.call === 'HEATING' ? 1 : 0 })))
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime()));
  const within = (cycles: RunCycle[], t: Date) => cycles.find((c) => c.start <= t && (c.end == null || c.end > t)) ?? null;
  const sortedOutdoor = [...outdoor].sort((a, b) => a.t.getTime() - b.t.getTime());
  const firstCall = Math.min(...callsByZone.flatMap((z) => z.map((c) => c.t.getTime())), Infinity);

  const zones = setpointsByZone.map((z) => [...z].sort((a, b) => a.t.getTime() - b.t.getTime()));
  return {
    cooling, heating,
    setpointsAt(t: Date) {
      return zones.map((z) => { let last: SetpointSample | null = null; for (const s of z) { if (s.t <= t) last = s; else break; } return last; });
    },
    transitions: [...cooling.flatMap((c) => [c.start, c.end]), ...heating.flatMap((c) => [c.start, c.end]), ...setpointChanges]
      .filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime()),
    at(t: Date): Ctx {
      const cool = within(cooling, t);
      const heat = cool ? null : within(heating, t);
      const mode: Mode = t.getTime() < firstCall ? 'UNKNOWN' : cool ? 'COOLING' : heat ? 'HEATING' : 'IDLE';
      const run = cool ?? heat;
      const minutesIn = run ? (t.getTime() - run.start.getTime()) / 60_000 : null;
      const cycleBucket = minutesIn == null ? 'off' : minutesIn < 5 ? '0-5' : minutesIn < 15 ? '5-15' : '15+';
      let last: { t: Date; v: number } | null = null;
      for (const o of sortedOutdoor) { if (o.t <= t) last = o; else break; }
      const band = last && t.getTime() - last.t.getTime() <= OUTDOOR_MAX_AGE_MS ? outdoorBand(last.v) : 'UNKNOWN';
      return { mode, band, cycleBucket };
    },
  };
}

// Baseline readings for the current context, broadening only as far as is
// safe: full context → same mode + cycle stage → same mode. Never across
// modes (cooling is never compared with heating or idle).
export function contextBaseline(history: { t: Date; v: number }[], timeline: ContextTimeline, current: Ctx, minSamples: number): { values: number[]; level: 'full' | 'mode+cycle' | 'mode'; reducedContext: boolean } {
  const tagged = history.map((h) => ({ ...h, ctx: timeline.at(h.t) }));
  const full = tagged.filter((h) => h.ctx.mode === current.mode && h.ctx.band === current.band && h.ctx.cycleBucket === current.cycleBucket);
  if (full.length >= minSamples) return { values: full.map((h) => h.v), level: 'full', reducedContext: false };
  const modeCycle = tagged.filter((h) => h.ctx.mode === current.mode && h.ctx.cycleBucket === current.cycleBucket);
  if (modeCycle.length >= minSamples) return { values: modeCycle.map((h) => h.v), level: 'mode+cycle', reducedContext: true };
  return { values: tagged.filter((h) => h.ctx.mode === current.mode).map((h) => h.v), level: 'mode', reducedContext: true };
}
