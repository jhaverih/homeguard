import { Injectable, NotFoundException, ConflictException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { VendorProfile } from './entities/vendor-profile.entity';
import { CustomerProfile } from './entities/customer-profile.entity';
import { UserRole, UserStatus } from '../common/enums/role.enum';

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
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
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
      }),
    );
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email },
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

      if (newRoles.includes(UserRole.CUSTOMER) && dto.address && !existing.customerProfile) {
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
        await this.vendorProfileRepo.save(
          this.vendorProfileRepo.create({
            userId: saved.id,
            ...(dto.companyName ? { companyName: dto.companyName } : {}),
          }),
        );
      }

      return saved;
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.usersRepo.create({
      ...dto,
      password: hashed,
      activeRole: dto.roles[0],
      status: dto.roles.includes(UserRole.VENDOR) ? UserStatus.PENDING_APPROVAL : UserStatus.ACTIVE,
    });
    const saved = await this.usersRepo.save(user);

    if (dto.roles.includes(UserRole.CUSTOMER) && dto.address) {
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
      const profile = this.vendorProfileRepo.create({
        userId: saved.id,
        ...(dto.companyName ? { companyName: dto.companyName } : {}),
      });
      await this.vendorProfileRepo.save(profile);
    }

    return saved;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email },
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
    await this.usersRepo.update(userId, { expoPushToken: token });
  }

  async findAvailableVendors(): Promise<User[]> {
    return this.usersRepo
      .createQueryBuilder('user')
      .innerJoin('user.vendorProfile', 'vp', 'vp.isAvailable = true')
      .where('user.status = :status', { status: UserStatus.ACTIVE })
      .andWhere('user.roles LIKE :role', { role: `%${UserRole.VENDOR}%` })
      .getMany();
  }

  async updateProfile(userId: string, data: Partial<User>): Promise<User> {
    const allowed = ['email', 'firstName', 'lastName', 'phone'];
    const update: any = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    if (Object.keys(update).length) await this.usersRepo.update(userId, update);
    return this.findById(userId);
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
