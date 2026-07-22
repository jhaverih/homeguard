import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per à-la-carte Pest Control service. Mirrors MarketplaceLawncareService's
// shape (base + per-unit + includedQty + volume/frequency discounts) with two
// additions the pest pricing sheet needed that Lawncare never did:
//
// - A second, independent quantity dimension (customerPricePerUnit2/
//   includedQty2) for the Premium/Ultimate memberships, which scale by BOTH
//   home square footage AND lot acreage at once. Unused (0) for every other
//   row, which only ever has one scaling dimension.
// - `membershipBenefit`, for rows whose discount is conditional on the
//   customer already holding an active Pest Control package subscription
//   (e.g. "Included with Ultimate", "10% with mosquito plan") rather than on
//   quantity or a chosen frequency — checked against the customer's real
//   active MarketplacePestPackageSubscription at quote/book time, not just
//   shown as text. Never co-occurs with volumeDiscountThreshold/
//   frequencyDiscounts on the same row.
@Entity('marketplace_pest_services')
export class MarketplacePestService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column()
  pricingUnit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  includedQty: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  includedQty2: number;

  @Column()
  recommendedFrequency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subCostBase: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subCostPerUnit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subCostPerUnit2: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  customerPriceBase: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  customerPricePerUnit: number;

  // Second scaling dimension — only Premium/Ultimate memberships use this
  // (acreage-based rate, alongside the sqft-based customerPricePerUnit).
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  customerPricePerUnit2: number;

  @Column({ type: 'text' })
  volumeDiscountText: string;

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

  @Column({ type: 'jsonb', nullable: true })
  membershipBenefit: { requiredPackageKeys: string[]; type: 'FREE' | 'PERCENT_OFF'; ratePercent?: number } | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
