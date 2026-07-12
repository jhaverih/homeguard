import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { ServiceRequest } from './service-request.entity';

@Entity('solar_quotes')
export class SolarQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ServiceRequest)
  @JoinColumn()
  serviceRequest: ServiceRequest;

  @Column()
  serviceRequestId: string;

  @Column()
  vendorId: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  systemSizeKw: number;

  @Column()
  numInverters: number;

  @Column()
  inverterManufacturer: string;

  @Column()
  inverterModel: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pvSystemPrice: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  storageSizeKwh: number | null;

  @Column({ nullable: true })
  storageManufacturer: string | null;

  @Column({ nullable: true })
  storageModel: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  storagePrice: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
