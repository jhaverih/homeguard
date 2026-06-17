import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';
import { PaymentStatus } from '../../common/enums/role.enum';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  serviceRequestId: string;

  @Column()
  customerId: string;

  @Column()
  vendorId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  platformFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  vendorAmount: number;

  @Column({ default: 'usd' })
  currency: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ nullable: true })
  stripeTransferId: string;

  @CreateDateColumn()
  createdAt: Date;
}
