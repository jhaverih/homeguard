import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique,
} from 'typeorm';

@Entity('service_request_rejections')
@Unique(['serviceRequestId', 'vendorId'])
export class ServiceRequestRejection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  serviceRequestId: string;

  @Column()
  vendorId: string;

  @CreateDateColumn()
  createdAt: Date;
}
