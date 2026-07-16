export enum PricingMethod {
  FLAT_PRICE = 'FLAT_PRICE',
  PER_UNIT = 'PER_UNIT',
  ONE_TIME_FEE = 'ONE_TIME_FEE',
  REQUEST_QUOTE = 'REQUEST_QUOTE',
}

// Drives the admin dropdown labels and the customer-facing derived price
// text. PER_UNIT's real suffix is built dynamically from the service's own
// Unit Label (see pricing.utils.ts formatPriceDisplay) rather than a fixed
// suffix here, since it now covers hours/sq-ft/bulbs/etc. generically.
export const PRICING_METHOD_META: Record<PricingMethod, { label: string; suffix: string | null }> = {
  [PricingMethod.FLAT_PRICE]: { label: 'Flat Price', suffix: null },
  [PricingMethod.PER_UNIT]: { label: 'Per Unit', suffix: null },
  [PricingMethod.ONE_TIME_FEE]: { label: 'One-Time Fee', suffix: null },
  [PricingMethod.REQUEST_QUOTE]: { label: 'Request Quote', suffix: null },
};
