import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('customer_profiles')
export class CustomerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.customerProfile)
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @Column()
  address: string;

  @Column()
  city: string;

  @Column()
  state: string;

  @Column()
  zipCode: string;

  @Column({ nullable: true, type: 'text' })
  homeDetails: string;

  // Geocoded from address/city/state/zipCode (see geocodeAddress in
  // common/utils/geocode.utils.ts) whenever the address is set/changed —
  // null until then (e.g. a profile whose address hasn't been touched since
  // this feature shipped). Copied onto each new ServiceRequest at creation,
  // used for GPS arrival-proximity checks and to sharpen the live-tracking
  // map beyond the old ZIP-centroid approximation.
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
