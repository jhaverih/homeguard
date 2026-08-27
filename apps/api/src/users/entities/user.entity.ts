import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { UserRole, UserStatus } from '../../common/enums/role.enum';
import { AdminLevel } from '../../common/enums/admin-level.enum';
import { VendorProfile } from './vendor-profile.entity';
import { CustomerProfile } from './customer-profile.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'simple-array', default: 'CUSTOMER' })
  roles: UserRole[];

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  activeRole: UserRole;

  // Only meaningful when `roles` includes ADMIN — governs mutation access within the admin portal.
  @Column({ type: 'enum', enum: AdminLevel, nullable: true })
  adminLevel: AdminLevel | null;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  expoPushToken: string;

  // Raw native FCM registration token (Android only, today) — separate from
  // expoPushToken since a direct admin.messaging().send() call needs the
  // real device token, not an ExponentPushToken[...] string. Used to route
  // category-tagged (Snoozable) alerts around Expo's push relay, which
  // silently drops the categoryId field before it reaches FCM.
  @Column({ nullable: true })
  fcmDeviceToken: string;

  @Column({ nullable: true })
  parentUserId: string;

  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  // select: false, like `password` above — these are bearer secrets (anyone holding
  // the code/token can verify the email or reset the password outright), and were
  // previously leaking in plain JSON on every endpoint that returns a User row
  // (createTechnician, findById used by login/register/me, etc.) since nothing
  // explicitly excluded them. Callers that legitimately need the value (verifyEmail)
  // must opt back in with an explicit `select`, same as login does for `password`.
  @Column({ nullable: true, select: false })
  emailVerificationCode: string;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpiry: Date;

  @Column({ nullable: true, select: false })
  passwordResetToken: string;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpiry: Date;

  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt: Date | null;

  @Column({ nullable: true })
  tosVersion: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  vendorTermsAcceptedAt: Date | null;

  @Column({ nullable: true })
  vendorTosVersion: string | null;

  @OneToOne(() => VendorProfile, (profile) => profile.user, { cascade: true, eager: false })
  vendorProfile: VendorProfile;

  @OneToOne(() => CustomerProfile, (profile) => profile.user, { cascade: true, eager: false })
  customerProfile: CustomerProfile;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
