// Client-side pricing preview math for the admin Pricing editor — pulled out
// of app/pricing/page.tsx into its own module because Next.js's App Router
// only allows a page.tsx file to export its own special names (default,
// metadata, generateStaticParams, etc.); any other named export fails the
// route's generated type-check (.next/types/app/**/page.ts) and breaks
// `next build`. Living here also makes this importable from tests without
// needing to render the page component at all.
//
// Mirrors apps/api/src/pricing/pricing.utils.ts — kept in sync manually
// since this is a client-side preview, not a shared package (see that
// file's own comment). If this ever drifts, extracting both into
// packages/shared is the real fix, not more tests here.

const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;

export function calcPricing(providerCost: number, gmPct: number) {
  const subtotal = providerCost / (1 - gmPct / 100);
  const stripeFee = subtotal * STRIPE_RATE + STRIPE_FIXED;
  const customerPrice = subtotal + stripeFee;
  return { stripeFee, customerPrice };
}

// These 6 categories price via a dynamic, graduated GM% instead of the
// per-row field — mirrors apps/api/src/pricing/pricing.utils.ts's
// DYNAMIC_GM_CATEGORIES/GM_BRACKETS/calcGraduatedPrice. This preview can
// only show the booking-time estimate (no concept of a specific job's
// logged materials) — the real price finalizes at job completion.
const DYNAMIC_GM_CATEGORIES = new Set([
  'INTERIOR_REPAIRS_MAINTENANCE', 'MINOR_ELECTRICAL_ADJUSTMENTS', 'MINOR_PLUMBING_FIXES',
  'MOUNTING_INSTALLATIONS', 'CARPENTRY_ASSEMBLY', 'EXTERIOR_OUTDOOR_SERVICES',
]);
const GM_BRACKETS = [
  { max: 150, gmPercent: 37.5 }, { max: 500, gmPercent: 32.5 }, { max: 1000, gmPercent: 27.5 },
  { max: 2500, gmPercent: 22.5 }, { max: Infinity, gmPercent: 17.5 },
];
export function isDynamicGmCategory(category: string | null | undefined): boolean {
  return !!category && DYNAMIC_GM_CATEGORIES.has(category);
}
export function calcGraduatedSubtotal(totalCost: number): number {
  let remaining = totalCost, previousMax = 0, total = 0;
  for (const b of GM_BRACKETS) {
    const portion = Math.min(remaining, b.max - previousMax);
    if (portion <= 0) break;
    total += portion / (1 - b.gmPercent / 100);
    remaining -= portion;
    previousMax = b.max;
  }
  return total;
}
export function calcDynamicPricing(providerCost: number) {
  const subtotal = calcGraduatedSubtotal(providerCost);
  const stripeFee = subtotal * STRIPE_RATE + STRIPE_FIXED;
  const customerPrice = subtotal + stripeFee;
  return { stripeFee, customerPrice };
}

export type EditState = {
  name: string;
  description: string;
  pricingMethod: string;
  requiresQuote: boolean;
  basePrice: string;
  gmPercent: string;
  quantityLabel: string;
  minimumQuantity: string;
  includeQty: string;
  baseRateUnit: string;
  volumeDiscountThreshold: string;
  volumeDiscountRate: string;
  requiredCapabilityId: string;
  category: string;
  serviceGroups: string[];
  customerRequestable: boolean;
  isQuotaInspection: boolean;
  formulaDescription: string;
};

// Mirrors apps/api/src/pricing/pricing.utils.ts calcTieredCost() — kept in
// sync manually since this is a client-side preview, not a shared package.
export function calcTieredCost(state: EditState, qty: number): number {
  const basePrice = parseFloat(state.basePrice) || 0;
  if (state.pricingMethod !== 'PER_UNIT') return basePrice;
  const include = state.includeQty !== '' ? parseFloat(state.includeQty) || 0 : 1;
  const baseRate = state.baseRateUnit !== '' ? parseFloat(state.baseRateUnit) || 0 : basePrice;
  const threshold = state.volumeDiscountThreshold !== '' ? parseFloat(state.volumeDiscountThreshold) || 0 : Infinity;
  const volRate = state.volumeDiscountRate !== '' ? parseFloat(state.volumeDiscountRate) || 0 : 0;
  const tier2Qty = Math.max(0, Math.min(qty, threshold) - include);
  const tier3Qty = Math.max(0, qty - threshold);
  return basePrice + tier2Qty * baseRate + tier3Qty * volRate;
}

// Mirrors the entity's syncBaseRateUnit() hook (Per Unit + Hour-labeled rows
// always store basePrice/includeQty as their rate) — previewed live here so
// what an admin sees while editing basePrice/includeQty is what will
// actually get saved, rather than a value that goes stale mid-edit.
export function computeHourlyBaseRate(basePrice: string, includeQty: string): string {
  const bp = parseFloat(basePrice) || 0;
  const incl = includeQty !== '' ? parseFloat(includeQty) || 1 : 1;
  return incl !== 0 ? (bp / incl).toFixed(2) : '';
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      values.push(current); current = '';
    } else {
      current += c;
    }
  }
  values.push(current);
  return values;
}

// Everything on a price row now requires an explicit Save press — this
// compares the live draft against the last-saved server row to decide
// whether that row's Save button should show.
export function statesEqual(a: EditState, b: EditState): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.pricingMethod === b.pricingMethod &&
    a.requiresQuote === b.requiresQuote &&
    a.basePrice === b.basePrice &&
    a.gmPercent === b.gmPercent &&
    a.quantityLabel === b.quantityLabel &&
    a.minimumQuantity === b.minimumQuantity &&
    a.includeQty === b.includeQty &&
    a.baseRateUnit === b.baseRateUnit &&
    a.volumeDiscountThreshold === b.volumeDiscountThreshold &&
    a.volumeDiscountRate === b.volumeDiscountRate &&
    a.requiredCapabilityId === b.requiredCapabilityId &&
    a.category === b.category &&
    a.customerRequestable === b.customerRequestable &&
    a.isQuotaInspection === b.isQuotaInspection &&
    a.formulaDescription === b.formulaDescription &&
    a.serviceGroups.length === b.serviceGroups.length &&
    a.serviceGroups.every((v, i) => v === b.serviceGroups[i])
  );
}
