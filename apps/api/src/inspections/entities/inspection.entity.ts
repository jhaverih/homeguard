import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { ServiceRequest } from '../../service-requests/entities/service-request.entity';
import { User } from '../../users/entities/user.entity';

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

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'simple-array', nullable: true })
  photoUrls: string[];

  @CreateDateColumn()
  createdAt: Date;
}
