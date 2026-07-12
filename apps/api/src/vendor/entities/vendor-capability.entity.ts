import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export enum CertificationType {
  NONE = 'NONE',
  HVAC = 'HVAC',
  ELECTRICAL = 'ELECTRICAL',
  PLUMBING = 'PLUMBING',
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
