import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One row per customer — the latest known AC unit / filter details,
// extracted from the "AC Unit Count & Per-Unit Inspection" task
// (hvac_visual.units_overview) each time a vendor saves it, and used to
// pre-fill the same task on the customer's next inspection so the vendor
// isn't re-asking from scratch every visit. There's no stable per-unit
// identity anywhere in the source data (even within one visit, "unit 1/2/3"
// are just array-index key prefixes), so this profile is simply overwritten
// wholesale each time — fresh ids are assigned on write, no diffing.
@Entity('property_ac_profiles')
export class PropertyAcProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  customer: User;

  @Column({ unique: true })
  customerId: string;

  @Column({ type: 'jsonb', default: [] })
  acUnits: {
    id: string;
    location: string;
    makeModel: string;
    serial: string;
    installDate: string;
    filters: {
      id: string;
      filterLocation: string;
      size: string;
      dirtLevel: string;
      merv: string;
      airflowCorrect: boolean;
      nextReplacementDays: string;
    }[];
  }[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
