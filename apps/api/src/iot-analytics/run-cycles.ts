export interface RunCycle { start: Date; end: Date | null; durationMinutes: number | null }

export interface StateSample { deviceRegistryId: string; observedAt: Date; numericValue: number | string | null }

// HVAC_STATE run cycles for one piece of equipment that may be called by
// several thermostats — e.g. a single attic air handler/compressor serving
// a 1st-floor and a 2nd-floor zone, each with its own Nest thermostat. The
// equipment is running whenever ANY of its thermostats reports
// HEATING/COOLING (numericValue 1) and stops only once all of them are OFF
// (0), so one zone handing off to the other mid-run stays a single cycle
// instead of being split or double-counted. `samples` must be sorted by
// observedAt ascending; a device's state before its first sample in the
// window is unknown and treated as OFF.
export function mergeStateRunCycles(samples: StateSample[]): RunCycle[] {
  const on = new Set<string>();
  const cycles: RunCycle[] = [];
  let currentStart: Date | null = null;
  for (const s of samples) {
    if (s.numericValue == null) continue;
    if (Number(s.numericValue) > 0) on.add(s.deviceRegistryId);
    else on.delete(s.deviceRegistryId);

    if (on.size > 0 && !currentStart) {
      currentStart = s.observedAt;
    } else if (on.size === 0 && currentStart) {
      cycles.push({ start: currentStart, end: s.observedAt, durationMinutes: (s.observedAt.getTime() - currentStart.getTime()) / 60000 });
      currentStart = null;
    }
  }
  if (currentStart) cycles.push({ start: currentStart, end: null, durationMinutes: null }); // still running
  return cycles;
}
