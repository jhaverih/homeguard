import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per physical Yolink device — the catalog (deviceType/name) is
// seeded from Home.getDeviceList at link time and refreshed on every MQTT
// reconnect; lastReportedAt/lastState are kept live from two sources: every
// incoming MQTT message (report or alert, see YolinkService.upsertDeviceState)
// and a best-effort REST reseed on each customer Monitoring-tab load (see
// YolinkService.refreshDeviceStates). Nothing here is Yolink-account-global —
// scoped to one YolinkHome via yolinkHomeId (that table's own `id`, not
// Yolink's own home id).
@Entity('yolink_devices')
export class YolinkDevice {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() yolinkHomeId: string;
  @Column() deviceId: string;
  @Column() deviceType: string;
  @Column() name: string;
  @Column({ type: 'timestamp', nullable: true }) lastReportedAt: Date | null;
  @Column({ type: 'jsonb', nullable: true }) lastState: Record<string, any> | null;
  // Set when the scheduled disconnect check (YolinkService.checkDisconnectedSensors)
  // has already raised a "Sensor disconnected" alert for the device's current
  // silence, so it isn't re-raised every run — cleared as soon as the device
  // reports again (upsertDeviceState / refreshDeviceStates).
  @Column({ type: 'timestamp', nullable: true }) disconnectAlertedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
