import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { TaskStatus } from '../../common/enums/role.enum';

@Entity('inspection_task_results')
export class InspectionTaskResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  serviceRequestId: string;

  @Column()
  vendorId: string;

  @Column()
  sectionKey: string;

  @Column()
  taskKey: string;

  @Column({ type: 'enum', enum: TaskStatus })
  status: TaskStatus;

  @Column({ type: 'text', nullable: true })
  findings: string;

  @Column({ type: 'text', nullable: true })
  recommendation: string;

  @Column({ type: 'jsonb', nullable: true })
  structuredData: Record<string, any>;

  // MinIO object keys (resolved to signed URLs before returning to clients)
  @Column({ type: 'simple-array', nullable: true })
  photoKeys: string[];

  // Optional link to an AdditionalService created from this finding
  @Column({ nullable: true })
  linkedAdditionalServiceId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
