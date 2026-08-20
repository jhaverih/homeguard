import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SensorRole } from '../../common/enums/sensor-role.enum';

// Admin-managed lookup: when a Yolink device is first seen (or re-seen while
// still untagged) with a name matching `namePattern`, its Room/Equipment/
// SensorRole/AnalyticsRole get pre-filled from this row — see
// YolinkService.autoTagDevice(). A suggestion applied once at first-seen
// time, not a live sync — an installer/admin can always override afterward,
// and renaming the device in the Yolink app later never re-triggers this
// (tags hang off the immutable deviceId, not the name).
@Entity('yolink_name_tagging_rules')
export class YolinkNameTaggingRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  // Exact, case-insensitive match against the Yolink device name at
  // discovery time (e.g. "ATV HVAC Drain Pan"). Prefix/pattern matching can
  // be added later if the installer naming convention needs it.
  @Column({ unique: true }) namePattern: string;
  @Column() room: string;
  @Column() equipmentId: string;
  @Column({ type: 'enum', enum: SensorRole }) sensorRole: SensorRole;
  @Column() analyticsRole: string;
  @Column({ default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
