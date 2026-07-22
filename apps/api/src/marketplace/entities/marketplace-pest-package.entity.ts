import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// One row per Pest Control membership tier (Basic/Premium/Ultimate
// Protection). Mirrors MarketplaceLawncarePackage exactly — composition
// drives the real computed monthlyPrice; monthlyPrice itself is a
// typical/reference price shown in marketing copy only.
@Entity('marketplace_pest_packages')
export class MarketplacePestPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', default: [] })
  composition: { serviceKey: string; visitsPerYear: number }[];

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monthlyPrice: number;

  @Column({ default: false })
  isStartingAt: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
