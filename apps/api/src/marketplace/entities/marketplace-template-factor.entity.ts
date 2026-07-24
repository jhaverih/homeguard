import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// A "Service Factor" for a MarketplaceOfferTemplate — generalizes House
// Cleaning's Condition Multipliers to a fully self-service, template-scoped
// pool of stacking modifiers (no seed-only base-tier/forces-quote
// structure; every factor here is a simple additive offset). A
// MarketplaceTemplateService opts into 1+ factors via its factorIds column;
// selected factors stack the same way computeConditionMultiplier does:
// multiplier = 1 + sum(factor.multiplier - 1), applied to both the vendor
// sub-cost and the customer price.
@Entity('marketplace_template_factors')
export class MarketplaceTemplateFactor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1 })
  multiplier: number;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
