import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { SensorRole, MeasurementType, ClassificationStatus } from '../../common/enums/sensor-role.enum';

// The Attenteve semantic mapping (device → equipment + sensor role) —
// strictly separate from DeviceRegistry's identity/display-info columns.
// The analytics engine reads ONLY this table (joined via equipmentId/
// sensorRole), never a device's live provider name. A device can expose
// more than one sensor capability (e.g. a combined temp+humidity sensor),
// so this is its own table rather than flat columns on DeviceRegistry — a
// device with no row here yet is "unclassified", queryable on its own.
@Entity('sensor_assignments')
@Index(['deviceRegistryId', 'sensorRole'], { unique: true })
export class SensorAssignment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() deviceRegistryId: string;
  @Column({ nullable: true }) equipmentId: string | null;
  @Column({ type: 'enum', enum: SensorRole }) sensorRole: SensorRole;
  // Rule-engine key (e.g. "HVAC_CONDENSATE") — plain string, not an enum,
  // since new roles get added faster than an enum migration is worth doing.
  @Column({ nullable: true }) analyticsRole: string | null;
  @Column({ type: 'enum', enum: MeasurementType }) measurementType: MeasurementType;
  @Column({ type: 'decimal', precision: 4, scale: 3, default: 1 }) classificationConfidence: number;
  @Column({ type: 'enum', enum: ClassificationStatus, default: ClassificationStatus.MANUALLY_SET }) classificationStatus: ClassificationStatus;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
