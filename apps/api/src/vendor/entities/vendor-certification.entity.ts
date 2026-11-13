import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { CertificationType } from './vendor-capability.entity';

// Life of a license on file:
//   READING          the AI engine is still reading the uploaded document
//   PENDING_REVIEW   read cleanly; waiting for an admin to verify ("pending verification")
//   NEEDS_REVIEW     read, but something needs a closer look (see reviewReasons)
//   APPROVED         an admin verified it
//   REJECTED         not accepted (including licenses that were already expired at upload)
//   EXPIRED          was valid, but its expiry date has passed (set by the daily job)
export enum CertificationReviewStatus {
  READING = 'READING',
  PENDING_REVIEW = 'PENDING_REVIEW',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

@Entity('vendor_certifications')
export class VendorCertification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: CertificationType })
  certificationType: CertificationType;

  // Nullable: a license still being read, or one the AI couldn't fully read,
  // may not have these yet.
  @Column({ nullable: true })
  licenseNumber: string | null;

  @Column({ nullable: true })
  issuingState: string;

  @Column({ type: 'timestamp', nullable: true })
  expirationDate: Date | null;

  // ── Fields read from the document by the license reader ────────────────
  // (services/license-reader on the AI laptop; see licenses/license-reading.service.ts)
  @Column({ type: 'date', nullable: true })
  issueDate: string | null;

  @Column({ nullable: true })
  holderName: string | null;

  @Column({ nullable: true })
  businessName: string | null;

  // License type exactly as printed (e.g. "Class A Air Conditioning Contractor").
  @Column({ nullable: true })
  extractedLicenseType: string | null;

  // high | medium | low, as judged by the reader.
  @Column({ nullable: true })
  extractionConfidence: string | null;

  // The reader's full answer, kept for the admin and for troubleshooting.
  @Column({ type: 'jsonb', nullable: true })
  extraction: Record<string, unknown> | null;

  // Plain-English reasons this license needs a closer look (shown to admins).
  @Column({ type: 'jsonb', nullable: true })
  reviewReasons: string[] | null;

  @Column({ type: 'timestamp', nullable: true })
  extractedAt: Date | null;

  @Column()
  documentKey: string;

  @Column({ type: 'enum', enum: CertificationReviewStatus, default: CertificationReviewStatus.PENDING_REVIEW })
  status: CertificationReviewStatus;

  @Column({ nullable: true })
  reviewedByUserId: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  reviewNotes: string;

  // Last expiry notice emailed for this license: 60/30/7 days, or 0 once the
  // "expired" notice went out. Cleared when the expiry date changes.
  // See credentials/credential-expiry.ts.
  @Column({ type: 'int', nullable: true })
  reminderSentDays: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
