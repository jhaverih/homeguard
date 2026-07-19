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
