import { MarketplaceTemplateService } from './entities/marketplace-template-service.entity';
import { MarketplaceTemplateFactor } from './entities/marketplace-template-factor.entity';
import { MarketplaceTemplatePackage } from './entities/marketplace-template-package.entity';

export interface TemplateServiceQuote {
  customerPrice: number;
  subCost: number;
  discountPercent: number;
}

// Base + per-unit(+ second dimension) formula, same shape as
// computePestServicePrice, then:
//
// 1. factors stack additively onto a multiplier exactly like
//    computeConditionMultiplier (1 + sum(factor.multiplier - 1)) — applied
//    to BOTH the customer price and the vendor sub-cost, since the user
//    asked for factors to "impact both our cost and the customer price"
//    (Cleaning's condition multiplier only ever touches the customer side).
// 2. Discounts (volume threshold, frequency, bundle) are SUMMED into one
//    combined percentage rather than cascaded by precedence. The existing
//    verticals get away with a precedence cascade because they document an
//    invariant that discount "shapes" never co-occur on one row — that
//    invariant doesn't hold here, since a bundle discount (package-level)
//    and a volume-threshold discount (service-level) can both legitimately
//    be active on the same quote. Summing is simpler and predictable, and
//    is the recommended approach for this new engine.
export function computeTemplateServicePrice(
  service: MarketplaceTemplateService,
  qty: number,
  qty2: number,
  factors: MarketplaceTemplateFactor[],
  selectedFactorIds: string[],
  frequencyDiscountPercent = 0,
  activePackage: MarketplaceTemplatePackage | null = null,
): TemplateServiceQuote {
  const billableQty = Math.max(0, qty - Number(service.includedQty ?? 0));
  const billableQty2 = Math.max(0, qty2 - Number(service.includedQty2 ?? 0));

  const customerRaw = Number(service.customerPriceBase)
    + Number(service.customerPricePerUnit) * billableQty
    + Number(service.customerPricePerUnit2 ?? 0) * billableQty2;
  const subCostRaw = Number(service.subCostBase)
    + Number(service.subCostPerUnit) * billableQty
    + Number(service.subCostPerUnit2 ?? 0) * billableQty2;

  const applicableFactors = factors.filter((f) => f.isActive && selectedFactorIds.includes(f.id));
  const factorMultiplier = 1 + applicableFactors.reduce((sum, f) => sum + (Number(f.multiplier) - 1), 0);

  let discountPercent = 0;
  if (service.volumeDiscountThreshold2 != null && qty >= Number(service.volumeDiscountThreshold2)) {
    discountPercent += Number(service.volumeDiscountRate2 ?? 0);
  } else if (service.volumeDiscountThreshold1 != null && qty >= Number(service.volumeDiscountThreshold1)) {
    discountPercent += Number(service.volumeDiscountRate1 ?? 0);
  }
  discountPercent += frequencyDiscountPercent;
  if (activePackage && isServiceVisibleUnderPackage(service, activePackage.id)) {
    discountPercent += Number(activePackage.bundleDiscountPercent ?? 0);
  }

  const customerPrice = Math.round(customerRaw * factorMultiplier * (1 - discountPercent / 100) * 100) / 100;
  const subCost = Math.round(subCostRaw * factorMultiplier * 100) / 100; // vendor payout isn't discounted by customer-facing promos

  return { customerPrice, subCost, discountPercent };
}

export function isServiceVisibleUnderPackage(service: MarketplaceTemplateService, packageId: string): boolean {
  if (service.packageVisibility === 'ALWAYS') return true;
  return service.packageIds?.includes(packageId) ?? false;
}

export function computeTemplatePackageMonthlyPrice(
  pkg: MarketplaceTemplatePackage,
  services: MarketplaceTemplateService[],
  propertyValues: Record<string, number>,
  factors: MarketplaceTemplateFactor[],
): number {
  const linked = services.filter((s) => s.isActive && isServiceVisibleUnderPackage(s, pkg.id));
  let total = 0;
  for (const service of linked) {
    const qty = service.propertyFieldId ? Number(propertyValues[service.propertyFieldId] ?? 0) : 0;
    const qty2 = service.propertyField2Id ? Number(propertyValues[service.propertyField2Id] ?? 0) : 0;
    const { customerPrice } = computeTemplateServicePrice(service, qty, qty2, factors, service.factorIds ?? [], 0, pkg);
    total += customerPrice;
  }
  return Math.round(total * 100) / 100;
}
