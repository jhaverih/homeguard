// A user needs to (re-)accept whenever they've never accepted at all, or
// their stored version doesn't match what's currently published — the
// actual mechanism that makes a version bump in apps/api/src/common/
// constants/tos.ts force re-acceptance. `currentVersion` is `undefined`
// (not just possibly null) while GET /legal/versions hasn't resolved yet;
// treated as "don't know yet, don't gate" rather than a false positive.
export function needsReacceptance(acceptedVersion: string | null | undefined, currentVersion: string | undefined): boolean {
  if (!currentVersion) return false;
  return !acceptedVersion || acceptedVersion !== currentVersion;
}
