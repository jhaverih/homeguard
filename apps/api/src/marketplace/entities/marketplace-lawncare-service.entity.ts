import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per à-la-carte lawncare service (Lawn Mowing, Mulch Installation,
// ...). Pricing follows the source pricing sheet's own shape: a base price
// plus a per-additional-unit rate, where `pricingUnit` (e.g. "Per Visit",
// "First 3 CY") already communicates any quantity included in the base.
//
// Volume discounts across the sheet aren't uniform — most are genuine
// quantity thresholds (10+ CY: 10%), but several are tied to a frequency
// commitment or bundle instead (e.g. "Weekly: 15%, Biweekly: 5%"). So
// `volumeDiscountText` always holds the literal discount terms (admin-
// editable, accurate for every row), while the numeric threshold/rate pairs
// below are populated only for rows with a genuine quantity tier — left
// null otherwise. Two tiers are supported since some services have both
// (e.g. Sod Installation: 10% at 5,000+ SF, 15% at 10,000+ SF).
@Entity('marketplace_lawncare_services')
export class MarketplaceLawncareService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column()
  pricingUnit: string;

  // Quantity already covered by customerPriceBase, parsed from pricingUnit's
  // own "First X ..." wording (e.g. "First 200 SF" -> 200). Rows priced per
  // unit from zero (Per SF/Per Plant/Per Tree/Per Project/Per Month/Service
  // Call) get 0. computeLawncareServicePrice() only charges
  // customerPricePerUnit for qty beyond this amount.
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  includedQty: number;

  @Column()
  recommendedFrequency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subCostBase: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subCostPerUnit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  customerPriceBase: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  customerPricePerUnit: number;

  @Column({ type: 'text' })
  volumeDiscountText: string;

  // Structured version of volumeDiscountText for services whose discount is
  // tied to a chosen frequency/commitment rather than a quantity threshold
  // (e.g. Lawn Mowing: "Weekly: 15%, Biweekly: 5%") — empty for every other
  // service, including the ones with a numeric volumeDiscountThreshold1/2
  // (the two shapes never co-occur on the same row). The mobile add-on
  // wizard shows a frequency picker only when this array is non-empty.
  @Column({ type: 'jsonb', default: [] })
  frequencyDiscounts: { frequency: string; label: string; ratePercent: number }[];

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeDiscountThreshold1: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  volumeDiscountRate1: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeDiscountThreshold2: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  volumeDiscountRate2: number | null;

  // Lawn Mowing only — a fixed set of 8 property-size tiers (XS..Large
  // Estate), each with its own base + per-1000-SF-of-the-tier's-own-ceiling
  // additional rate, replacing the linear customerPriceBase/PerUnit formula
  // above for this one service. Null/empty for every other service, which
  // still use the linear formula unchanged. See computeLawncareServicePrice()
  // in marketplace-lawncare-pricing.utils.ts for the exact formula, and
  // resolveServiceQty()/MarketplaceLawncarePropertyProfile.propertySizeTier
  // for how a customer's selected tier flows in.
  @Column({ type: 'jsonb', nullable: true })
  sizeTiers: {
    key: string; label: string; maxSF: number | null;
    vendorBase: number | null; vendorAddlRate: number | null;
    customerBase: number | null; customerAddlRate: number | null;
    requiresQuote: boolean;
  }[] | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
