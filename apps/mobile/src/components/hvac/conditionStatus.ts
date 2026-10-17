// How a condition ended, in the homeowner's words. A closed condition is
// never deleted — it stays in the history with this label.
export function conditionStatus(status: string | undefined, closedVia?: string | null): { label: string; color: string } {
  if (!status || status === 'ACTIVE') return { label: 'Active', color: '#DC2626' };
  if (status === 'DISMISSED') return { label: closedVia === 'ADMIN' ? 'Dismissed by Attenteve' : 'Dismissed by you', color: '#B45309' };
  if (closedVia === 'HOMEOWNER') return { label: 'Marked fixed by you', color: '#0369A1' };
  if (closedVia === 'ADMIN') return { label: 'Closed by Attenteve', color: '#0369A1' };
  return { label: 'Cleared', color: '#059669' };
}
