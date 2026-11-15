import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { CertificationReviewStatus } from './vendor-certification.entity';

// A vendor company's business registration in one U.S. state. A company needs
// one for every state it serves (the states of its service counties), and is
// only shown to customers in states whose registration is APPROVED.
//
// One row per company + state. Uploading a new document for a state replaces
// the document on that row and reads it again.
//
// Statuses reuse the license ones:
//   READING         the AI laptop is reading the document
//   PENDING_REVIEW  read and every check passed ("pending verification")
//   NEEDS_REVIEW    read, but something needs an admin's closer look
//   APPROVED        an admin approved it (or the application was approved)
//   REJECTED        not accepted (e.g. the business is dissolved in that state)
//   EXPIRED         a temporary "already serving here" pass ran out (graceUntil)
@Entity('vendor_state_registrations')
@Index(['companyId', 'state'], { unique: true })
export class VendorStateRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: string;

  // The state this registration is for (two-letter code, e.g. TN).
  @Column({ length: 2 })
  state: string;

  // Null only for a temporary pass given to vendors already serving a state
  // when this rule started (see graceUntil).
  @Column({ type: 'varchar', nullable: true })
  documentKey: string | null;

  @Column({ type: 'enum', enum: CertificationReviewStatus, default: CertificationReviewStatus.READING })
  status: CertificationReviewStatus;

  // Vendors already approved and serving a state when registrations became
  // per-state may keep serving it without a document until this date.
  @Column({ type: 'timestamp', nullable: true })
  graceUntil: Date | null;

  // ── What the AI reader found on the document ──
  @Column({ type: 'varchar', nullable: true })
  businessName: string | null;

  @Column({ type: 'varchar', nullable: true })
  entityNumber: string | null;

  // The state printed on the document (may differ from `state` above).
  @Column({ type: 'varchar', nullable: true })
  registeredState: string | null;

  // active / inactive / dissolved / revoked, as printed.
  @Column({ type: 'varchar', nullable: true })
  registrationStatus: string | null;

  @Column({ type: 'date', nullable: true })
  formationDate: string | null;

  @Column({ type: 'varchar', nullable: true })
  extractionConfidence: string | null;

  // The reader's full answer, kept for the admin and for troubleshooting.
  @Column({ type: 'jsonb', nullable: true })
  extraction: Record<string, unknown> | null;

  // Plain-English reasons it needs review or wasn't accepted.
  @Column({ type: 'jsonb', nullable: true })
  reviewReasons: string[] | null;

  @Column({ type: 'timestamp', nullable: true })
  extractedAt: Date | null;

  // ── Admin review ──
  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ type: 'varchar', nullable: true })
  reviewedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
