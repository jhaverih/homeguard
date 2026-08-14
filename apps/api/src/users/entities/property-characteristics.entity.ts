import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

// One row per customer — home characteristics used to compute the Care Plus
// subscription surcharge (subscriptions.service.ts) and the Preventative
// Home Assessment customer/vendor surcharges (property-surcharge.utils.ts).
// Shared across both rather than duplicated, same "one profile row per
// customer" pattern as PropertyAcProfile/MarketplaceHouseCleaningPropertyProfile.
@Entity('property_characteristics')
export class PropertyCharacteristics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column({ unique: true })
  customerId: string;

  @Column({ type: 'int' })
  squareFootage: number;

  @Column({ type: 'int', default: 0 })
  hvacCount: number;

  @Column({ type: 'int', default: 0 })
  waterHeaterCount: number;

  @Column({ type: 'int', default: 0 })
  bathroomCount: number;

  @Column({ type: 'int', default: 0 })
  kitchenCount: number;

  @Column({ default: false })
  hasDetachedGarage: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
