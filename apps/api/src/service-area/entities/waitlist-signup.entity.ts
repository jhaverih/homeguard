import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

// Captured from the public "check your area" widget on attenteve.com when a
// ZIP isn't covered yet — a lead list to notify once coverage expands, not
// a customer account. See service-area.service.ts for how this is written.
@Entity('waitlist_signups')
export class WaitlistSignup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  zipCode: string;

  @Column({ default: false })
  notified: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
