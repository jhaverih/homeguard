import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// A correlated HVAC event (spec §5): related rule findings and statistical
// anomalies grouped by component domain and time. Members keep their own
// IDs and evidence; the event adds grouping, a single lifecycle and a
// notification watermark so one unresolved condition isn't re-announced.
@Entity('analytics_events')
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() customerId: string;
  @Column() homeId: string;
  @Column({ nullable: true }) equipmentId: string | null;
  @Column() component: string;
  @Column({ type: 'simple-array' }) components: string[];
  // EQUIPMENT | SENSOR | ENERGY
  @Column() category: string;
  // ACTIVE | RESOLVED
  @Index() @Column() status: string;
  @Column({ type: 'timestamp' }) startedAt: Date;
  @Column({ type: 'timestamp' }) lastOccurrenceAt: Date;
  @Column({ type: 'timestamp', nullable: true }) resolvedAt: Date | null;
  // From contributing RULE findings only — statistics never set severity.
  @Column() severity: string;
  @Column({ type: 'jsonb', default: () => "'[]'" }) findingIds: string[];
  @Column({ type: 'jsonb', default: () => "'[]'" }) anomalyIds: string[];
  @Column({ type: 'text', nullable: true }) disagreement: string | null;
  @Column() evidenceHash: string;
  @Column({ type: 'varchar', nullable: true }) notifiedSeverity: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
