import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { InspectionChecklistSubgroup } from './inspection-checklist-subgroup.entity';

@Entity('inspection_checklist_groups')
export class InspectionChecklistGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => InspectionChecklistSubgroup, (s) => s.group)
  subgroups: InspectionChecklistSubgroup[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
