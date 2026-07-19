import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per house-condition option. isBaseTier marks the 3 mutually
// exclusive baseline conditions (Well Maintained/Average/Not Cleaned 3+
// Months) — exactly one must be selected. Non-base-tier rows are stacking
// modifiers (Has Pets/Heavy Pet Hair/Has Children) added on top as (multiplier
// - 1.0) offsets. forcesQuote (Hoarding/Severe Dirt) bypasses the pricing
// formula entirely — selecting it routes to a manual quote request instead
// of a computed price, regardless of multiplier.
@Entity('marketplace_condition_multipliers')
export class MarketplaceConditionMultiplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'decimal', precision: 4, scale: 2 })
  multiplier: number;

  @Column({ default: false })
  isBaseTier: boolean;

  @Column({ default: false })
  forcesQuote: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
