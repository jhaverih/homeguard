import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, DataSource } from 'typeorm';
import { emailEquals, normalizeEmail } from '../common/utils/email.util';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { VendorProfile } from './entities/vendor-profile.entity';
import { CustomerProfile } from './entities/customer-profile.entity';
import { UserRole, UserStatus } from '../common/enums/role.enum';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { VendorCompany, VendorApplicationStatus } from '../vendor/entities/vendor-company.entity';
import { CURRENT_CUSTOMER_TOS_VERSION, CURRENT_VENDOR_TOS_VERSION } from '../common/constants/tos';

export interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roles: UserRole[];
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  companyName?: string;
  ein?: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyZipCode?: string;
  // Set by VendorService.createTechnician — the caller assigns companyId/isCompanyAdmin
  // itself afterward, so create() should not also spin up a brand new company.
  skipCompanyCreation?: boolean;
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(VendorProfile)
    private vendorProfileRepo: Repository<VendorProfile>,
    @InjectRepository(CustomerProfile)
    private customerProfileRepo: Repository<CustomerProfile>,
    @InjectRepository(VendorCompany)
    private vendorCompanyRepo: Repository<VendorCompany>,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.backfillAdminLevels();
    await this.backfillVendorCompanies();
  }

  private async seedAdmin() {
    const existing = await this.usersRepo.findOne({ where: { email: 'admin@homeguard.com' } });
    if (existing) return;
    const hashed = await bcrypt.hash('Admin@1234', 12);
    await this.usersRepo.save(
      this.usersRepo.create({
        email: 'admin@homeguard.com',
        password: hashed,
        firstName: 'Admin',
        lastName: 'User',
        roles: [UserRole.ADMIN],
        activeRole: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        adminLevel: AdminLevel.SUPER_USER,
      }),
    );
  }

  // Existing ADMIN-role accounts predate the adminLevel column — default them to
  // SUPER_USER so nobody loses access once level-gated endpoints ship.
  private async backfillAdminLevels() {
    await this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ adminLevel: AdminLevel.SUPER_USER })
      .where('"adminLevel" IS NULL')
      .andWhere('roles LIKE :role', { role: `%${UserRole.ADMIN}%` })
      .execute();
  }

  // Pre-existing vendor accounts predate the VendorCompany entity — each team "owner"
  // (parentUserId IS NULL) gets a backfilled, pre-approved company; technicians
  // (parentUserId set) join their former owner's new company. Idempotent: skips
  // any VendorProfile that already has a companyId.
  private async backfillVendorCompanies() {
    const owners = await this.usersRepo
      .createQueryBuilder('u')
      .innerJoinAndSelect('u.vendorProfile', 'vp')
      .where('u.roles LIKE :role', { role: `%${UserRole.VENDOR}%` })
      .andWhere('u.parentUserId IS NULL')
      .andWhere('vp.companyId IS NULL')
      .getMany();

    for (const owner of owners) {
      const profile = owner.vendorProfile;
      const company = await this.vendorCompanyRepo.save(
        this.vendorCompanyRepo.create({
          name: profile.companyName || `${owner.firstName} ${owner.lastName}`.trim(),
          planTier: profile.planTier,
          elitePlanExpiresAt: profile.elitePlanExpiresAt,
          stripeConnectAccountId: profile.stripeConnectAccountId,
          stripeOnboardingComplete: profile.stripeOnboardingComplete,
          applicationStatus: VendorApplicationStatus.APPROVED,
        }),
      );
      await this.vendorProfileRepo.update(profile.id, { companyId: company.id, isCompanyAdmin: true });
    }

    const technicians = await this.usersRepo
      .createQueryBuilder('u')
      .innerJoinAndSelect('u.vendorProfile', 'vp')
      .where('u.roles LIKE :role', { role: `%${UserRole.VENDOR}%` })
      .andWhere('u.parentUserId IS NOT NULL')
      .andWhere('vp.companyId IS NULL')
      .getMany();

    for (const tech of technicians) {
      const parentProfile = await this.vendorProfileRepo.findOne({ where: { userId: tech.parentUserId } });
      if (!parentProfile?.companyId) continue;
      await this.vendorProfileRepo.update(tech.vendorProfile.id, {
        companyId: parentProfile.companyId,
        isCompanyAdmin: false,
      });
    }
  }

  async getVendorTeamIds(userId: string): Promise<string[]> {
    const profile = await this.vendorProfileRepo.findOne({ where: { userId } });
    if (!profile?.companyId) return [userId];
    const teamProfiles = await this.vendorProfileRepo.find({ where: { companyId: profile.companyId } });
    return teamProfiles.map((p) => p.userId);
  }

  async create(dto: CreateUserDto): Promise<User> {
    // Emails are case-insensitive — normalize so "Foo@x.com" and "foo@x.com"
    // are always treated as the same account (merges roles below instead of
    // silently forking a duplicate), and match against any pre-existing
    // mixed-case row too.
    dto = { ...dto, email: normalizeEmail(dto.email) };
    const existing = await this.usersRepo.findOne({
      where: { email: emailEquals(dto.email) },
      relations: ['vendorProfile', 'customerProfile'],
    });

    if (existing) {
      const newRoles = dto.roles.filter((r) => !existing.roles.includes(r));
      if (newRoles.length === 0) throw new ConflictException('Email already in use');

      existing.roles = [...existing.roles, ...newRoles];
      if (newRoles.includes(UserRole.VENDOR)) {
        existing.status = UserStatus.PENDING_APPROVAL;
      }
      const saved = await this.usersRepo.save(existing);

      if (newRoles.includes(UserRole.CUSTOMER) && !existing.customerProfile) {
        await this.customerProfileRepo.save(
          this.customerProfileRepo.create({
            userId: saved.id,
            address: dto.address,
            city: dto.city,
            state: dto.state,
            zipCode: dto.zipCode,
          }),
        );
      }

      if (newRoles.includes(UserRole.VENDOR) && !existing.vendorProfile) {
        const profile = await this.vendorProfileRepo.save(
          this.vendorProfileRepo.create({
            userId: saved.id,
            ...(dto.companyName ? { companyName: dto.companyName } : {}),
          }),
        );
        if (!dto.skipCompanyCreation) await this.createCompanyForNewVendor(profile, saved, dto.companyName, dto.ein, dto.companyAddress, dto.companyCity, dto.companyState, dto.companyZipCode);
      }

      return saved;
    }

    const { skipCompanyCreation, ein, companyAddress, companyCity, companyState, companyZipCode, ...userFields } = dto;
    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.usersRepo.create({
      ...userFields,
      password: hashed,
      activeRole: dto.roles[0],
      status: dto.roles.includes(UserRole.VENDOR) ? UserStatus.PENDING_APPROVAL : UserStatus.ACTIVE,
    });
    const saved = await this.usersRepo.save(user);

    if (dto.roles.includes(UserRole.CUSTOMER)) {
      const profile = this.customerProfileRepo.create({
        userId: saved.id,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode,
      });
      await this.customerProfileRepo.save(profile);
    }

    if (dto.roles.includes(UserRole.VENDOR)) {
      const profile = await this.vendorProfileRepo.save(
        this.vendorProfileRepo.create({
          userId: saved.id,
          ...(dto.companyName ? { companyName: dto.companyName } : {}),
        }),
      );
      if (!dto.skipCompanyCreation) await this.createCompanyForNewVendor(profile, saved, dto.companyName, dto.ein, dto.companyAddress, dto.companyCity, dto.companyState, dto.companyZipCode);
    }

    return saved;
  }

  // A brand-new Vendor Admin registering (not a technician being invited onto an
  // existing team) gets their own company, starting in PENDING_REVIEW — unlike the
  // one-time backfill for pre-existing accounts, new registrations are not
  // grandfathered and must go through the document review queue.
  private async createCompanyForNewVendor(
    profile: VendorProfile,
    user: User,
    companyName?: string,
    ein?: string,
    companyAddress?: string,
    companyCity?: string,
    companyState?: string,
    companyZipCode?: string,
  ) {
    const company = await this.vendorCompanyRepo.save(
      this.vendorCompanyRepo.create({
        name: companyName || `${user.firstName} ${user.lastName}`.trim(),
        applicationStatus: VendorApplicationStatus.PENDING_REVIEW,
        ...(ein ? { ein } : {}),
        ...(companyAddress ? { address: companyAddress } : {}),
        ...(companyCity ? { city: companyCity } : {}),
        ...(companyState ? { state: companyState } : {}),
        ...(companyZipCode ? { zipCode: companyZipCode } : {}),
      }),
    );
    await this.vendorProfileRepo.update(profile.id, { companyId: company.id, isCompanyAdmin: true });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email: emailEquals(email) },
      select: ['id', 'email', 'password', 'firstName', 'lastName', 'roles', 'status', 'activeRole'],
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['vendorProfile', 'customerProfile'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateActiveRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.findById(userId);
    if (!user.roles.includes(role)) throw new ConflictException('User does not have this role');
    user.activeRole = role;
    return this.usersRepo.save(user);
  }

  async updatePushToken(userId: string, token: string): Promise<void> {
    // A physical device's Expo push token is stable per app-install — if a
    // second account ever logs in on the same phone (common during testing,
    // but also just a shared family device), the OLD account's row kept
    // this exact token forever with nothing to clear it, so both accounts
    // received each other's notifications indefinitely. Clearing it from any
    // other owner before assigning it here guarantees at most one user ever
    // holds a given token at a time.
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, { expoPushToken: token, id: Not(userId) }, { expoPushToken: null });
      await manager.update(User, userId, { expoPushToken: token });
    });
  }

  async clearPushToken(userId: string): Promise<void> {
    await this.usersRepo.update(userId, { expoPushToken: null });
  }

  async updateStripeCustomerId(userId: string, stripeCustomerId: string | null): Promise<void> {
    await this.usersRepo.update(userId, { stripeCustomerId });
  }

  async acceptCustomerTerms(userId: string, tosVersion: string): Promise<void> {
    await this.usersRepo.update(userId, { termsAcceptedAt: new Date(), tosVersion });
  }

  async acceptVendorTerms(userId: string, tosVersion: string): Promise<void> {
    await this.usersRepo.update(userId, { vendorTermsAcceptedAt: new Date(), vendorTosVersion: tosVersion });
  }

  async acceptTerms(userId: string, termsType: 'CUSTOMER' | 'VENDOR'): Promise<User> {
    if (termsType === 'VENDOR') {
      await this.acceptVendorTerms(userId, CURRENT_VENDOR_TOS_VERSION);
    } else {
      await this.acceptCustomerTerms(userId, CURRENT_CUSTOMER_TOS_VERSION);
    }
    return this.findById(userId);
  }

  async findAvailableVendors(): Promise<User[]> {
    return this.usersRepo
      .createQueryBuilder('user')
      .innerJoin('user.vendorProfile', 'vp', 'vp.isAvailable = true')
      .where('user.status = :status', { status: UserStatus.ACTIVE })
      .andWhere('user.roles LIKE :role', { role: `%${UserRole.VENDOR}%` })
      .getMany();
  }

  // All active vendor accounts regardless of the isAvailable toggle — for
  // announcements every vendor should see (e.g. a new capability being
  // added), not just ones currently marked available for jobs right now.
  // findAvailableVendors() above is deliberately narrower (job-matching).
  async findAllActiveVendors(): Promise<User[]> {
    return this.usersRepo
      .createQueryBuilder('user')
      .where('user.status = :status', { status: UserStatus.ACTIVE })
      .andWhere('user.roles LIKE :role', { role: `%${UserRole.VENDOR}%` })
      .getMany();
  }

  async findAdminTeamUsers(): Promise<User[]> {
    return this.usersRepo
      .createQueryBuilder('user')
      .where('user.status = :status', { status: UserStatus.ACTIVE })
      .andWhere('user.roles LIKE :role', { role: `%${UserRole.ADMIN}%` })
      .getMany();
  }

  async addTeamMember(ownerId: string, email: string): Promise<User> {
    const owner = await this.findById(ownerId);
    const member = await this.usersRepo.findOne({ where: { email: emailEquals(email) } });
    if (!member) throw new NotFoundException('No user found with that email address');
    if (member.id === ownerId) throw new BadRequestException('Cannot add yourself as a team member');
    if (member.parentUserId) throw new BadRequestException('This user already belongs to another account');

    const isVendorOwner = owner.roles.includes(UserRole.VENDOR);

    // Validate role compatibility
    if (isVendorOwner && !member.roles.includes(UserRole.VENDOR)) {
      throw new BadRequestException('Technicians must have the vendor role. Ask them to register as a vendor first.');
    }
    if (!isVendorOwner && !member.roles.includes(UserRole.CUSTOMER)) {
      throw new BadRequestException('Family members must have the customer role.');
    }

    // Req 6: enforce team size limit for vendors on STANDARD plan
    if (isVendorOwner) {
      const profile = await this.vendorProfileRepo.findOne({ where: { userId: ownerId } });
      if (profile?.planTier !== 'ELITE') {
        const currentCount = await this.usersRepo.count({ where: { parentUserId: ownerId } });
        if (currentCount >= 5) {
          throw new BadRequestException(
            'Standard plan allows up to 5 technicians. Upgrade to Elite to add unlimited team members.',
          );
        }
      }
    }

    member.parentUserId = ownerId;
    return this.usersRepo.save(member);
  }

  async getTeamMembers(ownerId: string): Promise<User[]> {
    return this.usersRepo.find({
      where: { parentUserId: ownerId },
      relations: ['vendorProfile', 'customerProfile'],
    });
  }

  async removeTeamMember(ownerId: string, memberId: string): Promise<void> {
    const member = await this.usersRepo.findOne({ where: { id: memberId, parentUserId: ownerId } });
    if (!member) throw new NotFoundException('Team member not found');
    member.parentUserId = null;
    await this.usersRepo.save(member);
  }

  async getEffectiveSubscriptionOwnerId(userId: string): Promise<string> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    return user?.parentUserId ?? userId;
  }

  async getRelatedCustomerIds(userId: string): Promise<string[]> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return [userId];

    if (user.parentUserId) {
      // This is a family member — include parent and all siblings
      const siblings = await this.usersRepo.find({ where: { parentUserId: user.parentUserId } });
      return [...new Set([userId, user.parentUserId, ...siblings.map((s) => s.id)])];
    }

    // This is a primary user — include all family members
    const members = await this.usersRepo.find({ where: { parentUserId: userId } });
    return [userId, ...members.map((m) => m.id)];
  }

  async updateProfile(userId: string, data: Partial<User>): Promise<User> {
    const allowed = ['email', 'firstName', 'lastName', 'phone', 'avatarUrl'];
    const update: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    if (Object.keys(update).length) await this.usersRepo.update(userId, update);
    return this.findById(userId);
  }

  // Stripe Connect is company-level: whichever team member's onboarding flow triggers
  // this, the account id is stored once on the company and mirrored onto every team
  // member's VendorProfile so existing single-profile read sites keep working.
  async saveVendorStripeAccountId(userId: string, stripeAccountId: string): Promise<void> {
    const profile = await this.vendorProfileRepo.findOne({ where: { userId } });
    if (!profile) return;
    if (profile.companyId) {
      await this.vendorCompanyRepo.update(profile.companyId, { stripeConnectAccountId: stripeAccountId });
      await this.vendorProfileRepo.update({ companyId: profile.companyId }, { stripeConnectAccountId: stripeAccountId });
    } else {
      await this.vendorProfileRepo.update(profile.id, { stripeConnectAccountId: stripeAccountId });
    }
  }

  async markVendorStripeComplete(stripeAccountId: string): Promise<void> {
    const company = await this.vendorCompanyRepo.findOne({ where: { stripeConnectAccountId: stripeAccountId } });
    if (company) {
      await this.vendorCompanyRepo.update(company.id, { stripeOnboardingComplete: true });
      await this.vendorProfileRepo.update({ companyId: company.id }, { stripeOnboardingComplete: true });
      return;
    }
    // Fallback for pre-company/legacy profiles (shouldn't occur post-backfill, kept defensive).
    const profile = await this.vendorProfileRepo.findOne({ where: { stripeConnectAccountId: stripeAccountId } });
    if (profile) {
      await this.vendorProfileRepo.update(profile.id, { stripeOnboardingComplete: true });
    }
  }

  // Resolves the acting user's company's Stripe account, regardless of whether the
  // caller is the Vendor Admin or a technician on the team.
  async getCompanyStripeAccount(userId: string): Promise<{ companyId: string | null; accountId: string | null; onboardingComplete: boolean }> {
    const profile = await this.vendorProfileRepo.findOne({ where: { userId } });
    if (!profile?.companyId) return { companyId: null, accountId: null, onboardingComplete: false };
    const company = await this.vendorCompanyRepo.findOne({ where: { id: profile.companyId } });
    return {
      companyId: profile.companyId,
      accountId: company?.stripeConnectAccountId ?? null,
      onboardingComplete: company?.stripeOnboardingComplete ?? false,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id: userId }, select: ['id', 'password'] });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.usersRepo.update(userId, { password: hashed });
  }
}
