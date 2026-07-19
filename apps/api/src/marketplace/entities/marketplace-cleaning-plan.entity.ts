import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CleaningType, VisitFrequency } from '../enums/marketplace.enum';

// One row per cleaning type (Standard/Deep/Move-Out) — admin-editable via
// the Marketplace admin page. costPerUnit is the internal/wholesale rate
// (margin visibility), retailPerUnit is what the pricing formula actually
// charges customers — kept as two independent admin-set fields rather than
// derived from each other via a markup percent, since the given TN defaults
// don't follow the platform's usual ~15% markup (e.g. $13 cost / $24 retail).
@Entity('marketplace_cleaning_plans')
export class MarketplaceCleaningPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: CleaningType, unique: true })
  cleaningType: CleaningType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costPerUnit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  retailPerUnit: number;

  @Column({ type: 'simple-array' })
  allowedFrequencies: VisitFrequency[];

  @Column({ type: 'enum', enum: VisitFrequency })
  defaultFrequency: VisitFrequency;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
