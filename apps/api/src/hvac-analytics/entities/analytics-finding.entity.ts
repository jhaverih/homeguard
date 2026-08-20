import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum FindingSeverity {
  INFO = 'INFO',
  WATCH = 'WATCH',
  ATTENTION = 'ATTENTION',
  HIGH_ATTENTION = 'HIGH_ATTENTION',
  CRITICAL = 'CRITICAL',
}

export enum FindingConfidence {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  VERY_HIGH = 'VERY_HIGH',
}

export enum FindingStatus {
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}

// One row per rule-engine result, matching the event schema from the
// Attenteve HVAC Analytics spec (section 16) — event_type/severity/
// confidence/measurements/reason_codes/recommended_actions. Deliberately
// separate from the existing Alert entity: findings carry baseline/
// confidence/reason-code structure Alert doesn't, and not every finding
// warrants a push notification (a WATCH-level trend is dashboard-only) —
// only CRITICAL findings also create a real Alert via AlertsService, for the
// existing push/SMS/Monitoring-tab pipeline.
@Entity('analytics_findings')
export class AnalyticsFinding {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() customerId: string;
  @Column() yolinkHomeId: string;
  @Column({ nullable: true }) equipmentId: string | null;
  @Column({ nullable: true }) yolinkDeviceId: string | null;
  // The rule ID from the spec, e.g. "HVAC-WATER-001" — a plain string
  // (not an enum) for the same reason analyticsRole is: new rules will be
  // added faster than an enum migration is worth doing.
  @Column() ruleId: string;
  @Column() eventType: string;
  @Column({ type: 'enum', enum: FindingSeverity }) severity: FindingSeverity;
  @Column({ type: 'enum', enum: FindingConfidence, default: FindingConfidence.LOW }) confidence: FindingConfidence;
  @Column({ type: 'enum', enum: FindingStatus, default: FindingStatus.ACTIVE }) status: FindingStatus;
  @Column() message: string;
  @Column({ type: 'jsonb', nullable: true }) measurements: Record<string, any> | null;
  @Column({ type: 'simple-array', default: '' }) reasonCodes: string[];
  @Column({ type: 'simple-array', default: '' }) recommendedActions: string[];
  @Column({ type: 'timestamp' }) detectedAt: Date;
  @Column({ type: 'timestamp', nullable: true }) resolvedAt: Date | null;
  @Column({ nullable: true }) linkedAlertId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
