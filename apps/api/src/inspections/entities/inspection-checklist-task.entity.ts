import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { InspectionChecklistSection } from './inspection-checklist-section.entity';

// promptFields/dynamicGroups/catalogLinks are opaque pass-through data (typed
// sub-fields, per-unit repeater config, upsell catalog-name links) — carried
// over verbatim from the seed and read by the vendor app, but not exposed as
// editable fields in the admin Inspection Configurator (v1 scope: label,
// description, isActive, sortOrder, and whole-task/section create-remove).
@Entity('inspection_checklist_tasks')
export class InspectionChecklistTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sectionId: string;

  @ManyToOne(() => InspectionChecklistSection, (s) => s.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectionId' })
  section: InspectionChecklistSection;

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

  @Column({ type: 'jsonb', default: [] })
  promptFields: any[];

  @Column({ type: 'jsonb', nullable: true })
  dynamicGroups: any | null;

  @Column({ type: 'jsonb', default: [] })
  catalogLinks: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
