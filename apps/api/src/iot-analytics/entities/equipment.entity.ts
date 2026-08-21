import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { EquipmentType } from '../../common/enums/sensor-role.enum';

// A home can have more than one HVAC system (or washer, etc.) — equipmentCode
// (e.g. "HVAC-01") is the stable, human-readable key the rest of the system
// (findings, reason codes, rule definitions) keys off of, matching the
// spec's own equipment IDs. `HOME` is the pseudo-equipment type for
// whole-house sensors (indoor temperature) that aren't tied to one physical
// appliance.
@Entity('iot_equipment')
@Index(['homeId', 'equipmentCode'], { unique: true })
export class Equipment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() homeId: string;
  @Column({ type: 'enum', enum: EquipmentType }) equipmentType: EquipmentType;
  @Column() equipmentNumber: string;
  @Column() equipmentCode: string;
  @Column({ nullable: true }) displayName: string | null;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any> | null;
  @CreateDateColumn() createdAt: Date;
}
