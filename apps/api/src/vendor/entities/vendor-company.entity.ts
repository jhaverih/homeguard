import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { CertificationReviewStatus } from './vendor-certification.entity';

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

  // No longer collected or shown (EIN was removed from the platform);
  // kept so existing values aren't lost.
  @Column({ nullable: true })
  ein: string;

  // Superseded by per-state registrations (vendor-state-registration.entity.ts);
  // existing documents were moved there at startup. Kept for old app builds.
  @Column({ nullable: true })
  stateRegistrationDocKey: string;

  @Column({ nullable: true })
  coiDocumentKey: string;

  @Column({ type: 'timestamp', nullable: true })
  coiExpirationDate: Date | null;

  // ── Certificate of insurance, as read by the AI laptop ──
  // Same statuses as a license (READING → PENDING_REVIEW / NEEDS_REVIEW /
  // REJECTED, then APPROVED by an admin, EXPIRED by the daily job).
  @Column({ type: 'enum', enum: CertificationReviewStatus, nullable: true })
  coiStatus: CertificationReviewStatus | null;

  // The reader's answer: insured, insurer, policy, dates, limit, additional insured.
  @Column({ type: 'jsonb', nullable: true })
  coiExtraction: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  coiReviewReasons: string[] | null;

  @Column({ type: 'timestamp', nullable: true })
  coiExtractedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  coiReviewNotes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  coiReviewedAt: Date | null;

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

  // A test company (its whole team) only sees and gets told about test
  // customers' jobs, and is never offered to real customers
  // (common/test-accounts.ts). Set in the admin portal.
  @Column({ default: false })
  isTestAccount: boolean;

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
