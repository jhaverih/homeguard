export function fmtUSD(amount: number | string | null | undefined): string {
  const n = Number(amount);
  if (isNaN(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
