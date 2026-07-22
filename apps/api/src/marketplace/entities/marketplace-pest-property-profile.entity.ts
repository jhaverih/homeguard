import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One row per customer — captured once and reused for every Pest Control
// price computation, mirroring MarketplaceLawncarePropertyProfile. Only 2
// fields are needed: most pest services are either flat-priced, manual-qty
// (nest/station counts), or scale by home square footage / lot acreage.
@Entity('marketplace_pest_property_profiles')
export class MarketplacePestPropertyProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column({ unique: true })
  customerId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  homeSqFt: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  propertyAcreage: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
