import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum FamilyInviteStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
}

// A customer (the home's account holder) invites someone by email to join
// their home as a family member. Nothing is linked until the invitee accepts
// — in the app, or by creating their account from the invite. See
// family-invites.service.ts.
@Entity('family_invites')
export class FamilyInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The account holder whose home the invitee joins. */
  @Index()
  @Column('uuid')
  ownerId: string;

  /** Normalized (lower-case) email the invite was sent to. */
  @Index()
  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  firstName: string | null;

  /** Short code in the email and the Join link. */
  @Index({ unique: true })
  @Column({ length: 12 })
  code: string;

  @Column({ type: 'enum', enum: FamilyInviteStatus, default: FamilyInviteStatus.PENDING })
  status: FamilyInviteStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  acceptedUserId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
