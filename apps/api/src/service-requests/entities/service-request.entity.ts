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

  @Column({ nullable: true, unique: true })
  ticketNumber: string;

  @Column({ default: false })
  isPaidAddon: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  addonPrice: number;

  // Nullable — set for standalone/additional-service requests created from the pricing
  // catalog; used to determine whether the job requires a vendor capability. Base
  // subscription inspections (created via create(), not createStandaloneService) leave
  // this null and stay open to any vendor.
  @Column({ nullable: true })
  servicePriceId: string | null;

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

  // True only for the dispatched "Home Monitoring Setup" job itself — used to
  // scope the vendor app's Yolink connect card to that one job, not every ticket.
  get isMonitoringSetupJob(): boolean {
    return (this.additionalServices ?? []).some((s) => s.name === 'Home Monitoring Setup');
  }

  // MinIO object keys uploaded by vendor as proof of completion (min 1 required)
  @Column({ type: 'simple-array', nullable: true })
  completionPhotoKeys: string[];

  // Vendor GPS location shared with customer when en route
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  vendorLatitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  vendorLongitude: number | null;

  @Column({ type: 'timestamp', nullable: true })
  vendorLocationAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  vendorEnRouteAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
