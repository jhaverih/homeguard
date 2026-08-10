import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  BeforeInsert, BeforeUpdate,
} from 'typeorm';
import { PricingMethod } from '../../common/enums/pricing-method.enum';
import { ServiceCategory } from '../../common/enums/service-category.enum';
import { ServiceGroup } from '../../common/enums/service-group.enum';

@Entity('service_prices')
export class ServicePrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  basePrice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  markupPercent: number | null;

  // Replacing markupPercent (switching from a markup-on-cost model to a
  // gross-margin model, customerPrice = cost/(1-gmPercent/100)) — added
  // additively first so a one-time SQL copy can move existing figures across
  // before markupPercent is removed in a follow-up deploy, avoiding any
  // window where synchronize could drop data. See project memory.
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  gmPercent: number | null;

  @Column({ type: 'enum', enum: PricingMethod, default: PricingMethod.FLAT_PRICE })
  pricingMethod: PricingMethod;

  @Column({ default: false })
  requiresQuote: boolean;

  @Column({ type: 'text', nullable: true })
  quantityLabel: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minimumQuantity: number | null;

  // Tiered volume-discount pricing for PER_UNIT services — see
  // pricing.utils.ts calcTieredCost() for how these combine with basePrice
  // (the flat "Subcontractor Minimum Payout"). All null for other pricing
  // methods.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  includeQty: number | null; // units covered by basePrice before any per-unit charge applies

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  baseRateUnit: number | null; // per-unit rate for qty between includeQty and volumeDiscountThreshold

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeDiscountThreshold: number | null; // qty at which the cheaper rate kicks in; no 3rd tier if unset

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeDiscountRate: number | null; // per-unit rate beyond the threshold

  @Column({ default: true })
  isActive: boolean;

  // Nullable — services with no capability requirement are open to any vendor.
  @Column({ nullable: true })
  requiredCapabilityId: string | null;

  // Customer/admin-facing classification, distinct from (but usually paired
  // with) requiredCapabilityId — legacy catalog items stay uncategorized.
  @Column({ type: 'enum', enum: ServiceCategory, nullable: true })
  category: ServiceCategory | null;

  // Additive, multi-valued lifecycle-stage tagging (Inspect/Repair/Improve/
  // Maintain/Install) — orthogonal to `category` above (trade/domain), not a
  // replacement for it. A service can carry one or more of these.
  @Column({ type: 'simple-array', nullable: true })
  serviceGroups: ServiceGroup[] | null;

  // false for services only Attenteve triggers on a customer's behalf (e.g. Home
  // Monitoring Setup) — hidden from the customer's own "request a service" list.
  @Column({ default: true })
  customerRequestable: boolean;

  // Marks the catalog row (expected: exactly one, "General Inspection") that
  // draws from the same subscription.inspectionsPerYear pool as the built-in
  // Inspection tab, instead of always charging its listed price — see
  // ServiceRequestsService.getInspectionsRemaining().
  @Column({ default: false })
  isQuotaInspection: boolean;

  // Which InspectionChecklistGroup.key a standalone booking of this catalog item
  // resolves to (e.g. "HVAC Full Inspection" -> HVAC_FULL_INSPECTION) — null for
  // every non-inspection catalog item. See ServiceRequestsService.createStandaloneService().
  @Column({ nullable: true })
  checklistGroupKey: string | null;

  // Free-text admin notes on why this item is priced the way it is — separate
  // from the auto-generated formula reference shown alongside it in the admin
  // Pricing page, which is derived live from the fields above and never stored.
  @Column({ type: 'text', nullable: true })
  formulaDescription: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Keeps the legacy "Quote Only" boolean and the pricingMethod dropdown from
  // ever disagreeing, regardless of which one a caller sets directly.
  @BeforeInsert()
  @BeforeUpdate()
  syncQuoteFields() {
    if (this.requiresQuote) {
      this.pricingMethod = PricingMethod.REQUEST_QUOTE;
    } else if (this.pricingMethod === PricingMethod.REQUEST_QUOTE) {
      this.requiresQuote = true;
    }
  }

  // A single fixed fee never has a meaningful unit count — clear any stray
  // Unit Label so Flat Price / One-Time Fee rows can't carry one. PER_UNIT
  // and REQUEST_QUOTE rows (e.g. HVAC, where a unit count is quote context
  // rather than a price multiplier) may both keep a real Unit Label.
  @BeforeInsert()
  @BeforeUpdate()
  syncUnitLabel() {
    if (this.pricingMethod === PricingMethod.FLAT_PRICE || this.pricingMethod === PricingMethod.ONE_TIME_FEE) {
      this.quantityLabel = 'NONE';
    }
  }

  // Base Rate/Unit only has a real meaning for Per Unit pricing (see
  // calcTieredCost) — a Flat Price row's value is always ignored by the real
  // formula, so it's cleared here rather than left to silently do nothing.
  // Per Unit rows billed by the Hour specifically get it auto-derived from
  // basePrice/includeQty rather than admin-entered, since "$/hour" should
  // always agree with the item's own flat first-hour price, not drift from it.
  @BeforeInsert()
  @BeforeUpdate()
  syncBaseRateUnit() {
    if (this.pricingMethod === PricingMethod.FLAT_PRICE) {
      this.baseRateUnit = null;
    } else if (this.pricingMethod === PricingMethod.PER_UNIT && this.quantityLabel === 'HOUR') {
      const include = this.includeQty != null ? Number(this.includeQty) : 1;
      this.baseRateUnit = include !== 0 ? Number(this.basePrice) / include : null;
    }
  }
}
