import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum CertificationType {
  NONE = 'NONE',
  HVAC = 'HVAC',
  ELECTRICAL = 'ELECTRICAL',
  PLUMBING = 'PLUMBING',
  ROOFING = 'ROOFING',
  GENERAL_CONTRACTOR = 'GENERAL_CONTRACTOR',
  NABCEP = 'NABCEP',
  PEST_CONTROL = 'PEST_CONTROL',
  LANDSCAPING = 'LANDSCAPING',
  PAINTING = 'PAINTING',
  POOL = 'POOL',
  OTHER = 'OTHER',
}

@Entity('vendor_capabilities')
export class VendorCapability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'enum', enum: CertificationType, default: CertificationType.NONE })
  requiredCertificationType: CertificationType;

  @Column({ default: true })
  isActive: boolean;

  // Link to internal training material a vendor must read before selecting
  // this capability — not a trade license (see VendorCertification for that).
  @Column({ nullable: true })
  trainingDocumentUrl: string | null;

  @Column({ default: false })
  requiresAcknowledgment: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
