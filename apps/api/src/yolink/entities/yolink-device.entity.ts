import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { SensorRole } from '../../common/enums/sensor-role.enum';

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
  // Per-device auth token Yolink issues alongside Home.getDeviceList's own
  // metadata — required (as `token`, alongside `targetDevice`) to call the
  // real per-device live-state query, `<deviceType>.getState`. Confirmed
  // 2026-08-19 against a live account: Home.getDeviceList itself carries no
  // state/online/battery fields at all, only this token to unlock the call
  // that does.
  @Column({ nullable: true }) yolinkToken: string | null;
  @Column({ type: 'timestamp', nullable: true }) lastReportedAt: Date | null;
  // Yolink's own connectivity flag (from <deviceType>.getState, refreshed on
  // every Monitoring-tab load) — authoritative over lastReportedAt's staleness
  // for "is this device actually connected". Confirmed live 2026-08-20: a
  // LeakSensor sitting in normal/dry state can genuinely go 3+ hours between
  // MQTT reports while Yolink's cloud still reports it online — using report
  // age alone as the streaming signal produced false "disconnected" alerts
  // every ~30-90 min for a perfectly healthy sensor. Null until the first
  // successful getState call (e.g. a device only ever seen via MQTT, never
  // REST-refreshed yet).
  @Column({ nullable: true }) isOnline: boolean | null;
  @Column({ type: 'jsonb', nullable: true }) lastState: Record<string, any> | null;
  // Set when the scheduled disconnect check (YolinkService.checkDisconnectedSensors)
  // has already raised a "Sensor disconnected" alert for the device's current
  // silence, so it isn't re-raised every run — cleared as soon as the device
  // reports again (upsertDeviceState / refreshDeviceStates).
  @Column({ type: 'timestamp', nullable: true }) disconnectAlertedAt: Date | null;

  // ── Attenteve Analytics tagging (Room / Equipment / Sensor Role / Analytics
  // Role) — set once by YolinkNameTaggingRule auto-tagging or manual override,
  // and NEVER re-derived from `name` above, which the homeowner can freely
  // rename in the Yolink app. `deviceId` above (Yolink's device EUI) is the
  // immutable key these columns hang off of.
  @Column({ nullable: true }) room: string | null;
  @Column({ nullable: true }) equipmentId: string | null;
  @Column({ type: 'enum', enum: SensorRole, nullable: true }) sensorRole: SensorRole | null;
  // Rule-engine key (e.g. "hvac_condensate", "indoor_climate") — plain string,
  // not an enum, since new roles get added faster than an enum can be safely
  // migrated and nothing needs to switch on it exhaustively.
  @Column({ nullable: true }) analyticsRole: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
