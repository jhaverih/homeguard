import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('vendor_profiles')
export class VendorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.vendorProfile)
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @Column({ nullable: true, type: 'text' })
  bio: string;

  @Column({ nullable: true })
  serviceArea: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  totalJobs: number;

  @Column({ nullable: true })
  stripeConnectAccountId: string;

  @Column({ default: false })
  stripeOnboardingComplete: boolean;

  @Column({ default: true })
  isAvailable: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
