import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Template-scoped equivalent of MarketplaceFrequencyDiscount (the "Cleaning
// format" — a flat, shared table applied uniformly across every add-on
// service under the template when a customer picks that frequency), but
// admin-creatable since a template's frequency labels aren't a fixed enum
// the way House Cleaning's WEEKLY/BIWEEKLY/MONTHLY are.
@Entity('marketplace_template_frequency_discounts')
export class MarketplaceTemplateFrequencyDiscount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @Column()
  label: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
