import { PropertyCharacteristics } from '../../users/entities/property-characteristics.entity';

type Characteristics = Pick<
  PropertyCharacteristics,
  'squareFootage' | 'hvacCount' | 'waterHeaterCount' | 'bathroomCount' | 'kitchenCount' | 'hasDetachedGarage'
>;

// Shared home-size brackets — same breakpoints for every surcharge below,
// just different dollar amounts per bracket. Matches the worked example
// (3,501-4,500 sqft -> +$50 on the customer-facing formulas).
const SQFT_BRACKETS = [2500, 3500, 4500, 5500];

function sqftTier(squareFootage: number, amounts: [number, number, number, number]): number {
  for (let i = 0; i < SQFT_BRACKETS.length; i++) {
    if (squareFootage <= SQFT_BRACKETS[i]) return i === 0 ? 0 : amounts[i - 1];
  }
  return amounts[amounts.length - 1];
}

// Baseline included in every plan/quote before any surcharge applies —
// beyond these counts, each extra unit adds the given per-item amount.
const BASELINE = { hvac: 2, waterHeaters: 1, bathrooms: 3 };

// Recurring annual surcharge added to Care Plus's $149 base price —
// bakes into a per-customer Stripe Price (see SubscriptionsService).
export function calcCarePlusSurcharge(c: Characteristics): number {
  let surcharge = sqftTier(c.squareFootage, [25, 50, 75, 100]);
  surcharge += Math.max(0, c.hvacCount - BASELINE.hvac) * 25;
  surcharge += Math.max(0, c.waterHeaterCount - BASELINE.waterHeaters) * 15;
  surcharge += Math.max(0, c.bathroomCount - BASELINE.bathrooms) * 10;
  return Math.min(surcharge, 125);
}

// Added on top of the Preventative Home Assessment's $249 base customer price.
export function calcAssessmentCustomerSurcharge(c: Characteristics): number {
  let surcharge = sqftTier(c.squareFootage, [25, 50, 75, 100]);
  surcharge += Math.max(0, c.hvacCount - BASELINE.hvac) * 25;
  surcharge += Math.max(0, c.bathroomCount - BASELINE.bathrooms) * 10;
  surcharge += Math.max(0, c.waterHeaterCount - BASELINE.waterHeaters) * 20;
  if (c.kitchenCount > 1) surcharge += 25;
  if (c.hasDetachedGarage) surcharge += 50;
  return Math.min(surcharge, 100);
}

// Added on top of the Preventative Home Assessment's $100 base vendor
// payout — independent of what the customer paid, see PaymentsService.
export function calcAssessmentVendorCost(c: Characteristics): number {
  let surcharge = sqftTier(c.squareFootage, [15, 30, 45, 60]);
  surcharge += Math.max(0, c.hvacCount - BASELINE.hvac) * 20;
  surcharge += Math.max(0, c.bathroomCount - BASELINE.bathrooms) * 5;
  surcharge += Math.max(0, c.waterHeaterCount - BASELINE.waterHeaters) * 15;
  if (c.kitchenCount > 1) surcharge += 15;
  if (c.hasDetachedGarage) surcharge += 25;
  return 100 + Math.min(surcharge, 75);
}
