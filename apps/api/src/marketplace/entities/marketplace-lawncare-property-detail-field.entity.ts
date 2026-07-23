import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Admin-manageable field definitions for the Lawncare "Property Details"
// section (Shrub/Plant Count, Bed Sq Ft, Gutter Linear Ft, ...) — separate
// from the special-cased propertySizeTier dropdown, which has its own
// pricing-tier semantics and isn't part of this manageable set. Values live
// in MarketplaceLawncarePropertyProfile.fieldValues, keyed by `key`.
@Entity('marketplace_lawncare_property_detail_fields')
export class MarketplaceLawncarePropertyDetailField {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column()
  unit: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
