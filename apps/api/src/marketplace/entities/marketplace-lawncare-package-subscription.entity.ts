import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { MarketplaceSubscriptionStatus } from '../enums/marketplace.enum';

// One row per customer's Lawncare package subscription (Essentials Lawn
// Care / Seasonal Maintenance Package / Premium Lawn Care). Billing-only —
// no recurring visit is auto-generated from this row (unlike
// MarketplaceSubscription's nextVisitDate/lastVisitGeneratedAt); customers
// get actual work done via the separate on-demand service booking flow.
// computedMonthlyPrice is a snapshot of the package's price at signup.
@Entity('marketplace_lawncare_package_subscriptions')
export class MarketplaceLawncarePackageSubscription {
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
