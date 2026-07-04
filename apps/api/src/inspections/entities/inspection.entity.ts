import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { ServiceRequest } from '../../service-requests/entities/service-request.entity';
import { NoteType } from '../../common/enums/role.enum';

@Entity('inspection_notes')
export class InspectionNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ServiceRequest)
  @JoinColumn()
  serviceRequest: ServiceRequest;

  @Column()
  serviceRequestId: string;

  @Column()
  vendorId: string;

  @Column({ type: 'enum', enum: NoteType, default: NoteType.OBSERVATION })
  type: NoteType;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  // Stores MinIO object keys; resolved to signed URLs before returning to clients
  @Column({ type: 'simple-array', nullable: true })
  photoUrls: string[];

  @CreateDateColumn()
  createdAt: Date;
}
