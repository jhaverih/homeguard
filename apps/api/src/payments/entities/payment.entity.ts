import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';
import { PaymentStatus, PaymentType } from '../../common/enums/role.enum';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  serviceRequestId: string;

  @Column()
  customerId: string;

  @Column({ nullable: true })
  vendorId: string;

  @Column({ type: 'enum', enum: PaymentType, default: PaymentType.ADDITIONAL_SERVICE })
  type: PaymentType;

  @Column()
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  platformFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  stripeFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  vendorAmount: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ nullable: true, type: 'text' })
  stripeClientSecret: string;

  @Column({ nullable: true })
  stripeTransferId: string;

  @Column({ nullable: true })
  disputeWindowExpiresAt: Date;

  @Column({ nullable: true })
  capturedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
