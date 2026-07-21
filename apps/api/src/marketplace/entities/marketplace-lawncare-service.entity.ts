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

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeDiscountThreshold1: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  volumeDiscountRate1: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeDiscountThreshold2: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  volumeDiscountRate2: number | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
