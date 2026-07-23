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
//
// Lawn Mowing is a special case (service.sizeTiers non-empty): instead of the
// linear formula, price = tier.base + tier.addlRate × (tier.maxSF / 1000) —
// using the TIER'S OWN fixed SF ceiling, not qty, since the customer picks a
// tier from a dropdown rather than entering a continuous SF number. Computed
// independently for vendor and customer columns, both discounted by the same
// discountRate resolved below (unchanged mechanism) — this is also the first
// place vendor cost is actually computed anywhere in the Lawncare quote path.
export function computeLawncareServicePrice(
  service: MarketplaceLawncareService,
  qty: number,
  frequency?: string,
  profile?: MarketplaceLawncarePropertyProfile | null,
): { price: number; vendorPrice: number; discountRate: number; requiresQuote?: boolean } {
  let discountRate = 0;
  const frequencyMatch = frequency ? service.frequencyDiscounts?.find((f) => f.frequency === frequency) : undefined;
  if (frequencyMatch) {
    discountRate = Number(frequencyMatch.ratePercent);
  } else if (service.volumeDiscountThreshold2 != null && qty >= Number(service.volumeDiscountThreshold2)) {
    discountRate = Number(service.volumeDiscountRate2);
  } else if (service.volumeDiscountThreshold1 != null && qty >= Number(service.volumeDiscountThreshold1)) {
    discountRate = Number(service.volumeDiscountRate1);
  }

  if (service.key === 'lawn_mowing' && service.sizeTiers?.length) {
    const tier = service.sizeTiers.find((t) => t.key === profile?.propertySizeTier);
    if (!tier || tier.requiresQuote) {
      return { price: 0, vendorPrice: 0, discountRate, requiresQuote: true };
    }
    const addlUnits = (tier.maxSF ?? 0) / 1000;
    const customerRaw = Number(tier.customerBase ?? 0) + Number(tier.customerAddlRate ?? 0) * addlUnits;
    const vendorRaw = Number(tier.vendorBase ?? 0) + Number(tier.vendorAddlRate ?? 0) * addlUnits;
    const price = Math.round(customerRaw * (1 - discountRate / 100) * 100) / 100;
    const vendorPrice = Math.round(vendorRaw * (1 - discountRate / 100) * 100) / 100;
    return { price, vendorPrice, discountRate };
  }

  const billableQty = Math.max(0, qty - Number(service.includedQty ?? 0));
  const raw = Number(service.customerPriceBase) + Number(service.customerPricePerUnit) * billableQty;
  const vendorRaw = Number(service.subCostBase) + Number(service.subCostPerUnit) * billableQty;
  const price = Math.round(raw * (1 - discountRate / 100) * 100) / 100;
  const vendorPrice = Math.round(vendorRaw * (1 - discountRate / 100) * 100) / 100;
  return { price, vendorPrice, discountRate };
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
// supplies its quantity. Lawn Mowing now reads its tier's own SF ceiling
// (propertySizeSqFt, auto-derived from propertySizeTier) purely for display/
// consistency — computeLawncareServicePrice() ignores this qty for
// lawn_mowing and looks up the tier directly. Spring Cleanup/Seasonal
// Maintenance/Drainage Correction are flat per-project prices. Mulch
// Installation's unit is cubic yards, derived from bed square footage
// assuming a standard 3" application depth (CY = bedSqFt × 0.25 / 27).
// The other fields (shrub count, bed sq ft, ...) now live in the admin-
// manageable profile.fieldValues map rather than fixed columns — key names
// below must match MarketplaceLawncarePropertyDetailField.key exactly.
export function resolveServiceQty(
  serviceKey: string,
  profile: MarketplaceLawncarePropertyProfile | null,
): number | null {
  if (isManualQtyService(serviceKey)) return null;
  if (!profile) return null;

  const field = (key: string) => Number(profile.fieldValues?.[key]) || 0;

  switch (serviceKey) {
    case 'lawn_mowing':
      return Number(profile.propertySizeSqFt) || 0;
    case 'spring_cleanup':
    case 'seasonal_maintenance':
    case 'drainage_correction':
      return 0;
    case 'mulch_installation':
      return Math.round((field('bedSqFt') * 0.25) / 27);
    case 'bed_weeding':
      return field('bedSqFt');
    case 'leaf_removal':
      return Number(profile.propertySizeSqFt) || 0;
    case 'shrub_trimming':
      return field('shrubPlantCount');
    case 'gutter_cleaning':
      return field('gutterLinearFt');
    case 'irrigation_startup':
    case 'irrigation_winterization':
      return field('irrigationZones');
    case 'small_tree_trimming':
      return field('treeCountSmall');
    case 'medium_tree_trimming':
      return field('treeCountMedium');
    case 'large_tree_trimming':
      return field('treeCountLarge');
    case 'landscape_lighting_maintenance':
      return field('lightingFixtureCount');
    default:
      return 0;
  }
}
