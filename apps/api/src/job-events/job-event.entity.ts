import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Everything that happens to a job that affects its schedule or the quality
// of service, one row per interaction, kept forever (the job row itself only
// holds the latest state). Read for service-quality analysis: response
// times, punctuality, cancellations, reschedules, extra work, disputes.
export enum JobEventType {
  REQUESTED = 'REQUESTED',                         // customer booked
  VENDOR_PASSED = 'VENDOR_PASSED',                 // a vendor declined the open job
  ACCEPTED = 'ACCEPTED',                           // vendor took it (and proposed a time)
  SCHEDULE_CONFIRMED = 'SCHEDULE_CONFIRMED',       // customer agreed to the proposed time
  SCHEDULE_DECLINED = 'SCHEDULE_DECLINED',         // customer rejected the proposed time
  ASSIGNED = 'ASSIGNED',                           // company owner gave it to a technician
  RESCHEDULED = 'RESCHEDULED',
  ON_MY_WAY = 'ON_MY_WAY',
  ARRIVED = 'ARRIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',                         // by the customer
  RELEASED = 'RELEASED',                           // vendor gave the job back
  STUCK_ON_THE_WAY = 'STUCK_ON_THE_WAY',           // system: on the way too long without arriving
  EXTRA_WORK_RECOMMENDED = 'EXTRA_WORK_RECOMMENDED',
  EXTRA_TIME_REQUESTED = 'EXTRA_TIME_REQUESTED',
  EXTRA_WORK_APPROVED = 'EXTRA_WORK_APPROVED',
  EXTRA_WORK_DECLINED = 'EXTRA_WORK_DECLINED',
  MATERIAL_ADDED = 'MATERIAL_ADDED',
  MESSAGE_SENT = 'MESSAGE_SENT',
  DISPUTE_OPENED = 'DISPUTE_OPENED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  REVIEW_SUBMITTED = 'REVIEW_SUBMITTED',
  QUOTE_SUBMITTED = 'QUOTE_SUBMITTED',
  CONSULTATION_REQUESTED = 'CONSULTATION_REQUESTED',
  CONSULTATION_UPDATED = 'CONSULTATION_UPDATED',
}

export type JobEventActor = 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'SYSTEM';

@Entity('job_events')
@Index(['serviceRequestId', 'occurredAt'])
@Index(['type', 'occurredAt'])
@Index(['vendorId', 'occurredAt'])
export class JobEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  serviceRequestId: string;

  @Column({ type: 'varchar', nullable: true })
  ticketNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  bookingGroupId: string | null;

  @Column({ type: 'varchar' })
  type: JobEventType;

  @Column({ type: 'varchar' })
  actorRole: JobEventActor;

  // Who did it; null for the system.
  @Column({ type: 'varchar', nullable: true })
  actorId: string | null;

  // The job's customer and assigned vendor at the time of the event.
  @Column({ type: 'varchar', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  vendorId: string | null;

  @Column({ type: 'varchar', nullable: true })
  status: string | null;

  // The job's scheduled time when this happened, to measure lateness and
  // how much notice a change gave.
  @Column({ type: 'timestamp', nullable: true })
  scheduledFor: Date | null;

  // Event details (minutes late, notice hours, old/new dates, amounts, ...).
  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, unknown> | null;

  // From the customer's account, so testing can be left out of analysis.
  @Column({ default: false })
  isTest: boolean;

  @CreateDateColumn()
  occurredAt: Date;
}
