import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CustomerSubscription } from '../../subscriptions/entities/customer-subscription.entity';
import { AdditionalService } from './additional-service.entity';
import { ServiceRequestStatus } from '../../common/enums/role.enum';
import { getZipCentroid, haversineMiles } from '../../common/utils/geo.utils';

// How old a vendor GPS ping can be before an ETA is no longer trustworthy
// enough to show as a live number — past this, etaMinutes returns null
// rather than presenting a stale reading as current.
const ETA_STALE_THRESHOLD_MIN = 15;

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

  // Shared correlation id across every ServiceRequest created from the same
  // multi-service customer submission — lets a vendor claim the whole visit
  // in one action instead of multiple handymen each claiming one service.
  @Column({ nullable: true })
  bookingGroupId: string | null;

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

  // Set for a visit generated from a MarketplaceSubscription's recurring
  // cadence (MarketplaceVisitSchedulerService) — signals the completion-charge
  // flow (ServiceRequestsService.updateStatus) to skip creating a per-visit
  // PaymentIntent, since it's already covered by the subscription's monthly
  // Stripe charge.
  @Column({ nullable: true })
  marketplaceSubscriptionId: string | null;

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

  // Distance from the vendor's live GPS position to the service address's ZIP
  // centroid — not the customer's own device location, which may be anywhere
  // (work, another room of the house) and isn't a meaningful reference point
  // for "how far is the vendor from the property." Reuses the same free,
  // static ZIP-centroid lookup already built for service-area radius matching.
  get etaMinutes(): number | null {
    if (this.status !== ServiceRequestStatus.VENDOR_EN_ROUTE) return null;
    if (this.vendorLatitude == null || this.vendorLongitude == null) return null;
    if (!this.vendorLocationAt) return null;
    const locationAgeMin = (Date.now() - this.vendorLocationAt.getTime()) / 60000;
    if (locationAgeMin > ETA_STALE_THRESHOLD_MIN) return null;
    const dest = getZipCentroid(this.zipCode);
    if (!dest) return null;
    const distanceMiles = haversineMiles(Number(this.vendorLatitude), Number(this.vendorLongitude), dest.lat, dest.lng);
    const avgSpeedMph = 25; // matches the assumption used by the old client-side calc
    return Math.round((distanceMiles / avgSpeedMph) * 60);
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

  // Set once the stuck-in-VENDOR_EN_ROUTE cron safety net fires for this
  // request, so it only alerts admins once per incident rather than every
  // cron tick. Cleared whenever the request freshly re-enters VENDOR_EN_ROUTE.
  @Column({ type: 'timestamp', nullable: true })
  stuckJobAlertSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
