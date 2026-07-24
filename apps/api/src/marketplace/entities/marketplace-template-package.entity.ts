import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// A Subscription Package under a MarketplaceOfferTemplate. Unlike
// MarketplaceLawncarePackage/MarketplacePestPackage, there is no
// `composition` jsonb — which services are billed under this package is
// expressed on the service side instead (MarketplaceTemplateService.
// packageVisibility/packageIds), so monthlyPrice here is computed by
// summing that package's linked services, same idea as
// computePestPackageMonthlyPrice.
//
// bundleDiscountPercent: a structured alternative to free-text "Bundle:XX%"
// parsing — when a customer has this package active, every add-on service
// visible under it gets this % off, stacked additively with any other
// applicable discount (see marketplace-template-pricing.utils.ts).
@Entity('marketplace_template_packages')
export class MarketplaceTemplatePackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @Column()
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monthlyPrice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  bundleDiscountPercent: number;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
