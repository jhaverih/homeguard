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
  businessTaxLicenseDocKey: string;

  @Column({ nullable: true })
  businessTaxLicenseState: string;

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
  // displayed in the admin portal. Distinct from baseZipCode below: this is
  // just for display/records, baseZipCode is what coverage-matching uses.
  @Column({ nullable: true })
  address: string | null;

  @Column({ nullable: true })
  city: string | null;

  @Column({ nullable: true })
  state: string | null;

  // Company's home-base ZIP + how far out they'll travel — the entire
  // service-area coverage model. Matched against zip-centroids.json via
  // haversineMiles() (common/utils/geo.utils.ts); no lat/long stored here
  // directly so there's a single source of truth for coordinates.
  @Column({ nullable: true })
  baseZipCode: string | null;

  @Column({ type: 'int', nullable: true, default: 25 })
  serviceRadiusMiles: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
