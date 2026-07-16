import { ServicePrice } from './entities/service-price.entity';
import { PricingMethod, PRICING_METHOD_META } from '../common/enums/pricing-method.enum';
import { UnitLabel, UNIT_LABEL_META } from '../common/enums/unit-label.enum';

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
// replacing the old admin-typed free-text priceNote field.
export function formatPriceDisplay(item: ServicePrice): string {
  if (item.requiresQuote) return 'Request a Quote';
  const amount = Number(item.basePrice);
  const formatted = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  if (item.pricingMethod === PricingMethod.PER_UNIT && item.quantityLabel && item.quantityLabel !== UnitLabel.NONE) {
    const unitLabel = UNIT_LABEL_META[item.quantityLabel as UnitLabel]?.label ?? '';
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
