import * as usCounties from '../data/us-counties.json';
import { ENABLED_SERVICE_STATES } from '../config/enabled-service-states';

export interface CountyOption {
  fips: string;
  name: string;
}

const US_COUNTIES: Record<string, CountyOption[]> = usCounties as unknown as Record<string, CountyOption[]>;

// Full county list, but only for states currently open for vendor selection —
// used both to serve the picker UI and to validate what a vendor/admin submits.
export function getEnabledCounties(): Record<string, CountyOption[]> {
  const result: Record<string, CountyOption[]> = {};
  for (const state of ENABLED_SERVICE_STATES) {
    if (US_COUNTIES[state]) result[state] = US_COUNTIES[state];
  }
  return result;
}

let enabledFipsCache: Set<string> | null = null;
export function isEnabledCountyFips(fips: string): boolean {
  if (!enabledFipsCache) {
    enabledFipsCache = new Set(
      Object.values(getEnabledCounties()).flat().map((c) => c.fips),
    );
  }
  return enabledFipsCache.has(fips);
}

// County FIPS code → two-letter state (e.g. "47187" → "TN"), across all states.
let stateByFipsCache: Map<string, string> | null = null;
export function stateForCountyFips(fips: string): string | null {
  if (!stateByFipsCache) {
    stateByFipsCache = new Map();
    for (const [state, counties] of Object.entries(US_COUNTIES)) {
      for (const c of counties) stateByFipsCache.set(c.fips, state);
    }
  }
  return stateByFipsCache.get(fips) ?? null;
}

// The distinct states of a list of county FIPS codes, sorted.
export function statesForCounties(fips: string[] | null | undefined): string[] {
  return [...new Set((fips ?? []).map(stateForCountyFips).filter((s): s is string => !!s))].sort();
}
