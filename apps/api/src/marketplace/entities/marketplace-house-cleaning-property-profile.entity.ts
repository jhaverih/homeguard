import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One row per customer — the customer's most recent House Cleaning
// houseConfig (room counts, keyed by MarketplaceRoomUnit.key), captured
// automatically on every successful subscribe()/bookOneTimeCleaning() so
// the wizard never asks for room counts twice. A plain jsonb blob rather
// than named columns (unlike MarketplaceLawncarePropertyProfile) since
// House Cleaning's fields are homogeneous integer counts against an
// already-admin-editable, data-driven catalog — named columns would need
// to stay in sync with that catalog by hand.
@Entity('marketplace_house_cleaning_property_profiles')
export class MarketplaceHouseCleaningPropertyProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column({ unique: true })
  customerId: string;

  @Column({ type: 'jsonb', default: {} })
  roomConfig: Record<string, number>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
