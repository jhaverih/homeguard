import { MarketplacePestService } from './entities/marketplace-pest-service.entity';
import { MarketplacePestPropertyProfile } from './entities/marketplace-pest-property-profile.entity';

// customerPriceBase + customerPricePerUnit × (qty beyond includedQty) +
// customerPricePerUnit2 × (qty2 beyond includedQty2) — the second dimension
// is 0 for every service except the Premium/Ultimate memberships, which
// scale by both home square footage and lot acreage at once.
//
// Discount precedence (only one ever actually applies, same "shapes never
// co-occur" guarantee as Lawncare): a membership benefit (comp/discount
// conditional on the customer's active package subscription) always wins if
// present and satisfied; otherwise a matching frequency discount; otherwise
// the qty-threshold discount.
export function computePestServicePrice(
  service: MarketplacePestService,
  qty: number,
  qty2: number,
  frequency?: string,
  activeMembershipPackageKey?: string | null,
): { price: number; discountRate: number; comped: boolean } {
  const billableQty = Math.max(0, qty - Number(service.includedQty ?? 0));
  const billableQty2 = Math.max(0, qty2 - Number(service.includedQty2 ?? 0));
  const raw = Number(service.customerPriceBase)
    + Number(service.customerPricePerUnit) * billableQty
    + Number(service.customerPricePerUnit2 ?? 0) * billableQty2;

  const benefit = service.membershipBenefit;
  if (benefit && activeMembershipPackageKey && benefit.requiredPackageKeys.includes(activeMembershipPackageKey)) {
    if (benefit.type === 'FREE') return { price: 0, discountRate: 100, comped: true };
    const price = Math.round(raw * (1 - Number(benefit.ratePercent ?? 0) / 100) * 100) / 100;
    return { price, discountRate: Number(benefit.ratePercent ?? 0), comped: false };
  }

  let discountRate = 0;
  const frequencyMatch = frequency ? service.frequencyDiscounts?.find((f) => f.frequency === frequency) : undefined;
  if (frequencyMatch) {
    discountRate = Number(frequencyMatch.ratePercent);
  } else if (service.volumeDiscountThreshold2 != null && qty >= Number(service.volumeDiscountThreshold2)) {
    discountRate = Number(service.volumeDiscountRate2);
  } else if (service.volumeDiscountThreshold1 != null && qty >= Number(service.volumeDiscountThreshold1)) {
    discountRate = Number(service.volumeDiscountRate1);
  }

  const price = Math.round(raw * (1 - discountRate / 100) * 100) / 100;
  return { price, discountRate, comped: false };
}

// Nest/station counts are per-booking decisions, not standing property
// attributes — same treatment as Lawncare's Sod/Plant/Gravel Installation.
const MANUAL_QTY_SERVICE_KEYS = new Set(['rodent_bait_station_service', 'wasp_nest_removal']);

export function isManualQtyPestService(serviceKey: string): boolean {
  return MANUAL_QTY_SERVICE_KEYS.has(serviceKey);
}

const HOME_SQFT_SERVICE_KEYS = new Set([
  'initial_pest_treatment', 'quarterly_pest_treatment', 'pest_control_membership',
  'premium_pest_mosquito_membership', 'ultimate_protection_membership',
]);
const ACREAGE_SERVICE_KEYS = new Set(['mosquito_treatment', 'flea_tick_treatment', 'fire_ant_treatment']);
const DUAL_AXIS_SERVICE_KEYS = new Set(['premium_pest_mosquito_membership', 'ultimate_protection_membership']);

export function resolvePestServiceQty(
  serviceKey: string,
  profile: MarketplacePestPropertyProfile | null,
): number | null {
  if (isManualQtyPestService(serviceKey)) return null;
  if (!profile) return null;
  if (HOME_SQFT_SERVICE_KEYS.has(serviceKey)) return Number(profile.homeSqFt) || 0;
  if (ACREAGE_SERVICE_KEYS.has(serviceKey)) return Number(profile.propertyAcreage) || 0;
  return 0; // flat services: rodent_inspection, crawlspace_attic_inspection, emergency_pest_visit, annual_pest_inspection
}

// Second dimension, only populated for the two dual-axis memberships.
export function resolvePestServiceQty2(
  serviceKey: string,
  profile: MarketplacePestPropertyProfile | null,
): number {
  if (!profile || !DUAL_AXIS_SERVICE_KEYS.has(serviceKey)) return 0;
  return Number(profile.propertyAcreage) || 0;
}
