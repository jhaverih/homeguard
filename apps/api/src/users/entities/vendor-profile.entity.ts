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

  @Column({ nullable: true })
  companyName: string;

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

  @Column({ type: 'varchar', default: 'STANDARD' })
  planTier: 'STANDARD' | 'ELITE';

  @Column({ type: 'timestamp', nullable: true })
  elitePlanExpiresAt: Date | null;

  // Every vendor user (Vendor Admin or Technician) belongs to a VendorCompany.
  // companyName/planTier/stripe* above are kept in sync with the company record
  // so existing read sites keep working; new code should read via companyId.
  @Column({ nullable: true })
  companyId: string;

  @Column({ default: false })
  isCompanyAdmin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
