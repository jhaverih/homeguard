import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@Entity('customer_subscriptions')
export class CustomerSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column()
  customerId: string;

  @ManyToOne(() => SubscriptionPlan, { eager: true })
  @JoinColumn()
  plan: SubscriptionPlan;

  @Column()
  planId: string;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Column({ default: 0 })
  inspectionsUsed: number;

  @Column()
  startDate: Date;

  @Column()
  endDate: Date;

  @Column({ nullable: true })
  stripeSubscriptionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get inspectionsRemaining(): number {
    return Math.max(0, (this.plan?.inspectionsPerYear ?? 2) - this.inspectionsUsed);
  }
}
