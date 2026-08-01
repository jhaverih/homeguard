import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// Admin-manageable replacement for the old hardcoded UnitLabel enum — a
// ServicePrice.quantityLabel value (PER_UNIT services' "per ___" text)
// stores `code`, never `label`, so renaming a label here propagates to
// every catalog item using it (and the priceDisplay/customerPriceDisplay
// strings baked from it) without touching a single ServicePrice row.
// `code` is generated once from the label at creation time and is then
// immutable — see PricingService.createUnitLabel().
@Entity('service_unit_labels')
export class ServiceUnitLabel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  label: string;

  // True only for 'HOUR' and 'NONE' — the two codes service-price.entity.ts's
  // lifecycle hooks compare against directly (Hour auto-rate-derivation, and
  // the Flat Price "no unit" sentinel). Blocks delete, never blocks rename.
  @Column({ default: false })
  isSystem: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
