import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';
import { PaymentStatus } from '../../common/enums/role.enum';

// Tracks Elite membership fee charges against a vendor's saved card. Kept
// separate from the customer-centric Payment entity (Payment.customerId is
// non-nullable and the whole entity models "customer pays, vendor is paid
// out" — a vendor-pays-the-platform row doesn't fit that shape without
// overloading the existing vendorId payout-recipient column with a second,
// conflicting meaning).
@Entity('vendor_membership_payments')
export class VendorMembershipPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  vendorCompanyId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ nullable: true, type: 'text' })
  failureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
