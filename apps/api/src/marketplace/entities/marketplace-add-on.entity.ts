import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per selectable add-on (Pet Hair, Interior Windows, ...).
// perUnit add-ons (Interior Windows per window, Bed Linen per bed) require a
// quantity when selected; others are a flat add per subscription.
@Entity('marketplace_add_ons')
export class MarketplaceAddOn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  customerPrice: number;

  @Column({ default: false })
  perUnit: boolean;

  @Column({ nullable: true })
  unitLabel: string | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
