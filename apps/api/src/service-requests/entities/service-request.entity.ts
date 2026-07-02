import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CustomerSubscription } from '../../subscriptions/entities/customer-subscription.entity';
import { AdditionalService } from './additional-service.entity';
import { ServiceRequestStatus } from '../../common/enums/role.enum';

export enum ServiceType {
  SCHEDULED_INSPECTION = 'SCHEDULED_INSPECTION',
  ADDITIONAL_SERVICE = 'ADDITIONAL_SERVICE',
}

@Entity('service_requests')
export class ServiceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column()
  customerId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  vendor: User;

  @Column({ nullable: true })
  vendorId: string;

  @ManyToOne(() => CustomerSubscription)
  @JoinColumn()
  subscription: CustomerSubscription;

  @Column()
  subscriptionId: string;

  @Column({ type: 'enum', enum: ServiceType, default: ServiceType.SCHEDULED_INSPECTION })
  type: ServiceType;

  @Column({
    type: 'enum',
    enum: ServiceRequestStatus,
    default: ServiceRequestStatus.PENDING,
  })
  status: ServiceRequestStatus;

  @Column({ type: 'timestamp' })
  preferredDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  scheduledDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ nullable: true, type: 'text' })
  customerNotes: string;

  @Column({ nullable: true, type: 'text' })
  vendorNotes: string;

  @Column()
  address: string;

  @Column()
  city: string;

  @Column()
  state: string;

  @Column()
  zipCode: string;

  @OneToMany(() => AdditionalService, (s) => s.serviceRequest)
  additionalServices: AdditionalService[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
