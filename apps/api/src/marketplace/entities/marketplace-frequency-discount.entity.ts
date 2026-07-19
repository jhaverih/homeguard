import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { VisitFrequency } from '../enums/marketplace.enum';

// One row per recurring visit frequency — the discount applied to the
// formula's (1 - discount) term. ONE_TIME has no row (0% by definition,
// never discounted).
@Entity('marketplace_frequency_discounts')
export class MarketplaceFrequencyDiscount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: VisitFrequency, unique: true })
  frequency: VisitFrequency;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  discountPercent: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
