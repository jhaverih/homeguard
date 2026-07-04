import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { ServiceRequest } from './service-request.entity';
import { DisputeCategory, DisputeStatus } from '../../common/enums/role.enum';

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ServiceRequest)
  @JoinColumn()
  serviceRequest: ServiceRequest;

  @Column()
  serviceRequestId: string;

  @Column()
  customerId: string;

  @Column()
  vendorId: string;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ type: 'enum', enum: DisputeCategory })
  category: DisputeCategory;

  @Column({ type: 'text' })
  description: string;

  // MinIO object keys for customer-submitted evidence photos
  @Column({ type: 'simple-array', nullable: true })
  photoKeys: string[];

  @Column({ type: 'enum', enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;
}
