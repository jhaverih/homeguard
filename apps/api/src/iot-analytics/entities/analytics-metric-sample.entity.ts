import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// A generic, provider- and device-agnostic time series for DERIVED metrics
// that don't map to one physical sensor's raw reading — cooling/heating
// delta-T (needs two devices: return + supply), daily runtime minutes,
// indoor-temp variance, a power-draw "signature" sample, etc. Raw physical
// readings stay in TelemetryEvent (one row per device); this table is for
// anything BaselineService needs to compute a mean/stddev over, keyed by
// (equipmentId, metricKey) rather than a single deviceRegistryId, since a
// derived metric is a property of the equipment/home, not one sensor.
@Entity('analytics_metric_samples')
@Index(['equipmentId', 'metricKey', 'observedAt'])
export class AnalyticsMetricSample {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() customerId: string;
  @Column() equipmentId: string;
  // e.g. 'COOLING_DELTA_T', 'HEATING_DELTA_T', 'DAILY_RUNTIME_MINUTES',
  // 'INDOOR_TEMP_VARIANCE', 'COMPRESSOR_POWER_DRAW' — a plain string catalog
  // (not an enum) for the same reason ruleId/reasonCode are: new metrics
  // will be added faster than an enum migration is worth doing.
  @Column() metricKey: string;
  @Column('float') value: number;
  @Column({ type: 'jsonb', nullable: true }) context: Record<string, any> | null;
  @Column({ type: 'timestamp' }) observedAt: Date;
  @CreateDateColumn() createdAt: Date;
}
