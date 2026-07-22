import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { MarketplaceSubscriptionStatus } from '../enums/marketplace.enum';

// One row per customer's Pest Control package subscription (Basic/Premium/
// Ultimate Protection). Billing-only, mirrors MarketplaceLawncarePackageSubscription
// exactly. packageKey also drives the membership-benefit checks in
// marketplace-pest-pricing.utils.ts (e.g. "Included with Ultimate").
@Entity('marketplace_pest_package_subscriptions')
export class MarketplacePestPackageSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column()
  customerId: string;

  @Column()
  packageKey: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  computedMonthlyPrice: number;

  @Column({ type: 'enum', enum: MarketplaceSubscriptionStatus, default: MarketplaceSubscriptionStatus.ACTIVE })
  status: MarketplaceSubscriptionStatus;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ nullable: true })
  stripeSubscriptionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
