import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { SensorRole, MeasurementType } from '../../common/enums/sensor-role.enum';

export enum TelemetryDataQuality {
  VALID = 'VALID',
  INVALID = 'INVALID',
}

// Normalized telemetry — one row per analytics-relevant sensor report,
// translated into this common shape by the provider adapter (YolinkService,
// via TelemetryService.record) before the analytics engine ever sees it.
// Replaces SensorReading; only written for devices with a SensorAssignment,
// matching the previous table's same "tagged devices only" scope.
@Entity('telemetry_events')
@Index(['deviceRegistryId', 'observedAt'])
@Index(['homeId', 'sensorRole', 'observedAt'])
export class TelemetryEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() homeId: string;
  @Column() deviceRegistryId: string;
  @Column() provider: string;
  @Column() providerDeviceId: string;
  @Column({ type: 'enum', enum: SensorRole }) sensorRole: SensorRole;
  @Column({ type: 'enum', enum: MeasurementType }) measurementType: MeasurementType;
  // String so a water reading's "DETECTED"/"NORMAL" fits the same column as
  // a stringified temperature — numericValue below is the chartable/typed
  // counterpart for anything that is actually a number.
  @Column() value: string;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) numericValue: number | null;
  @Column({ nullable: true }) unit: string | null;
  @Column({ type: 'jsonb', nullable: true }) rawState: Record<string, any> | null;
  // Three distinct clocks: observedAt = when the SOURCE says the reading was
  // taken (vendor event timestamp when one is provided, else receipt time);
  // retrievedAt = when Attenteve fetched it from a vendor API by polling
  // (null for pushed events — MQTT, Pub/Sub); receivedAt = Attenteve
  // ingestion time.
  @Column({ type: 'timestamp' }) observedAt: Date;
  @Column({ type: 'timestamp', nullable: true }) retrievedAt: Date | null;
  @Column({ type: 'timestamp' }) receivedAt: Date;
  // INVALID = outside the physically plausible range for its measurement
  // type (see TelemetryService.qualityOf). Kept for audit, but every
  // analytics query reads VALID rows only — a bad reading is never treated
  // as a real temperature change.
  @Column({ type: 'enum', enum: TelemetryDataQuality, default: TelemetryDataQuality.VALID }) dataQuality: TelemetryDataQuality;
  @CreateDateColumn() createdAt: Date;
}
