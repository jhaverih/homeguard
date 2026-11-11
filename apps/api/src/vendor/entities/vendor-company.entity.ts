import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

// INCOMPLETE: registered, still filling in the onboarding checklist — never
// seen by reviewers as a submission. PENDING_REVIEW is only reached through
// VendorOnboardingService.submit(), once every checklist item is complete.
export enum VendorApplicationStatus {
  INCOMPLETE = 'INCOMPLETE',
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

  // Last insurance expiry notice emailed: 60/30/7 days, or 0 once the
  // "expired" notice went out. Cleared when a renewed certificate is saved.
  @Column({ type: 'int', nullable: true })
  coiReminderSentDays: number | null;

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

  @Column({ type: 'enum', enum: VendorApplicationStatus, default: VendorApplicationStatus.INCOMPLETE })
  applicationStatus: VendorApplicationStatus;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  // Checklist items a reviewer sent back with NEEDS_INFO, each with its note.
  // Only these items reopen for editing; `resolved` flips once the vendor
  // changes that item, and every entry must be resolved before resubmitting.
  @Column({ type: 'jsonb', nullable: true })
  needsInfoItems: { key: string; note: string; resolved: boolean }[] | null;

  // Background-check and drug-test responsibility statement (see
  // common/constants/vendor-background-check.ts) — the version accepted and
  // the typed name/title of whoever signed it for the company.
  @Column({ nullable: true })
  backgroundCheckVersion: string | null;

  @Column({ type: 'timestamp', nullable: true })
  backgroundCheckAcceptedAt: Date | null;

  @Column({ nullable: true })
  backgroundCheckSignerName: string | null;

  @Column({ nullable: true })
  backgroundCheckSignerTitle: string | null;

  @Column({ nullable: true })
  backgroundCheckAcceptedByUserId: string | null;

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
