import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { VendorCapability } from './vendor-capability.entity';

@Entity('vendor_capability_selections')
@Unique(['userId', 'capabilityId'])
export class VendorCapabilitySelection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  capabilityId: string;

  @ManyToOne(() => VendorCapability)
  @JoinColumn({ name: 'capabilityId' })
  capability: VendorCapability;

  @CreateDateColumn()
  createdAt: Date;
}
