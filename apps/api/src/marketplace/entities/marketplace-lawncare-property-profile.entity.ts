import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One row per customer — captured once and reused for every Lawncare price
// computation (package subscribe or on-demand service booking), so the
// customer never re-enters the same property details twice. Fields are
// nullable/filled in progressively; a missing field just means that
// particular service's qty can't be resolved yet (resolveServiceQty in
// marketplace-lawncare-pricing.utils.ts).
@Entity('marketplace_lawncare_property_profiles')
export class MarketplaceLawncarePropertyProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column({ unique: true })
  customerId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  propertySizeSqFt: number | null;

  @Column({ type: 'int', nullable: true })
  shrubPlantCount: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  bedSqFt: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gutterLinearFt: number | null;

  @Column({ type: 'int', nullable: true })
  irrigationZones: number | null;

  @Column({ type: 'int', nullable: true })
  treeCountSmall: number | null;

  @Column({ type: 'int', nullable: true })
  treeCountMedium: number | null;

  @Column({ type: 'int', nullable: true })
  treeCountLarge: number | null;

  @Column({ type: 'int', nullable: true })
  lightingFixtureCount: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
