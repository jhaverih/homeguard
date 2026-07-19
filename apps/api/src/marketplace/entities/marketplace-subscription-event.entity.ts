import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { MarketplaceEventType } from '../enums/marketplace.enum';

// Append-only renewal/lifecycle history, written by
// MarketplaceService.handleSubscriptionWebhook on every relevant Stripe
// event — this is what makes future reporting (MRR, renewal history, churn
// by date) possible without depending on cross-referencing Stripe's own
// dashboard.
@Entity('marketplace_subscription_events')
export class MarketplaceSubscriptionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  marketplaceSubscriptionId: string;

  @Column({ type: 'enum', enum: MarketplaceEventType })
  type: MarketplaceEventType;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
