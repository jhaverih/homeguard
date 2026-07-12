import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('service_prices')
export class ServicePrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  basePrice: number;

  @Column({ type: 'text', nullable: true })
  unitDescription: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  markupPercent: number | null;

  @Column({ type: 'text', nullable: true })
  priceNote: string | null;

  @Column({ default: false })
  requiresQuote: boolean;

  @Column({ type: 'text', nullable: true })
  quantityLabel: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minimumQuantity: number | null;

  @Column({ default: true })
  isActive: boolean;

  // Nullable — services with no capability requirement are open to any vendor.
  @Column({ nullable: true })
  requiredCapabilityId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
