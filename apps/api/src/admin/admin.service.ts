import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CustomerSubscription, SubscriptionStatus } from '../subscriptions/entities/customer-subscription.entity';
import { Payment } from '../payments/entities/payment.entity';
import { UserRole, UserStatus, PaymentStatus } from '../common/enums/role.enum';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(CustomerSubscription) private subscriptionsRepo: Repository<CustomerSubscription>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
  ) {}

  async getStats() {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const [totalCustomers, activeVendors, activeSubscriptions] = await Promise.all([
      this.usersRepo.createQueryBuilder('u')
        .where("u.roles LIKE :role", { role: '%CUSTOMER%' })
        .getCount(),
      this.usersRepo.createQueryBuilder('u')
        .where("u.roles LIKE :role", { role: '%VENDOR%' })
        .andWhere('u.status = :status', { status: UserStatus.ACTIVE })
        .getCount(),
      this.subscriptionsRepo.count({ where: { status: SubscriptionStatus.ACTIVE } }),
    ]);

    const revenueResult = await this.paymentsRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.status = :status', { status: PaymentStatus.SUCCEEDED })
      .andWhere('p.createdAt >= :from', { from: firstOfMonth })
      .getRawOne();

    return {
      totalCustomers,
      activeVendors,
      activeSubscriptions,
      revenueThisMonth: parseFloat(revenueResult?.total ?? '0'),
    };
  }

  async getCustomers() {
    const users = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.customerProfile', 'cp')
      .where("u.roles LIKE :role", { role: '%CUSTOMER%' })
      .andWhere('u.roles NOT LIKE :admin', { admin: '%ADMIN%' })
      .orderBy('u.createdAt', 'DESC')
      .getMany();

    const subscriptions = await this.subscriptionsRepo.find({
      where: { status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });
    const subMap = new Map(subscriptions.map((s) => [s.customerId, s]));

    return users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      subscription: subMap.has(u.id)
        ? {
            plan: subMap.get(u.id).plan?.name,
            tier: subMap.get(u.id).plan?.tier,
            inspectionsUsed: subMap.get(u.id).inspectionsUsed,
            inspectionsRemaining: subMap.get(u.id).inspectionsRemaining,
          }
        : null,
    }));
  }

  async getVendors() {
    const users = await this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.vendorProfile', 'vp')
      .where("u.roles LIKE :role", { role: '%VENDOR%' })
      .orderBy('u.createdAt', 'DESC')
      .getMany();

    return users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      stripeConnected: !!u.vendorProfile?.stripeConnectAccountId,
    }));
  }

  async approveVendor(vendorId: string) {
    await this.usersRepo.update(vendorId, { status: UserStatus.ACTIVE });
    return this.usersRepo.findOne({ where: { id: vendorId }, relations: ['vendorProfile'] });
  }
}
