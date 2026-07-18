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
