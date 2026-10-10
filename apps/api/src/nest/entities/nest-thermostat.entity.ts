import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

// A Nest thermostat under a NestAccount, plus its last-known SDM trait state.
// Pub/Sub events carry only the traits that changed, so `traits` is the
// merged picture they're applied onto (see nest-traits.ts mergeTraits) —
// it's also how a repeated, unchanged HVAC status is told apart from a real
// HEATING→OFF transition. Each thermostat fans out into four DeviceRegistry
// rows (`<sdmDeviceId>:temperature|humidity|hvac|setpoint`), one per sensor role.
@Entity('nest_thermostats')
export class NestThermostat {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() nestAccountId: string;
  // Full SDM resource name: enterprises/<project>/devices/<id> — what
  // Pub/Sub events identify the device by.
  @Index({ unique: true }) @Column({ type: 'text' }) sdmDeviceName: string;
  @Column() sdmDeviceId: string;
  @Column() displayName: string;
  // The Google Home room the homeowner put it in ("1st Floor", "Upstairs") —
  // what alerts use to say which zone tripped.
  @Column({ type: 'text', nullable: true }) roomName: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) traits: Record<string, any>;
  // Which HVAC system this thermostat's zone belongs to (HVAC-<n>). Two
  // thermostats sharing a number = one multizone system (one air handler,
  // zone dampers); different numbers = separate systems. Set from the admin
  // Monitoring Setup page; the equipment's own metadata.verified flag gates
  // any analytics that combine zones (see hvac-configuration.ts).
  @Column({ default: '01' }) equipmentNumber: string;
  @Column({ type: 'timestamp', nullable: true }) lastEventAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
