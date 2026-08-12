import { ServicePrice } from './entities/service-price.entity';
import { PricingMethod, PRICING_METHOD_META } from '../common/enums/pricing-method.enum';
import { ServiceCategory } from '../common/enums/service-category.enum';

// Tiered volume-discount cost for a PER_UNIT service at a given quantity:
// basePrice ("Subcontractor Minimum Payout") covers up to includeQty units;
// units beyond that up to volumeDiscountThreshold are charged at
// baseRateUnit; units beyond the threshold are charged at the cheaper
// volumeDiscountRate. Non-PER_UNIT methods just return basePrice unchanged
// (qty is irrelevant to them). Missing tier fields fall back to values that
// reproduce today's flat basePrice × qty behavior (includeQty=1,
// baseRateUnit=basePrice, no 3rd tier).
export function calcTieredCost(sp: ServicePrice, qty: number): number {
  if (sp.pricingMethod !== PricingMethod.PER_UNIT) return Number(sp.basePrice);
  const include = sp.includeQty != null ? Number(sp.includeQty) : 1;
  const baseRate = sp.baseRateUnit != null ? Number(sp.baseRateUnit) : Number(sp.basePrice);
  const threshold = sp.volumeDiscountThreshold != null ? Number(sp.volumeDiscountThreshold) : Infinity;
  const volRate = sp.volumeDiscountRate != null ? Number(sp.volumeDiscountRate) : 0;
  const tier2Qty = Math.max(0, Math.min(qty, threshold) - include);
  const tier3Qty = Math.max(0, qty - threshold);
  return Number(sp.basePrice) + tier2Qty * baseRate + tier3Qty * volRate;
}

// Derives the customer-facing price string (e.g. "$70 (includes up to 1
// Hour)") from the structured pricingMethod + basePrice + tiered fields,
// replacing the old admin-typed free-text priceNote field. labelMap is the
// live code->label lookup from the admin-manageable service_unit_labels
// table (see PricingService.withDisplay) — falls back to showing the raw
// code if a label was since deleted, rather than rendering blank.
export function formatPriceDisplay(item: ServicePrice, labelMap: Record<string, string>): string {
  if (item.requiresQuote) return 'Request a Quote';
  const amount = Number(item.basePrice);
  const formatted = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  if (item.pricingMethod === PricingMethod.PER_UNIT && item.quantityLabel && item.quantityLabel !== 'NONE') {
    const unitLabel = labelMap[item.quantityLabel] ?? item.quantityLabel;
    if (item.includeQty != null) {
      const include = Number(item.includeQty);
      const plural = include !== 1 ? 's' : '';
      return `$${formatted} (includes up to ${include} ${unitLabel}${plural})`;
    }
    return `$${formatted} Per ${unitLabel}`;
  }
  const suffix = PRICING_METHOD_META[item.pricingMethod]?.suffix ?? '';
  return `$${formatted}${suffix}`;
}

// Stripe's real US card rate — same literals payments.service.ts already
// uses 4x for the actual charge/payout deduction (duplicated there rather
// than imported, matching this file's own client/server calcTieredCost
// duplication convention — see apps/mobile and apps/admin's local copies).
export const STRIPE_RATE = 0.029;
export const STRIPE_FIXED = 0.30;

export function applyStripeFee(subtotal: number): number {
  return subtotal + (subtotal * STRIPE_RATE + STRIPE_FIXED);
}

// These 6 handyman/repair categories price via a dynamic, graduated GM%
// looked up from total vendor cost (tiered service cost + any material
// costs logged during the job) instead of a fixed per-item gmPercent.
// Inspections and everything else keep the fixed/manual gmPercent model.
const DYNAMIC_GM_CATEGORIES = new Set<ServiceCategory>([
  ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE,
  ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS,
  ServiceCategory.MINOR_PLUMBING_FIXES,
  ServiceCategory.MOUNTING_INSTALLATIONS,
  ServiceCategory.CARPENTRY_ASSEMBLY,
  ServiceCategory.EXTERIOR_OUTDOOR_SERVICES,
]);

// Backend-constant bracket table (not admin-editable — future changes are a
// code change). Values are the midpoint of each of the business's target
// GM% ranges: $0-150 -> 35-40%, $151-500 -> 30-35%, $501-1,000 -> 25-30%,
// $1,001-2,500 -> 20-25%, $2,500+ -> 15-20%.
const GM_BRACKETS: { max: number; gmPercent: number }[] = [
  { max: 150, gmPercent: 37.5 },
  { max: 500, gmPercent: 32.5 },
  { max: 1000, gmPercent: 27.5 },
  { max: 2500, gmPercent: 22.5 },
  { max: Infinity, gmPercent: 17.5 },
];

export function isDynamicGmCategory(category: ServiceCategory | null | undefined): boolean {
  return category != null && DYNAMIC_GM_CATEGORIES.has(category);
}

// Graduated/marginal, like tax brackets — each portion of totalCost prices
// at its own bracket's GM%, summed. A simple "whole amount gets whichever
// bracket it falls into" lookup would make price DROP at every boundary
// (rate decreases as cost increases, so a $1 higher cost could land in a
// bracket whose lower rate more than offsets that dollar) — this avoids
// that; verified monotonic across all bracket boundaries by hand.
export function calcGraduatedPrice(totalCost: number): number {
  let remaining = totalCost;
  let previousMax = 0;
  let total = 0;
  for (const bracket of GM_BRACKETS) {
    const portion = Math.min(remaining, bracket.max - previousMax);
    if (portion <= 0) break;
    total += portion / (1 - bracket.gmPercent / 100);
    remaining -= portion;
    previousMax = bracket.max;
  }
  return total;
}

// Customer-facing equivalent of formatPriceDisplay() — same shape/wording,
// but built from the GM-adjusted, Stripe-fee-inclusive price (same formula
// as the real charge in service-requests.service.ts), never the raw vendor
// basePrice.
export function formatCustomerPriceDisplay(item: ServicePrice, labelMap: Record<string, string>): string {
  if (item.requiresQuote) return 'Request a Quote';
  const qty = item.pricingMethod === PricingMethod.PER_UNIT && item.includeQty != null ? Number(item.includeQty) : 1;
  const cost = calcTieredCost(item, qty);
  const gm = item.gmPercent != null ? Number(item.gmPercent) : 15;
  const subtotal = isDynamicGmCategory(item.category) ? calcGraduatedPrice(cost) : cost / (1 - gm / 100);
  const amount = applyStripeFee(subtotal);
  const formatted = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  if (item.pricingMethod === PricingMethod.PER_UNIT && item.quantityLabel && item.quantityLabel !== 'NONE') {
    const unitLabel = labelMap[item.quantityLabel] ?? item.quantityLabel;
    if (item.includeQty != null) {
      const include = Number(item.includeQty);
      const plural = include !== 1 ? 's' : '';
      return `$${formatted} (includes up to ${include} ${unitLabel}${plural})`;
    }
    return `$${formatted} Per ${unitLabel}`;
  }
  const suffix = PRICING_METHOD_META[item.pricingMethod]?.suffix ?? '';
  return `$${formatted}${suffix}`;
}
