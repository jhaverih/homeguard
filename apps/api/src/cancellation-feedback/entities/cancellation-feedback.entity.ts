import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

export enum CancellationReasonCode {
  TOO_EXPENSIVE = 'TOO_EXPENSIVE',
  NOT_USING_ENOUGH = 'NOT_USING_ENOUGH',
  FOUND_ALTERNATIVE = 'FOUND_ALTERNATIVE',
  SERVICE_QUALITY = 'SERVICE_QUALITY',
  MOVING = 'MOVING',
  OTHER = 'OTHER',
}

export enum CancellationType {
  SUBSCRIPTION = 'SUBSCRIPTION',
  SERVICE_REQUEST = 'SERVICE_REQUEST',
}

@Entity('cancellation_feedback')
export class CancellationFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column({ type: 'enum', enum: CancellationType })
  type: CancellationType;

  @Column({ nullable: true })
  subscriptionId: string | null;

  @Column({ nullable: true })
  serviceRequestId: string | null;

  @Column({ type: 'enum', enum: CancellationReasonCode })
  reasonCode: CancellationReasonCode;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
