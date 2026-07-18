import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { ServiceRequest } from './service-request.entity';

@Entity('additional_services')
export class AdditionalService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ServiceRequest, (r) => r.additionalServices)
  @JoinColumn()
  serviceRequest: ServiceRequest;

  @Column()
  serviceRequestId: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  // Nullable — only set when this row was created from a catalog ServicePrice
  // (createStandaloneService); ad-hoc vendor upsells with a custom price have
  // no catalog backing and leave this null.
  @Column({ nullable: true })
  servicePriceId: string | null;

  // The quantity actually billed at booking time (Qty floored at
  // minimumQuantity), for Per Unit services. Persisted so job completion can
  // compare against a vendor-entered final quantity.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  quantity: number | null;

  // Vendor-entered/confirmed quantity at job completion, if it differs from
  // `quantity` — see ServiceRequestsService.updateStatus.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  finalQuantity: number | null;

  @Column({ default: false })
  approved: boolean;

  // True when this line item was booked against the plan's included
  // inspection quota (its source ServicePrice.isQuotaInspection was true and
  // quota remained at booking time) — price is 0 and no charge/auth-hold is
  // created for it at completion; see ServiceRequestsService.updateStatus.
  @Column({ default: false })
  isQuotaCovered: boolean;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
