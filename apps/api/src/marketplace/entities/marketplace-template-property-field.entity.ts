import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Admin-defined customer input field for a MarketplaceOfferTemplate (e.g.
// "Number of Rooms" / "sq ft") — direct mirror of
// MarketplaceLawncarePropertyDetailField, just template-scoped instead of a
// Lawncare-only singleton. A MarketplaceTemplateService references this by
// id (propertyFieldId/propertyField2Id) to say which field drives its
// billable quantity, replacing Pest/Lawncare's hardcoded per-service-key
// switch statements with an admin choice.
@Entity('marketplace_template_property_fields')
export class MarketplaceTemplatePropertyField {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

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
