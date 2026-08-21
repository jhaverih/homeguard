import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { SensorRole, MeasurementType } from '../../common/enums/sensor-role.enum';

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
  @Column({ type: 'timestamp' }) observedAt: Date;
  @Column({ type: 'timestamp' }) receivedAt: Date;
  @CreateDateColumn() createdAt: Date;
}
