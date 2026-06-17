import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { UserRole, UserStatus } from '../../common/enums/role.enum';
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

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  expoPushToken: string;

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
