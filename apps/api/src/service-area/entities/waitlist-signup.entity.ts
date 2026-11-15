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

  // Null for the anonymous marketing-site "check your zip" widget signups
  // (unchanged, general "notify me about this area" intent). Set when a
  // logged-in customer taps "Notify me" on a specific service the coverage
  // filter hid from them — see ServiceAreaService.notifyForService.
  @Column({ nullable: true })
  servicePriceId: string | null;

  // Who signed up: a homeowner (the default, and every signup made before
  // this column existed) or a pro from the coming-soon "For pros" page.
  @Column({ type: 'varchar', default: 'HOMEOWNER' })
  audience: 'HOMEOWNER' | 'PRO';

  // Pros only: their company and the services they offer, as ticked on the form.
  @Column({ type: 'varchar', nullable: true })
  companyName: string | null;

  @Column('text', { array: true, nullable: true })
  services: string[] | null;

  @Column({ default: false })
  notified: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
