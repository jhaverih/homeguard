import {
  calcTieredCost, formatPriceDisplay, applyStripeFee, isDynamicGmCategory,
  calcGraduatedPrice, formatCustomerPriceDisplay, STRIPE_RATE, STRIPE_FIXED,
} from './pricing.utils';
import { PricingMethod } from '../common/enums/pricing-method.enum';
import { ServiceCategory } from '../common/enums/service-category.enum';
import { ServicePrice } from './entities/service-price.entity';

// Builds a minimal ServicePrice fixture — only the fields calcTieredCost/
// formatPriceDisplay/formatCustomerPriceDisplay actually read. `as ServicePrice`
// is safe here since these are pure functions reading plain fields, never
// touching the TypeORM decorators or @BeforeInsert hooks (those only fire on
// a real repository .save()).
function servicePrice(overrides: Partial<ServicePrice>): ServicePrice {
  return {
    id: 'sp-1', name: 'Test Service', description: '', basePrice: 100, gmPercent: null,
    pricingMethod: PricingMethod.FLAT_PRICE, requiresQuote: false, quantityLabel: null,
    minimumQuantity: null, includeQty: null, baseRateUnit: null, volumeDiscountThreshold: null,
    volumeDiscountRate: null, isActive: true, requiredCapabilityId: null, category: null,
    serviceGroups: null, customerRequestable: true, isQuotaInspection: false, checklistGroupKey: null,
    useCharacteristicPricing: false, formulaDescription: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as ServicePrice;
}

describe('calcTieredCost', () => {
  it('returns basePrice unchanged for non-PER_UNIT methods, ignoring qty', () => {
    const sp = servicePrice({ pricingMethod: PricingMethod.FLAT_PRICE, basePrice: 249 });
    expect(calcTieredCost(sp, 1)).toBe(249);
    expect(calcTieredCost(sp, 50)).toBe(249);
  });

  it('reproduces flat basePrice × qty when no tier fields are set (fallback behavior)', () => {
    const sp = servicePrice({ pricingMethod: PricingMethod.PER_UNIT, basePrice: 10 });
    expect(calcTieredCost(sp, 1)).toBe(10);
    expect(calcTieredCost(sp, 3)).toBe(30);
  });

  it('charges baseRateUnit for qty between includeQty and the volume threshold', () => {
    // $70 covers the first hour; hours 2-5 at $50/hr; hour 6+ at $40/hr.
    const sp = servicePrice({
      pricingMethod: PricingMethod.PER_UNIT, basePrice: 70,
      includeQty: 1, baseRateUnit: 50, volumeDiscountThreshold: 5, volumeDiscountRate: 40,
    });
    expect(calcTieredCost(sp, 1)).toBe(70); // fully within the included quantity
    expect(calcTieredCost(sp, 3)).toBe(70 + 2 * 50); // 2 extra hours at the mid rate
    expect(calcTieredCost(sp, 7)).toBe(70 + 4 * 50 + 2 * 40); // crosses into the discount tier
  });

  it('never charges a negative quantity at either tier when qty is below the threshold', () => {
    const sp = servicePrice({
      pricingMethod: PricingMethod.PER_UNIT, basePrice: 20,
      includeQty: 2, baseRateUnit: 15, volumeDiscountThreshold: 10, volumeDiscountRate: 5,
    });
    // qty below includeQty must not go negative and reduce the price below basePrice.
    expect(calcTieredCost(sp, 1)).toBe(20);
  });
});

describe('formatPriceDisplay', () => {
  const labelMap = { HOUR: 'Hour', SQFT: 'Sq Ft' };

  it('shows "Request a Quote" whenever requiresQuote is set, regardless of other fields', () => {
    const sp = servicePrice({ requiresQuote: true, basePrice: 999 });
    expect(formatPriceDisplay(sp, labelMap)).toBe('Request a Quote');
  });

  it('formats a PER_UNIT item with an included quantity, pluralizing the unit label correctly', () => {
    const one = servicePrice({ pricingMethod: PricingMethod.PER_UNIT, basePrice: 70, quantityLabel: 'HOUR', includeQty: 1 });
    expect(formatPriceDisplay(one, labelMap)).toBe('$70 (includes up to 1 Hour)');

    const two = servicePrice({ pricingMethod: PricingMethod.PER_UNIT, basePrice: 70, quantityLabel: 'HOUR', includeQty: 2 });
    expect(formatPriceDisplay(two, labelMap)).toBe('$70 (includes up to 2 Hours)');
  });

  it('formats a PER_UNIT item with no included quantity as a straight per-unit rate', () => {
    const sp = servicePrice({ pricingMethod: PricingMethod.PER_UNIT, basePrice: 25, quantityLabel: 'SQFT' });
    expect(formatPriceDisplay(sp, labelMap)).toBe('$25 Per Sq Ft');
  });

  it('falls back to the raw quantity-label code if the label was deleted from the lookup table', () => {
    const sp = servicePrice({ pricingMethod: PricingMethod.PER_UNIT, basePrice: 10, quantityLabel: 'WIDGET' });
    expect(formatPriceDisplay(sp, {})).toBe('$10 Per WIDGET');
  });

  it('formats whole-dollar amounts without decimals and fractional amounts with two decimals', () => {
    expect(formatPriceDisplay(servicePrice({ basePrice: 99 }), {})).toBe('$99');
    expect(formatPriceDisplay(servicePrice({ basePrice: 99.5 }), {})).toBe('$99.50');
  });
});

describe('applyStripeFee', () => {
  it('adds the percentage rate plus the fixed fee', () => {
    expect(applyStripeFee(100)).toBeCloseTo(100 + 100 * STRIPE_RATE + STRIPE_FIXED, 6);
  });

  it('matches the documented real US card rate (2.9% + $0.30)', () => {
    expect(STRIPE_RATE).toBe(0.029);
    expect(STRIPE_FIXED).toBe(0.3);
  });
});

describe('isDynamicGmCategory', () => {
  it('is true only for the six dynamic-GM handyman categories', () => {
    expect(isDynamicGmCategory(ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE)).toBe(true);
    expect(isDynamicGmCategory(ServiceCategory.MINOR_ELECTRICAL_ADJUSTMENTS)).toBe(true);
  });

  it('is false for inspections, other fixed-GM categories, null, and undefined', () => {
    expect(isDynamicGmCategory(ServiceCategory.INSPECTIONS)).toBe(false);
    expect(isDynamicGmCategory(null)).toBe(false);
    expect(isDynamicGmCategory(undefined)).toBe(false);
  });
});

describe('calcGraduatedPrice', () => {
  it('prices entirely within the first bracket at that bracket\'s GM%', () => {
    // $0-150 bracket is 37.5% GM: price = cost / (1 - 0.375).
    expect(calcGraduatedPrice(100)).toBeCloseTo(100 / 0.625, 6);
  });

  it('splits cost across brackets like a graduated tax, not a cliff lookup', () => {
    // First $150 at 37.5%, the next $150 (of $300 total) at the second
    // bracket's 32.5% — NOT the whole $300 priced at one rate.
    const expected = 150 / (1 - 0.375) + 150 / (1 - 0.325);
    expect(calcGraduatedPrice(300)).toBeCloseTo(expected, 6);
  });

  it('never lets price decrease as cost increases across every bracket boundary (the exact bug this function exists to avoid)', () => {
    const boundaries = [150, 500, 1000, 2500];
    for (const b of boundaries) {
      const just_below = calcGraduatedPrice(b - 1);
      const at = calcGraduatedPrice(b);
      const just_above = calcGraduatedPrice(b + 1);
      expect(at).toBeGreaterThan(just_below);
      expect(just_above).toBeGreaterThan(at);
    }
  });
});

describe('formatCustomerPriceDisplay', () => {
  const labelMap = { HOUR: 'Hour' };

  it('shows "Request a Quote" whenever requiresQuote is set', () => {
    const sp = servicePrice({ requiresQuote: true });
    expect(formatCustomerPriceDisplay(sp, labelMap)).toBe('Request a Quote');
  });

  it('shows a rounded-up "From $X" estimate for characteristic-priced items instead of a computed number', () => {
    const sp = servicePrice({ useCharacteristicPricing: true, basePrice: 249.4 });
    expect(formatCustomerPriceDisplay(sp, labelMap)).toBe('From $250 (may vary based on home details)');
  });

  it('computes the GM-adjusted, Stripe-fee-inclusive price and rounds up to a whole dollar', () => {
    const sp = servicePrice({ pricingMethod: PricingMethod.FLAT_PRICE, basePrice: 100, gmPercent: 15 });
    // cost=100 (flat) -> subtotal = 100/0.85 -> + stripe fee -> ceil.
    const subtotal = 100 / 0.85;
    const expected = Math.ceil(subtotal + subtotal * STRIPE_RATE + STRIPE_FIXED);
    expect(formatCustomerPriceDisplay(sp, labelMap)).toBe(`$${expected}`);
  });

  it('defaults to 15% GM when gmPercent is not set', () => {
    const withNullGm = servicePrice({ pricingMethod: PricingMethod.FLAT_PRICE, basePrice: 100, gmPercent: null });
    const withExplicit15 = servicePrice({ pricingMethod: PricingMethod.FLAT_PRICE, basePrice: 100, gmPercent: 15 });
    expect(formatCustomerPriceDisplay(withNullGm, labelMap)).toBe(formatCustomerPriceDisplay(withExplicit15, labelMap));
  });

  it('routes dynamic-GM categories through the graduated bracket table instead of a flat gmPercent', () => {
    const sp = servicePrice({
      pricingMethod: PricingMethod.FLAT_PRICE, basePrice: 100, gmPercent: 15,
      category: ServiceCategory.INTERIOR_REPAIRS_MAINTENANCE,
    });
    const subtotal = calcGraduatedPrice(100); // 100 / 0.625 at the 37.5% first bracket
    const expected = Math.ceil(subtotal + subtotal * STRIPE_RATE + STRIPE_FIXED);
    expect(formatCustomerPriceDisplay(sp, labelMap)).toBe(`$${expected}`);
  });
});
