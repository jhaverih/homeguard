import { describe, it, expect } from 'vitest';
import {
  calcPricing, isDynamicGmCategory, calcGraduatedSubtotal, calcDynamicPricing,
  calcTieredCost, computeHourlyBaseRate, parseCsvLine, statesEqual, EditState,
} from './pricing-preview';

// The admin Pricing page's live preview mirrors apps/api/src/pricing/
// pricing.utils.ts's math (see that file's own "kept in sync manually"
// comment) — these tests protect THIS copy's own correctness. They don't
// (and can't, across separate npm packages without a shared module) prove
// the two copies stay identical to each other; if that drift risk ever
// bites, the fix is extracting both into packages/shared, not more tests here.

function editState(overrides: Partial<EditState>): EditState {
  return {
    name: 'Test Service', description: '', pricingMethod: 'FLAT_PRICE', requiresQuote: false,
    basePrice: '100', gmPercent: '15', quantityLabel: 'NONE', minimumQuantity: '',
    includeQty: '', baseRateUnit: '', volumeDiscountThreshold: '', volumeDiscountRate: '',
    requiredCapabilityId: '', category: '', serviceGroups: [], customerRequestable: true,
    isQuotaInspection: false, formulaDescription: '',
    ...overrides,
  };
}

describe('calcPricing', () => {
  it('derives stripe fee and customer price from cost and GM%, consistently', () => {
    const { stripeFee, customerPrice } = calcPricing(100, 15);
    const subtotal = 100 / 0.85;
    expect(stripeFee).toBeCloseTo(subtotal * 0.029 + 0.3, 6);
    expect(customerPrice).toBeCloseTo(subtotal + stripeFee, 6);
  });

  it('charges a higher customer price for a higher GM% on the same cost', () => {
    const low = calcPricing(200, 15).customerPrice;
    const high = calcPricing(200, 30).customerPrice;
    expect(high).toBeGreaterThan(low);
  });
});

describe('isDynamicGmCategory / calcGraduatedSubtotal / calcDynamicPricing', () => {
  it('flags exactly the six dynamic-GM handyman categories', () => {
    expect(isDynamicGmCategory('INTERIOR_REPAIRS_MAINTENANCE')).toBe(true);
    expect(isDynamicGmCategory('INSPECTIONS')).toBe(false);
    expect(isDynamicGmCategory(null)).toBe(false);
  });

  it('never lets the graduated subtotal decrease as cost increases across a bracket boundary', () => {
    for (const boundary of [150, 500, 1000, 2500]) {
      expect(calcGraduatedSubtotal(boundary)).toBeGreaterThan(calcGraduatedSubtotal(boundary - 1));
      expect(calcGraduatedSubtotal(boundary + 1)).toBeGreaterThan(calcGraduatedSubtotal(boundary));
    }
  });

  it('routes calcDynamicPricing through the graduated subtotal, not a flat GM%', () => {
    const { customerPrice } = calcDynamicPricing(100);
    const subtotal = calcGraduatedSubtotal(100);
    expect(customerPrice).toBeCloseTo(subtotal + (subtotal * 0.029 + 0.3), 6);
  });
});

describe('calcTieredCost (admin preview)', () => {
  it('returns basePrice unchanged for non-PER_UNIT methods', () => {
    const state = editState({ pricingMethod: 'FLAT_PRICE', basePrice: '249' });
    expect(calcTieredCost(state, 1)).toBe(249);
    expect(calcTieredCost(state, 10)).toBe(249);
  });

  it('matches the server-side tiering formula for included/mid/discount-tier quantities', () => {
    const state = editState({
      pricingMethod: 'PER_UNIT', basePrice: '70', includeQty: '1', baseRateUnit: '50',
      volumeDiscountThreshold: '5', volumeDiscountRate: '40',
    });
    expect(calcTieredCost(state, 1)).toBe(70);
    expect(calcTieredCost(state, 3)).toBe(70 + 2 * 50);
    expect(calcTieredCost(state, 7)).toBe(70 + 4 * 50 + 2 * 40);
  });

  it('treats a blank numeric field as 0 rather than NaN', () => {
    const state = editState({ pricingMethod: 'FLAT_PRICE', basePrice: '' });
    expect(calcTieredCost(state, 1)).toBe(0);
  });
});

describe('computeHourlyBaseRate', () => {
  it('divides basePrice by includeQty, defaulting includeQty to 1 when blank', () => {
    expect(computeHourlyBaseRate('100', '')).toBe('100.00');
    expect(computeHourlyBaseRate('100', '4')).toBe('25.00');
  });

  it('treats an explicit "0" the same as blank (falls back to 1) rather than dividing by zero', () => {
    // `parseFloat(includeQty) || 1` coerces a falsy 0 to the same default as
    // an unset value — so this never actually reaches a real divide-by-zero,
    // and the function's own `: ''` fallback branch is effectively dead code
    // today. Documenting the real behavior here rather than the assumption.
    expect(computeHourlyBaseRate('100', '0')).toBe('100.00');
  });
});

describe('parseCsvLine', () => {
  it('splits a plain comma-separated line', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps a comma inside quotes as part of one field', () => {
    expect(parseCsvLine('"Interior, Repairs",50')).toEqual(['Interior, Repairs', '50']);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsvLine('"Say ""hi""",ok')).toEqual(['Say "hi"', 'ok']);
  });
});

describe('statesEqual', () => {
  it('is true for two states with identical fields, including matching serviceGroups order', () => {
    const a = editState({ serviceGroups: ['REPAIR', 'MAINTAIN'] });
    const b = editState({ serviceGroups: ['REPAIR', 'MAINTAIN'] });
    expect(statesEqual(a, b)).toBe(true);
  });

  it('is false when any scalar field differs', () => {
    const a = editState({ basePrice: '100' });
    const b = editState({ basePrice: '150' });
    expect(statesEqual(a, b)).toBe(false);
  });

  it('is false when serviceGroups differ, including a same-content different-order list', () => {
    const a = editState({ serviceGroups: ['REPAIR', 'MAINTAIN'] });
    const differentOrder = editState({ serviceGroups: ['MAINTAIN', 'REPAIR'] });
    const differentContent = editState({ serviceGroups: ['REPAIR'] });
    expect(statesEqual(a, differentOrder)).toBe(false);
    expect(statesEqual(a, differentContent)).toBe(false);
  });
});
