export function formatRelativeAge(date: string | Date | null | undefined): string {
  if (!date) return '';
  const ageMs = Date.now() - new Date(date).getTime();
  const ageMin = Math.round(ageMs / 60000);
  if (ageMin < 1) return 'updated just now';
  if (ageMin < 60) return `updated ${ageMin}m ago`;
  const ageHr = Math.round(ageMin / 60);
  return `updated ${ageHr}h ago`;
}
