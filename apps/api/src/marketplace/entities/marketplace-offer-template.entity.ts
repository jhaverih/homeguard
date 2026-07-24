import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// A self-service marketplace vertical an admin builds entirely from the
// admin UI (Subscription Packages + Service Properties + Service Factors +
// Add-on Services + Frequency Discounts, see the sibling MarketplaceTemplate*
// entities) — no code change required to add a new one, unlike House
// Cleaning/Lawncare/Pest Control which are each hand-written.
@Entity('marketplace_offer_templates')
export class MarketplaceOfferTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ nullable: true })
  requiredCapabilityId: string | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
