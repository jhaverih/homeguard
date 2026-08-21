import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Provider-agnostic home identity — the root every DeviceRegistry/Equipment
// row hangs off of, so a second provider (Home Assistant/Zigbee/Matter/
// Z-Wave) or a second physical home later never requires re-plumbing
// anything downstream. One row per customer today (IotAnalyticsMigrationService
// backfills exactly one of these per existing YolinkHome) — this does NOT
// replace YolinkHome, which stays the Yolink-specific credentials/connection
// record; this is the provider-agnostic concept it feeds into.
@Entity('iot_homes')
export class Home {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() customerId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'customerId' }) customer: User;
  @Column() name: string;
  @Column({ default: 'America/Chicago' }) timezone: string;
  @Column({ type: 'jsonb', nullable: true }) address: Record<string, any> | null;
  @CreateDateColumn() createdAt: Date;
}
