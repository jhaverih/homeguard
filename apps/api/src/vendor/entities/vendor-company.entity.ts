import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum VendorApplicationStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEEDS_INFO = 'NEEDS_INFO',
}

@Entity('vendor_companies')
export class VendorCompany {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  logoKey: string;

  @Column({ nullable: true })
  ein: string;

  @Column({ nullable: true })
  stateRegistrationDocKey: string;

  @Column({ nullable: true })
  coiDocumentKey: string;

  @Column({ type: 'timestamp', nullable: true })
  coiExpirationDate: Date | null;

  @Column({ type: 'varchar', default: 'STANDARD' })
  planTier: 'STANDARD' | 'ELITE';

  @Column({ type: 'timestamp', nullable: true })
  elitePlanExpiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  eliteRequestedAt: Date | null;

  @Column({ type: 'varchar', default: 'MANUAL' })
  assignmentMode: 'MANUAL' | 'ROUND_ROBIN';

  @Column({ nullable: true })
  stripeConnectAccountId: string;

  @Column({ default: false })
  stripeOnboardingComplete: boolean;

  @Column({ type: 'enum', enum: VendorApplicationStatus, default: VendorApplicationStatus.PENDING_REVIEW })
  applicationStatus: VendorApplicationStatus;

  @Column({ nullable: true })
  reviewedByUserId: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  reviewNotes: string;

  // Full mailing address — captured at vendor registration (see RegisterDto),
  // displayed in the admin portal. Display/records only — coverage matching
  // uses serviceCounties below, never this address.
  @Column({ nullable: true })
  address: string | null;

  @Column({ nullable: true })
  city: string | null;

  @Column({ nullable: true })
  state: string | null;

  @Column({ nullable: true })
  zipCode: string | null;

  // County FIPS codes (e.g. "47187") this company serves, restricted at save
  // time to states in ENABLED_SERVICE_STATES (common/config/enabled-service-
  // states.ts). The only service-area model — see service-area.service.ts.
  @Column('text', { array: true, nullable: true })
  serviceCounties: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
