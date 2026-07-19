import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Base Cleaning Units — one row per house-area, admin-editable. `key` is the
// stable identifier stored in MarketplaceSubscription.houseConfig (jsonb);
// `units` is the BCU weight used by the pricing formula.
@Entity('marketplace_room_units')
export class MarketplaceRoomUnit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  units: number;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
