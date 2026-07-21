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

  // Which of the 18 MarketplaceLawncareService keys this package includes,
  // and how many times per year each runs — the actual charged monthlyPrice
  // is computed fresh at quote/subscribe time from this composition against
  // the customer's own MarketplaceLawncarePropertyProfile, the same way
  // House Cleaning derives its price from BCU x rate x frequency.
  @Column({ type: 'jsonb', default: [] })
  composition: { serviceKey: string; visitsPerYear: number }[];

  // Typical/"starting at" reference price shown in marketing copy only —
  // NOT the authoritative charged amount (that's always freshly computed
  // from `composition` against the customer's property profile).
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
