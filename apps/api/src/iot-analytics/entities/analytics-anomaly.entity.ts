import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// A statistical anomaly candidate (spec §4.5) — evidence only. Never a
// finding, never an alert, never an input to component health: in shadow
// mode it is stored and shown to technicians, nothing more. Rule findings
// stay authoritative for their conditions.
@Entity('analytics_anomalies')
@Index(['deviceRegistryId', 'type', 'startedAt'], { unique: true })
export class AnalyticsAnomaly {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() customerId: string;
  @Column() homeId: string;
  @Column({ nullable: true }) equipmentId: string | null;
  @Column({ nullable: true }) deviceRegistryId: string | null;
  @Column() sensorRole: string;
  @Column() component: string;
  // ISOLATED | RAPID_CHANGE | PERSISTENT | DRIFT | SENSOR_QUALITY | ENERGY_ADVISORY
  @Column() type: string;
  // ACTIVE | RESOLVED | UNCONFIRMED
  @Index() @Column() state: string;
  @Column({ type: 'timestamp' }) startedAt: Date;
  @Column({ type: 'timestamp' }) lastObservedAt: Date;
  @Column({ type: 'timestamp', nullable: true }) resolvedAt: Date | null;
  @Column({ type: 'float', nullable: true }) observed: number | null;
  @Column({ type: 'jsonb', nullable: true }) baseline: { median: number; mad: number; n: number; windowDays?: number } | null;
  @Column({ type: 'float', nullable: true }) deviation: number | null;
  @Column() unit: string;
  @Column({ type: 'float', nullable: true }) robustZ: number | null;
  @Column({ type: 'int', default: 1 }) consecutive: number;
  @Column() method: string;
  @Column() detectorVersion: string;
  @Column() configVersion: string;
  // Preprocessing facts for the series: gaps, duplicates, out-of-order, freshness.
  @Column({ type: 'jsonb', nullable: true }) dataQuality: Record<string, any> | null;
  // Operating context used (mode, outdoor band, time-in-cycle) + reducedContext.
  @Column({ type: 'jsonb', nullable: true }) context: Record<string, any> | null;
  @Column({ type: 'jsonb', nullable: true }) supporting: Record<string, any> | null;
  @Column({ default: false }) transition: boolean;
  @Column({ default: true }) shadow: boolean;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
