// Rule J — per-input data quality, kept deliberately separate from the
// rules themselves so health can say WHY something can't be assessed:
// an offline device, stale telemetry, an invalid reading, a vendor
// authorization failure, or simply no data yet are different situations
// for the homeowner and for support.

export type InputState = 'OK' | 'STALE' | 'INVALID' | 'UNAVAILABLE' | 'AUTH_FAILURE' | 'NO_DATA';

export interface InputAssessment {
  sensorRole: string;
  deviceRegistryId: string;
  label: string;
  state: InputState;
  detail: string | null;
  lastValidAt: Date | null;
}

export interface InputFacts {
  lastValidAt: Date | null;
  // The newest reading of any quality was INVALID (out of plausible range).
  latestIsInvalid: boolean;
  // Device-reported connectivity (Nest Connectivity trait, YoLink online
  // flag); null when the vendor doesn't expose it.
  online: boolean | null;
  // Vendor account/token failure (e.g. Nest access revoked).
  authFailure: string | null;
  // Null for report-on-change sensors (line probes, leak sensors) — a quiet
  // probe isn't stale; their connectivity is judged by `online` instead.
  staleMinutes: number | null;
  now: Date;
}

export function assessInput(f: InputFacts): { state: InputState; detail: string | null } {
  if (f.authFailure) return { state: 'AUTH_FAILURE', detail: f.authFailure };
  if (f.online === false) return { state: 'UNAVAILABLE', detail: 'Device is offline' };
  if (!f.lastValidAt) return { state: f.latestIsInvalid ? 'INVALID' : 'NO_DATA', detail: f.latestIsInvalid ? 'Only invalid readings received' : 'No readings received yet' };
  if (f.latestIsInvalid) return { state: 'INVALID', detail: 'Latest reading was outside the plausible range' };
  if (f.staleMinutes != null) {
    const ageMin = (f.now.getTime() - f.lastValidAt.getTime()) / 60_000;
    if (ageMin > f.staleMinutes) return { state: 'STALE', detail: `No valid reading for ${Math.round(ageMin)} minutes` };
  }
  return { state: 'OK', detail: null };
}

// All of a role's devices OK → OK; some → PARTIAL (e.g. one of two zone
// thermostats offline — that zone's rules stop, the other's continue);
// none → NONE.
export function aggregateRole(assessments: InputAssessment[]): 'OK' | 'PARTIAL' | 'NONE' {
  const ok = assessments.filter((a) => a.state === 'OK').length;
  if (ok === 0) return 'NONE';
  return ok === assessments.length ? 'OK' : 'PARTIAL';
}
