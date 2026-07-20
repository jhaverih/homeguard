import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { InspectionChecklistGroup } from './inspection-checklist-group.entity';
import { InspectionChecklistSection } from './inspection-checklist-section.entity';

@Entity('inspection_checklist_subgroups')
export class InspectionChecklistSubgroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  groupId: string;

  @ManyToOne(() => InspectionChecklistGroup, (g) => g.subgroups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: InspectionChecklistGroup;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => InspectionChecklistSection, (s) => s.subgroup)
  sections: InspectionChecklistSection[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
