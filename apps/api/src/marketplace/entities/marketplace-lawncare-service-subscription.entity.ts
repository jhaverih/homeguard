import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { MarketplaceSubscriptionStatus } from '../enums/marketplace.enum';

// One row per customer's standalone Lawncare service subscription (today:
// Lawn Mowing at Weekly/Biweekly frequency — see isSubscribableFrequency()).
// Billing-only, same as MarketplaceLawncarePackageSubscription — no
// recurring visit is auto-generated from this row; the contractor is still
// paid per completed visit (computedPerVisitVendorPrice is a snapshot of
// that agreed rate for ops reference, not an automated payout).
@Entity('marketplace_lawncare_service_subscriptions')
export class MarketplaceLawncareServiceSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column()
  customerId: string;

  @Column()
  serviceKey: string;

  @Column()
  frequency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  computedMonthlyPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  computedPerVisitVendorPrice: number | null;

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
