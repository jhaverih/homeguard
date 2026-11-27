// Beyond this, "updated Xh ago" stops being useful context and starts
// undermining trust in whatever it's attached to (e.g. "updated 99h ago"
// next to a live-looking ETA) — so callers get '' past the cutoff and can
// omit the freshness line entirely rather than show an absurd duration.
const RELATIVE_AGE_CUTOFF_MIN = 60;

export function formatRelativeAge(date: string | Date | null | undefined): string {
  if (!date) return '';
  const ageMs = Date.now() - new Date(date).getTime();
  const ageMin = Math.round(ageMs / 60000);
  if (ageMin > RELATIVE_AGE_CUTOFF_MIN) return '';
  if (ageMin < 1) return 'updated just now';
  return `updated ${ageMin}m ago`;
}

// Arrival wording for a vendor on the way. etaMinutes is the live estimate
// (only while the vendor's location is fresh); vendorEtaAt is the last
// expected arrival time, kept when location updates stop (phone locked
// while driving), so the customer still knows when to expect them.
export function arrivalText(etaMinutes: number | null | undefined, vendorEtaAt: string | Date | null | undefined, now = Date.now()): string {
  const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (etaMinutes != null) {
    return `Expected around ${clock(now + etaMinutes * 60000)} · about ${etaMinutes} min away`;
  }
  if (!vendorEtaAt) return '';
  const at = new Date(vendorEtaAt).getTime();
  if (!Number.isFinite(at)) return '';
  if (at > now) return `Expected around ${clock(at)}`;
  if (now - at < 20 * 60000) return 'Should be arriving any minute';
  return '';
}
