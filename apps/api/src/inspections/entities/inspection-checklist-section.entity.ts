import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { InspectionChecklistSubgroup } from './inspection-checklist-subgroup.entity';
import { InspectionChecklistTask } from './inspection-checklist-task.entity';

// A "checklist" in admin/user-facing terms (e.g. Toilets, Sinks, Kitchen) —
// the `key` matches the sectionKey convention already used throughout
// inspections.service.ts / InspectionTaskResult (a task's key is always
// `${section.key}.${suffix}`, see getSectionKey()).
@Entity('inspection_checklist_sections')
export class InspectionChecklistSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subgroupId: string;

  @ManyToOne(() => InspectionChecklistSubgroup, (s) => s.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subgroupId' })
  subgroup: InspectionChecklistSubgroup;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => InspectionChecklistTask, (t) => t.section)
  tasks: InspectionChecklistTask[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
