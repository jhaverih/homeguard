import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per bundled Lawncare subscription tier (Essential/Premium/Estate).
// `description` is an informal "what's included" summary — no formal
// linkage to MarketplaceLawncareService rows in this pass (that's a quote-
// engine concern for the customer-facing wizard, not built yet).
@Entity('marketplace_lawncare_packages')
export class MarketplaceLawncarePackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monthlyPrice: number;

  // True only for tiers priced as "Starting at $X/month" rather than a flat price.
  @Column({ default: false })
  isStartingAt: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
