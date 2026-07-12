import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type SolarConsultationStatus = 'REQUESTED' | 'VENDOR_COUNTER' | 'CONFIRMED' | 'COMPLETED' | 'DECLINED';

@Entity('solar_consultations')
export class SolarConsultation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  serviceRequestId: string;

  @Column({ nullable: true })
  solarQuoteId: string | null;

  @Column()
  vendorId: string;

  @Column()
  customerId: string;

  @Column({ default: 'REQUESTED' })
  status: SolarConsultationStatus;

  @Column({ type: 'timestamp', nullable: true })
  customerProposedDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  vendorProposedDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  confirmedDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
