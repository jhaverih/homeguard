import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, LessThanOrEqual } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { CustomerSubscription, SubscriptionStatus } from '../subscriptions/entities/customer-subscription.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { UserRole, UserStatus, PaymentStatus, ServiceRequestStatus } from '../common/enums/role.enum';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(VendorProfile) private vendorProfileRepo: Repository<VendorProfile>,
    @InjectRepository(CustomerSubscription) private subscriptionsRepo: Repository<CustomerSubscription>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(ServiceRequest) private requestsRepo: Repository<ServiceRequest>,
    private notificationsService: NotificationsService,
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

    const activeRequests = await this.requestsRepo
      .createQueryBuilder('r')
      .select(['r.customerId', 'r.status'])
      .where('r.status NOT IN (:...statuses)', { statuses: [ServiceRequestStatus.COMPLETED, 'CANCELLED'] })
      .getMany();
    const pendingMap = new Map<string, number>();
    for (const r of activeRequests) {
      pendingMap.set(r.customerId, (pendingMap.get(r.customerId) ?? 0) + 1);
    }

    return users.map((u) => {
      const sub = subMap.get(u.id);
      const pending = pendingMap.get(u.id) ?? 0;
      return {
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        phone: u.phone,
        status: u.status,
        createdAt: u.createdAt,
        subscription: sub
          ? {
              plan: sub.plan?.name,
              tier: sub.plan?.tier,
              inspectionsCompleted: sub.inspectionsUsed,
              inspectionsPending: pending,
              inspectionsLeft: Math.max(0, (sub.plan?.inspectionsPerYear ?? 0) - sub.inspectionsUsed - pending),
            }
          : null,
      };
    });
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
      companyName: u.vendorProfile?.companyName ?? null,
      createdAt: u.createdAt,
      stripeConnected: !!u.vendorProfile?.stripeConnectAccountId,
      planTier: u.vendorProfile?.planTier ?? 'STANDARD',
      elitePlanExpiresAt: u.vendorProfile?.elitePlanExpiresAt ?? null,
    }));
  }

  async approveVendor(vendorId: string) {
    await this.usersRepo.update(vendorId, { status: UserStatus.ACTIVE });
    return this.usersRepo.findOne({ where: { id: vendorId }, relations: ['vendorProfile'] });
  }

  async removeVendor(vendorId: string) {
    await this.usersRepo.update(vendorId, { status: UserStatus.SUSPENDED });
    return { success: true };
  }

  async setVendorPlan(vendorId: string, tier: 'STANDARD' | 'ELITE', expiresAt?: string) {
    const profile = await this.vendorProfileRepo.findOne({ where: { userId: vendorId } });
    if (!profile) throw new NotFoundException('Vendor profile not found');

    profile.planTier = tier;
    profile.elitePlanExpiresAt = tier === 'ELITE' && expiresAt ? new Date(expiresAt) : null;
    await this.vendorProfileRepo.save(profile);

    await this.notificationsService.notifyUser(
      vendorId,
      NotificationType.NEW_REQUEST,
      tier === 'ELITE' ? 'Elite Plan Activated' : 'Plan Updated',
      tier === 'ELITE'
        ? `Your account has been upgraded to the Elite plan. You can now add unlimited technicians.`
        : `Your account has been updated to the Standard plan.`,
      {},
    );

    return { vendorId, tier, expiresAt: profile.elitePlanExpiresAt };
  }

  async runVendorDowngradeCheck(): Promise<{ downgraded: number }> {
    const expired = await this.vendorProfileRepo.find({
      where: {
        planTier: 'ELITE',
        elitePlanExpiresAt: LessThanOrEqual(new Date()),
      },
    });

    for (const profile of expired) {
      profile.planTier = 'STANDARD';
      profile.elitePlanExpiresAt = null;
      await this.vendorProfileRepo.save(profile);

      await this.notificationsService.notifyUser(
        profile.userId,
        NotificationType.NEW_REQUEST,
        'Plan Downgraded to Standard',
        'Your Elite plan has expired. Your account has been moved to the Standard plan. Team size is now limited to 5 technicians.',
        {},
      ).catch(() => {});
    }

    return { downgraded: expired.length };
  }

  async getSchedule(year?: number, month?: number) {
    const requests = await this.requestsRepo.find({
      where: { scheduledDate: Not(IsNull()) },
      relations: ['customer', 'vendor'],
      order: { scheduledDate: 'ASC' },
    });

    const filtered = (year !== undefined && month !== undefined)
      ? requests.filter((r) => {
          const d = new Date(r.scheduledDate);
          return d.getFullYear() === year && d.getMonth() === month;
        })
      : requests;

    return filtered.map((r) => ({
      id: r.id,
      scheduledDate: r.scheduledDate,
      status: r.status,
      address: r.address,
      city: r.city,
      state: r.state,
      zipCode: r.zipCode,
      customerNotes: r.customerNotes,
      vendorNotes: r.vendorNotes,
      customer: r.customer
        ? { id: r.customer.id, name: `${r.customer.firstName} ${r.customer.lastName}`, email: r.customer.email, phone: r.customer.phone }
        : { id: r.customerId, name: 'Unknown', email: '', phone: '' },
      vendor: r.vendor
        ? { id: r.vendor.id, name: `${r.vendor.firstName} ${r.vendor.lastName}`, email: r.vendor.email, phone: r.vendor.phone }
        : null,
    }));
  }
}
