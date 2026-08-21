import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum DeviceRegistryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

// The immutable physical-device identity table — (provider, providerDeviceId)
// is the only key that survives a homeowner renaming the device in the
// Yolink app, or a future provider swapping in a replacement unit for the
// same role. Everything editable (display name/room) and everything
// semantic (equipment/sensor role — see SensorAssignment) is deliberately
// kept OFF this table; the analytics engine never reads currentProviderName
// below for anything except classification at onboarding time.
@Entity('device_registry')
@Index(['provider', 'providerDeviceId'], { unique: true })
export class DeviceRegistry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() homeId: string;
  // Plain string, not an enum — 'yolink' today; a future provider
  // ('home_assistant', 'zigbee', 'matter', 'zwave') shouldn't require a
  // schema migration to onboard.
  @Column() provider: string;
  // The provider's own immutable device identifier (Yolink's device EUI).
  @Column() providerDeviceId: string;
  @Column({ nullable: true }) providerDeviceType: string | null;
  @Column({ nullable: true }) providerModel: string | null;
  // Display info — editable, and used ONLY by ClassificationService at
  // onboarding time. Never queried by the analytics/rules engine.
  @Column({ nullable: true }) currentProviderName: string | null;
  @Column({ nullable: true }) currentProviderRoom: string | null;
  @Column({ type: 'timestamp', nullable: true }) firstSeenAt: Date | null;
  @Column({ type: 'timestamp', nullable: true }) lastSeenAt: Date | null;
  @Column({ type: 'enum', enum: DeviceRegistryStatus, default: DeviceRegistryStatus.ACTIVE }) status: DeviceRegistryStatus;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
