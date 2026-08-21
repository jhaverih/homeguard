import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SensorRole } from '../../common/enums/sensor-role.enum';

export enum FindingSeverity {
  NORMAL = 'NORMAL',
  INFO = 'INFO',
  WATCH = 'WATCH',
  ATTENTION = 'ATTENTION',
  HIGH = 'HIGH',
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

// One row per rule-engine result, matching the standard event schema from
// the Attenteve IoT Analytics spec (section 22) — event_type/severity/
// confidence/reason_codes/supporting_measurements/recommended_actions.
// Deliberately separate from the existing Alert entity: findings carry
// baseline/confidence/reason-code structure Alert doesn't, and not every
// finding warrants a push notification (a WATCH-level trend is
// dashboard-only) — only customer-facing severities also create a real
// Alert via AlertsService, for the existing push/SMS/Monitoring-tab pipeline.
@Entity('analytics_findings')
export class AnalyticsFinding {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() customerId: string;
  @Column() yolinkHomeId: string;
  @Column({ nullable: true }) equipmentId: string | null;
  // Denormalized at write time (e.g. "HVAC-01", "WASHER-01") so admin/mobile
  // consumers never need a join just to label a finding by equipment.
  @Column({ nullable: true }) equipmentCode: string | null;
  // The provider-agnostic DeviceRegistry id (never a Yolink-specific
  // identifier) — matches the rest of the model's "analytics engine never
  // depends on a specific provider" principle.
  @Column({ nullable: true }) deviceRegistryId: string | null;
  @Column({ type: 'enum', enum: SensorRole, nullable: true }) sensorRole: SensorRole | null;
  // The rule ID from the spec, e.g. "HVAC-WATER-001" — a plain string
  // (not an enum) for the same reason analyticsRole is: new rules will be
  // added faster than an enum migration is worth doing.
  @Column() ruleId: string;
  // Rule group (e.g. "HVAC_WATER", "WASHER_WATER", "SENSOR_HEALTH") — lets
  // the mobile/admin pages filter without parsing ruleId strings.
  @Column({ nullable: true }) ruleGroup: string | null;
  @Column() eventType: string;
  @Column({ type: 'enum', enum: FindingSeverity }) severity: FindingSeverity;
  @Column({ type: 'enum', enum: FindingConfidence, default: FindingConfidence.LOW }) confidence: FindingConfidence;
  @Column({ type: 'enum', enum: FindingStatus, default: FindingStatus.ACTIVE }) status: FindingStatus;
  @Column() message: string;
  @Column({ type: 'jsonb', nullable: true }) measurements: Record<string, any> | null;
  // Singular reasonCode (spec's own schema field) alongside the plural array
  // kept for the mobile/admin consumers already reading reasonCodes[].
  @Column({ nullable: true }) reasonCode: string | null;
  @Column({ type: 'simple-array', default: '' }) reasonCodes: string[];
  @Column({ type: 'simple-array', default: '' }) recommendedActions: string[];
  @Column({ type: 'timestamp' }) detectedAt: Date;
  @Column({ type: 'timestamp', nullable: true }) resolvedAt: Date | null;
  @Column({ nullable: true }) linkedAlertId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
