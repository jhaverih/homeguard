import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One row per customer — captured once and reused for every Lawncare price
// computation (package subscribe or on-demand service booking), so the
// customer never re-enters the same property details twice. Fields are
// nullable/filled in progressively; a missing field just means that
// particular service's qty can't be resolved yet (resolveServiceQty in
// marketplace-lawncare-pricing.utils.ts).
@Entity('marketplace_lawncare_property_profiles')
export class MarketplaceLawncarePropertyProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column({ unique: true })
  customerId: string;

  // Which of MarketplaceLawncareService's lawn_mowing.sizeTiers entries the
  // customer picked (a dropdown selection, e.g. "XS"/"S"/... — not a raw SF
  // number). Special-cased vs. the generic fieldValues below because it
  // drives Lawn Mowing's tiered pricing directly, not just a service qty.
  @Column({ nullable: true })
  propertySizeTier: string | null;

  // Derived automatically from propertySizeTier's maxSF whenever the tier
  // changes (see MarketplaceService.upsertLawncarePropertyProfile) — kept so
  // leaf_removal's existing qty formula (a continuous SF number) needs no
  // changes. Never set directly by the customer anymore.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  propertySizeSqFt: number | null;

  // Every other property-detail measurement (shrub count, bed sq ft, gutter
  // linear ft, tree counts, ...) — admin-manageable field set (add/remove/
  // reorder/relabel via MarketplaceLawncarePropertyDetailField), so a fixed
  // column per field can't work: this stores { [fieldKey]: value }. Field
  // `key`s are stable identifiers resolveServiceQty() reads by name — admin
  // can freely rename a field's label/unit, but deleting a field a service
  // depends on (e.g. shrubPlantCount for shrub_trimming) makes that
  // service's quantity resolve to 0 going forward, same as if it were never
  // filled in.
  @Column({ type: 'jsonb', default: {} })
  fieldValues: Record<string, number>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
