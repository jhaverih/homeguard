import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// One Google Nest (Smart Device Management) authorization per customer —
// the homeowner's own Google account, granted via Google's Partner
// Connections Manager consent screen. Tied to the same provider-agnostic
// Home as their YoLink devices so a Nest thermostat and the YoLink drain-pan
// sensor on the same air handler share one HVAC-01 equipment row.
@Entity('nest_accounts')
export class NestAccount {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column() customerId: string;
  @Column() homeId: string;
  // AES-256-GCM via common/crypto/encryption.util — the long-lived OAuth
  // refresh token; access tokens (~1h) are only ever held in memory.
  // Cleared on disconnect.
  @Column({ type: 'text' }) refreshToken: string;
  @Column({ default: true }) isActive: boolean;
  @Column({ type: 'timestamp', nullable: true }) lastSyncAt: Date | null;
  @Column({ type: 'timestamp', nullable: true }) lastEventAt: Date | null;
  // Last sync/token failure, shown on the admin Monitoring Setup page (e.g.
  // "Google access was revoked — reconnect Nest"). Null when healthy.
  @Column({ type: 'text', nullable: true }) lastError: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
