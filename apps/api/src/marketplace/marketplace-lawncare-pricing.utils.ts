import { MarketplaceLawncareService } from './entities/marketplace-lawncare-service.entity';

// customerPriceBase + customerPricePerUnit × qty, then a flat percent-off
// once a quantity threshold is crossed (whichever numeric tier applies —
// threshold2 wins over threshold1 if both are met). This mirrors the source
// pricing sheet's own wording (e.g. Sod Installation: "5,000+ SF: 10%;
// 10,000+ SF: 15%" — a discount rate off the total, not an alternate
// per-unit rate), unlike the generic catalog's calcTieredCost(), which
// instead switches to a cheaper per-unit rate past a threshold.
//
// Services whose volumeDiscountText is frequency/bundle-based (e.g. Lawn
// Mowing: "Weekly: 15%, Biweekly: 5%") have no numeric thresholds set, so
// discountRate stays 0 here — that text is informational only, not applied
// to the computed price.
export function computeLawncareServicePrice(
  service: MarketplaceLawncareService,
  qty: number,
): { price: number; discountRate: number } {
  const raw = Number(service.customerPriceBase) + Number(service.customerPricePerUnit) * qty;

  let discountRate = 0;
  if (service.volumeDiscountThreshold2 != null && qty >= Number(service.volumeDiscountThreshold2)) {
    discountRate = Number(service.volumeDiscountRate2);
  } else if (service.volumeDiscountThreshold1 != null && qty >= Number(service.volumeDiscountThreshold1)) {
    discountRate = Number(service.volumeDiscountRate1);
  }

  const price = Math.round(raw * (1 - discountRate / 100) * 100) / 100;
  return { price, discountRate };
}
