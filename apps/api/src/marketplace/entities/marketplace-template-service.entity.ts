import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TemplateServicePackageVisibility {
  ALWAYS = 'ALWAYS',
  PACKAGE_ONLY = 'PACKAGE_ONLY',
}

// An Add-on Service under a MarketplaceOfferTemplate. Same field set as
// MarketplacePestService (base + per-unit + a second scaling dimension +
// volume-discount threshold/rate ×2), plus fields that generalize what Pest
// hardcodes in marketplace-pest-pricing.utils.ts into admin choices:
//
// - propertyFieldId / propertyField2Id: which MarketplaceTemplatePropertyField
//   drives this service's dimension-1 / dimension-2 billable quantity,
//   replacing Pest's hardcoded HOME_SQFT_SERVICE_KEYS/ACREAGE_SERVICE_KEYS
//   Sets and DUAL_AXIS_SERVICE_KEYS.
// - factorIds: which MarketplaceTemplateFactor rows apply to this service
//   ("1 or more conditions", additive stacking).
// - packageVisibility/packageIds: whether this service is always
//   requestable standalone, or only shown/billed when the customer has one
//   of the listed packages active (also the gate for that package's
//   bundleDiscountPercent applying).
//
// Unlike Pest's admin table, Threshold2/Rate2 are exposed here too — no
// seed-only precedent forces hiding them, this is fully self-service.
@Entity('marketplace_template_services')
export class MarketplaceTemplateService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column()
  pricingUnit: string;

  @Column()
  recommendedFrequency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subCostBase: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subCostPerUnit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subCostPerUnit2: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  customerPriceBase: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  customerPricePerUnit: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  customerPricePerUnit2: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  includedQty: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  includedQty2: number;

  @Column({ nullable: true })
  propertyFieldId: string | null;

  @Column({ nullable: true })
  propertyField2Id: string | null;

  @Column({ type: 'simple-array', default: '' })
  factorIds: string[];

  @Column({ type: 'enum', enum: TemplateServicePackageVisibility, default: TemplateServicePackageVisibility.ALWAYS })
  packageVisibility: TemplateServicePackageVisibility;

  @Column({ type: 'simple-array', default: '' })
  packageIds: string[];

  @Column({ type: 'text', default: '' })
  volumeDiscountText: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeDiscountThreshold1: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  volumeDiscountRate1: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumeDiscountThreshold2: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  volumeDiscountRate2: number | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
