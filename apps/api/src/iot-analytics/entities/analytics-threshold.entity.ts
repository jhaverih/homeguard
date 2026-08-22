import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// One row per (key, customerId) — customerId NULL is the platform-wide
// default, a non-null customerId is a per-customer override that takes
// precedence over it. Every numeric threshold an analytics rule compares
// against lives here instead of as a literal in the rule's own code, per
// the "no hardcoded thresholds" requirement — THRESHOLD_DEFINITIONS
// (threshold-definitions.ts) is only the catalog of known keys/defaults/
// bounds, never the value actually read at evaluation time.
@Entity('analytics_thresholds')
@Index(['key', 'customerId'])
export class AnalyticsThreshold {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() key: string;
  @Column({ nullable: true }) customerId: string | null;
  @Column('float') value: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
