import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { CertificationType } from './vendor-capability.entity';

export enum CertificationReviewStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('vendor_certifications')
export class VendorCertification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: CertificationType })
  certificationType: CertificationType;

  @Column()
  licenseNumber: string;

  @Column({ nullable: true })
  issuingState: string;

  @Column({ type: 'timestamp' })
  expirationDate: Date;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
