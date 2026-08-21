import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { EquipmentType, SensorRole, MeasurementType } from '../../common/enums/sensor-role.enum';

// The centrally-managed classification registry — nothing about
// name-to-role mapping is hardcoded elsewhere in the app (see
// ClassificationService). Seeded at startup from CLASSIFICATION_SEED and
// editable afterward without a code change (a future admin UI could manage
// these rows directly, same pattern YolinkNameTaggingRule used before it).
@Entity('sensor_classification_rules')
export class SensorClassificationRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) canonicalName: string;
  @Column({ type: 'simple-array', default: '' }) aliases: string[];
  // Provider device types (e.g. "LeakSensor", "THSensor") a match against
  // this rule is plausible for — classification downgrades to
  // NEEDS_CONFIRMATION if the actual device's type isn't in this list, even
  // on a high string-similarity match. Empty means "not capability-checked".
  @Column({ type: 'simple-array', default: '' }) expectedProviderDeviceTypes: string[];
  @Column({ type: 'enum', enum: EquipmentType }) equipmentType: EquipmentType;
  @Column() equipmentNumber: string;
  @Column({ type: 'enum', enum: SensorRole }) sensorRole: SensorRole;
  @Column() analyticsRole: string;
  @Column({ type: 'enum', enum: MeasurementType }) measurementType: MeasurementType;
  @Column({ type: 'simple-array', default: '' }) analyticsRuleGroups: string[];
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
