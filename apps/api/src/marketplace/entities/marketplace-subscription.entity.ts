import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CleaningType, VisitFrequency, MarketplaceSubscriptionStatus } from '../enums/marketplace.enum';

// One row per customer's House Cleaning (or future Marketplace vertical)
// enrollment. Billed monthly via a real Stripe recurring Subscription
// regardless of visitFrequency (a weekly-visit plan still charges once a
// month) — see MarketplaceService.subscribe. computedMonthlyPrice/
// computedPerVisitPrice are snapshots taken at signup and never
// recalculated when the config tables change later, honoring the 12-month
// price lock (priceLockedUntil).
@Entity('marketplace_subscriptions')
export class MarketplaceSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column()
  customerId: string;

  @Column({ type: 'enum', enum: CleaningType })
  cleaningType: CleaningType;

  @Column({ type: 'enum', enum: VisitFrequency })
  visitFrequency: VisitFrequency;

  // Keyed by MarketplaceRoomUnit.key, e.g. { bedroom: 3, bathroom_full: 2 }.
  @Column({ type: 'jsonb' })
  houseConfig: Record<string, number>;

  // Selected MarketplaceConditionMultiplier keys — exactly one base-tier key
  // plus zero or more stacking-modifier keys.
  @Column({ type: 'simple-array' })
  conditions: string[];

  // Selected MarketplaceAddOn keys with an optional quantity for perUnit ones.
  @Column({ type: 'jsonb', default: [] })
  addOns: { key: string; qty?: number }[];

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  computedPerVisitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  computedMonthlyPrice: number;

  @Column({ type: 'timestamp' })
  priceLockedUntil: Date;

  @Column({ type: 'enum', enum: MarketplaceSubscriptionStatus, default: MarketplaceSubscriptionStatus.ACTIVE })
  status: MarketplaceSubscriptionStatus;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'timestamp' })
  nextVisitDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastVisitGeneratedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
