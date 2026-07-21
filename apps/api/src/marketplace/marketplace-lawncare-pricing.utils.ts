import { MarketplaceLawncareService } from './entities/marketplace-lawncare-service.entity';
import { MarketplaceLawncarePropertyProfile } from './entities/marketplace-lawncare-property-profile.entity';

// customerPriceBase + customerPricePerUnit × (qty beyond includedQty), then a
// flat percent-off once a quantity threshold is crossed (whichever numeric
// tier applies — threshold2 wins over threshold1 if both are met). This
// mirrors the source pricing sheet's own wording (e.g. Sod Installation:
// "5,000+ SF: 10%; 10,000+ SF: 15%" — a discount rate off the total, not an
// alternate per-unit rate), unlike the generic catalog's calcTieredCost(),
// which instead switches to a cheaper per-unit rate past a threshold.
//
// Services whose volumeDiscountText is frequency/bundle-based (e.g. Lawn
// Mowing: "Weekly: 15%, Biweekly: 5%") have no numeric thresholds set — for
// those, pass the customer's chosen `frequency` and it's looked up in the
// service's own frequencyDiscounts array instead. The two discount shapes
// never co-occur on the same service, so there's no stacking/precedence
// question: if a matching frequencyDiscounts entry is found, it's used
// exclusively; otherwise the qty-threshold path runs as before (a no-op for
// rows that only have frequency-based discounts).
export function computeLawncareServicePrice(
  service: MarketplaceLawncareService,
  qty: number,
  frequency?: string,
): { price: number; discountRate: number } {
  const billableQty = Math.max(0, qty - Number(service.includedQty ?? 0));
  const raw = Number(service.customerPriceBase) + Number(service.customerPricePerUnit) * billableQty;

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
  return { price, discountRate };
}

// The 3 project-sized services (a one-off job whose size varies per
// project, not a standing property attribute) return null here — the
// caller must supply an explicit qty instead of pulling one from the
// customer's saved property profile.
const MANUAL_QTY_SERVICE_KEYS = new Set(['sod_installation', 'plant_installation', 'gravel_rock_installation']);

export function isManualQtyService(serviceKey: string): boolean {
  return MANUAL_QTY_SERVICE_KEYS.has(serviceKey);
}

// Maps each of the 18 service keys to the property-profile field that
// supplies its quantity. Lawn Mowing has no "First X" basis in the source
// pricing sheet to scale from, so it's treated as flat per visit (qty 0,
// full customerPricePerUnit never applies) rather than inventing an
// ungrounded conversion factor. Spring Cleanup/Seasonal Maintenance/Drainage
// Correction are similarly flat per-project prices. Mulch Installation's
// unit is cubic yards, derived from bed square footage assuming a standard
// 3" application depth (CY = bedSqFt × 0.25 / 27).
export function resolveServiceQty(
  serviceKey: string,
  profile: MarketplaceLawncarePropertyProfile | null,
): number | null {
  if (isManualQtyService(serviceKey)) return null;
  if (!profile) return null;

  switch (serviceKey) {
    case 'lawn_mowing':
    case 'spring_cleanup':
    case 'seasonal_maintenance':
    case 'drainage_correction':
      return 0;
    case 'mulch_installation':
      return Math.round(((Number(profile.bedSqFt) || 0) * 0.25) / 27);
    case 'bed_weeding':
      return Number(profile.bedSqFt) || 0;
    case 'leaf_removal':
      return Number(profile.propertySizeSqFt) || 0;
    case 'shrub_trimming':
      return Number(profile.shrubPlantCount) || 0;
    case 'gutter_cleaning':
      return Number(profile.gutterLinearFt) || 0;
    case 'irrigation_startup':
    case 'irrigation_winterization':
      return Number(profile.irrigationZones) || 0;
    case 'small_tree_trimming':
      return Number(profile.treeCountSmall) || 0;
    case 'medium_tree_trimming':
      return Number(profile.treeCountMedium) || 0;
    case 'large_tree_trimming':
      return Number(profile.treeCountLarge) || 0;
    case 'landscape_lighting_maintenance':
      return Number(profile.lightingFixtureCount) || 0;
    default:
      return 0;
  }
}
