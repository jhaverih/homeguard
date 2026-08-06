import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, LessThanOrEqual, In, DeepPartial } from 'typeorm';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { CustomerSubscription, SubscriptionStatus } from '../subscriptions/entities/customer-subscription.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { Dispute } from '../service-requests/entities/dispute.entity';
import { Review } from '../reviews/entities/review.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { CustomerProfile } from '../users/entities/customer-profile.entity';
import { UserRole, UserStatus, PaymentStatus, ServiceRequestStatus, PlanTier } from '../common/enums/role.enum';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { UploadsService } from '../uploads/uploads.service';
import { EmailService } from '../common/email/email.service';
import { ServiceRequestsService } from '../service-requests/service-requests.service';
import { PricingService } from '../pricing/pricing.service';
import { VendorCompany, VendorApplicationStatus } from '../vendor/entities/vendor-company.entity';
import { VendorCertification, CertificationReviewStatus } from '../vendor/entities/vendor-certification.entity';
import { VendorCapability, CertificationType } from '../vendor/entities/vendor-capability.entity';
import { VendorMembershipPayment } from '../vendor/entities/vendor-membership-payment.entity';
import { WaitlistSignup } from '../service-area/entities/waitlist-signup.entity';
import { emailEquals } from '../common/utils/email.util';
import { getEnabledCounties, isEnabledCountyFips } from '../common/utils/county.utils';
import { geocodeAddress } from '../common/utils/geocode.utils';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(VendorProfile) private vendorProfileRepo: Repository<VendorProfile>,
    @InjectRepository(CustomerSubscription) private subscriptionsRepo: Repository<CustomerSubscription>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(ServiceRequest) private requestsRepo: Repository<ServiceRequest>,
    @InjectRepository(Review) private reviewsRepo: Repository<Review>,
    @InjectRepository(Dispute) private disputesRepo: Repository<Dispute>,
    @InjectRepository(Alert) private alertsRepo: Repository<Alert>,
    @InjectRepository(CustomerProfile) private customerProfileRepo: Repository<CustomerProfile>,
    @InjectRepository(VendorCompany) private vendorCompanyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorCertification) private vendorCertificationRepo: Repository<VendorCertification>,
    @InjectRepository(VendorCapability) private vendorCapabilityRepo: Repository<VendorCapability>,
    @InjectRepository(VendorMembershipPayment) private membershipPaymentsRepo: Repository<VendorMembershipPayment>,
    @InjectRepository(YolinkHome) private yolinkHomesRepo: Repository<YolinkHome>,
    @InjectRepository(WaitlistSignup) private waitlistRepo: Repository<WaitlistSignup>,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
    private uploadsService: UploadsService,
    private emailService: EmailService,
    private serviceRequestsService: ServiceRequestsService,
    private pricingService: PricingService,
    private configService: ConfigService,
    private paymentsService: PaymentsService,
  ) {}

  private getAdminPortalUrl(): string {
    return (this.configService.get<string>('ADMIN_PORTAL_URL') || 'http://192.168.86.29/admin').replace(/\/$/, '');
  }

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

    const companyIds = [...new Set(users.map((u) => u.vendorProfile?.companyId).filter(Boolean))] as string[];
    const companies = companyIds.length
      ? await this.vendorCompanyRepo.find({ where: { id: In(companyIds) } })
      : [];
    const companyMap = new Map(companies.map((c) => [c.id, c]));

    return users.map((u) => {
      const company = u.vendorProfile?.companyId ? companyMap.get(u.vendorProfile.companyId) : undefined;
      return {
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        phone: u.phone,
        status: u.status,
        companyName: company?.name ?? u.vendorProfile?.companyName ?? null,
        logoKey: company?.logoKey ?? null,
        createdAt: u.createdAt,
        stripeConnected: !!(company?.stripeConnectAccountId ?? u.vendorProfile?.stripeConnectAccountId),
        planTier: company?.planTier ?? u.vendorProfile?.planTier ?? 'STANDARD',
        elitePlanExpiresAt: company?.elitePlanExpiresAt ?? u.vendorProfile?.elitePlanExpiresAt ?? null,
        eliteRequestedAt: company?.eliteRequestedAt ?? null,
        isCompanyAdmin: u.vendorProfile?.isCompanyAdmin ?? false,
        address: company?.address ?? null,
        city: company?.city ?? null,
        state: company?.state ?? null,
        zipCode: company?.zipCode ?? null,
        serviceCounties: company?.serviceCounties ?? null,
      };
    });
  }

  async approveVendor(vendorId: string) {
    await this.usersRepo.update(vendorId, { status: UserStatus.ACTIVE });
    return this.usersRepo.findOne({ where: { id: vendorId }, relations: ['vendorProfile'] });
  }

  async removeVendor(vendorId: string) {
    await this.usersRepo.update(vendorId, { status: UserStatus.SUSPENDED });
    return { success: true };
  }

  // Lets platform admin view/correct a vendor's location and coverage-area
  // radius directly — previously only that vendor's own Company Admin could
  // set this (VendorService.updateCompany), and it was never populated at
  // signup at all, so real vendors had no service area and the public zip
  // checker always reported "not covered."
  async updateVendorServiceArea(
    vendorId: string,
    data: { address?: string; city?: string; state?: string; zipCode?: string; serviceCounties?: string[] },
  ) {
    const profile = await this.vendorProfileRepo.findOne({ where: { userId: vendorId } });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    // Every vendor gets a company at registration except technicians invited
    // onto an existing team (skipCompanyCreation) — those share their team's
    // company once they join, but there's a window before that where they
    // have none of their own to edit. Distinct from a missing profile row
    // above (that would be a data-integrity bug; this is expected).
    if (!profile.companyId) throw new NotFoundException("This vendor isn't linked to a company yet — nothing to edit.");

    if (data.serviceCounties?.some((fips) => !isEnabledCountyFips(fips))) {
      throw new BadRequestException('One or more counties are not currently open for service-area selection');
    }

    await this.vendorCompanyRepo.update(profile.companyId, {
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.zipCode !== undefined ? { zipCode: data.zipCode } : {}),
      ...(data.serviceCounties !== undefined ? { serviceCounties: data.serviceCounties } : {}),
    });
    return this.vendorCompanyRepo.findOne({ where: { id: profile.companyId } });
  }

  getSelectableCounties() {
    return getEnabledCounties();
  }

  // Superuser-only correction of a customer's address on file — mirrors
  // updateVendorServiceArea's shape/conditional-update pattern above.
  // Some customer accounts (6 found live, e.g. pre-dating the registration
  // requiredness fix) have no CustomerProfile row at all — this used to
  // throw NotFoundException, and the admin page's Save handler had no
  // catch to surface it, so it just looked like Save did nothing. Create
  // the row on first save instead of failing.
  async updateCustomerAddress(
    customerId: string,
    data: { address?: string; city?: string; state?: string; zipCode?: string },
  ) {
    const profile = await this.customerProfileRepo.findOne({ where: { userId: customerId } });
    if (!profile) {
      const user = await this.usersRepo.findOne({ where: { id: customerId } });
      if (!user) throw new NotFoundException('Customer not found');
      const address = data.address ?? '';
      const city = data.city ?? '';
      const state = data.state ?? '';
      const zipCode = data.zipCode ?? '';
      const coords = await geocodeAddress(address, city, state, zipCode);
      const created = this.customerProfileRepo.create({
        userId: customerId,
        address,
        city,
        state,
        zipCode,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      return this.customerProfileRepo.save(created);
    }

    // Re-geocode using the merged (existing + incoming) fields whenever any
    // address field actually changes — a partial update (e.g. zip only)
    // still needs the full address to geocode correctly.
    const addressChanged = ['address', 'city', 'state', 'zipCode'].some(
      (k) => (data as any)[k] !== undefined && (data as any)[k] !== (profile as any)[k],
    );
    const coords = addressChanged
      ? await geocodeAddress(
          data.address ?? profile.address,
          data.city ?? profile.city,
          data.state ?? profile.state,
          data.zipCode ?? profile.zipCode,
        )
      : null;

    await this.customerProfileRepo.update(profile.id, {
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.zipCode !== undefined ? { zipCode: data.zipCode } : {}),
      ...(addressChanged ? { latitude: coords?.lat ?? null, longitude: coords?.lng ?? null } : {}),
    });
    return this.customerProfileRepo.findOne({ where: { id: profile.id } });
  }

  async removeCustomer(customerId: string) {
    const customer = await this.usersRepo.findOne({ where: { id: customerId } });
    if (!customer || !customer.roles.includes(UserRole.CUSTOMER)) {
      throw new NotFoundException('Customer not found');
    }
    await this.usersRepo.update(customerId, { status: UserStatus.SUSPENDED });
    return { success: true };
  }

  async setVendorPlan(vendorId: string, tier: 'STANDARD' | 'ELITE', expiresAt?: string) {
    const profile = await this.vendorProfileRepo.findOne({ where: { userId: vendorId } });
    if (!profile) throw new NotFoundException('Vendor profile not found');

    if (tier === 'ELITE') {
      const teamIds = await this.usersService.getVendorTeamIds(vendorId);
      const qualifyingCert = await this.vendorCertificationRepo.findOne({
        where: {
          userId: In(teamIds),
          status: CertificationReviewStatus.APPROVED,
          certificationType: In([
            CertificationType.ELECTRICAL,
            CertificationType.HVAC,
            CertificationType.PLUMBING,
            CertificationType.NABCEP,
          ]),
        },
      });
      if (!qualifyingCert) {
        throw new BadRequestException(
          'Elite tier requires the company to have at least one team member with an approved Electrical, Mechanical (HVAC), Plumbing, or NABCEP solar certification.',
        );
      }
    }

    // Eligible for Elite — now actually collect the membership fee before
    // activating anything. Default amount is a placeholder pending business
    // sign-off; override via ELITE_MEMBERSHIP_FEE without a code change.
    if (tier === 'ELITE') {
      const fee = parseFloat(this.configService.get('ELITE_MEMBERSHIP_FEE', '199'));
      const charge = await this.paymentsService.chargeVendorMembershipFee(
        vendorId,
        fee,
        'Attenteve Elite Membership',
      );

      const membershipPayment = this.membershipPaymentsRepo.create({
        vendorCompanyId: profile.companyId ?? vendorId,
        amount: fee,
        status: charge.status === 'succeeded' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
        stripePaymentIntentId: charge.paymentIntentId,
        failureReason: charge.failureReason ?? null,
      });
      await this.membershipPaymentsRepo.save(membershipPayment);

      if (charge.status !== 'succeeded') {
        await this.notificationsService.notifyUser(
          vendorId,
          NotificationType.ELITE_PAYMENT_FAILED,
          'Elite Membership Payment Failed',
          'We could not charge your card for the Elite membership fee. Please update your payment method and ask an admin to try again.',
          {},
        );
        throw new BadRequestException(
          `Elite membership charge failed: ${charge.failureReason ?? 'unknown error'}. Elite was not activated.`,
        );
      }
    }

    const elitePlanExpiresAt = tier === 'ELITE' && expiresAt ? new Date(expiresAt) : null;

    if (profile.companyId) {
      await this.vendorCompanyRepo.update(profile.companyId, {
        planTier: tier,
        elitePlanExpiresAt,
        eliteRequestedAt: null,
      });
      await this.vendorProfileRepo.update({ companyId: profile.companyId }, { planTier: tier, elitePlanExpiresAt });
    } else {
      profile.planTier = tier;
      profile.elitePlanExpiresAt = elitePlanExpiresAt;
      await this.vendorProfileRepo.save(profile);
    }

    await this.notificationsService.notifyUser(
      vendorId,
      tier === 'ELITE' ? NotificationType.ELITE_ACTIVATED : NotificationType.SERVICE_UPDATE,
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

  async getVendorKpi(vendorId: string): Promise<any> {
    const vendor = await this.usersRepo.findOne({
      where: { id: vendorId },
      relations: ['vendorProfile'],
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const company = vendor.vendorProfile?.companyId
      ? await this.vendorCompanyRepo.findOne({ where: { id: vendor.vendorProfile.companyId } })
      : null;

    const allJobs = await this.requestsRepo.find({ where: { vendorId } });
    const completed = allJobs.filter((j) => j.status === ServiceRequestStatus.COMPLETED);
    const cancelled = allJobs.filter((j) => j.status === ServiceRequestStatus.CANCELLED);

    // Response time: createdAt → scheduledDate (proxy for acceptance time, since we don't store acceptedAt)
    const responseTimes = allJobs
      .filter((j) => j.scheduledDate)
      .map((j) => (new Date(j.scheduledDate).getTime() - new Date(j.createdAt).getTime()) / 3600000);
    const avgResponseHours = responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

    // Completion time: scheduledDate → completedAt
    const completionTimes = completed
      .filter((j) => j.scheduledDate && j.completedAt)
      .map((j) => (new Date(j.completedAt).getTime() - new Date(j.scheduledDate).getTime()) / 3600000);
    const avgCompletionHours = completionTimes.length
      ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length * 10) / 10
      : null;

    // Revenue from payments
    const payments = await this.paymentsRepo.find({ where: { vendorId, status: PaymentStatus.SUCCEEDED } });
    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.vendorAmount ?? 0), 0);

    // Monthly job counts (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyMap: Record<string, { completed: number; total: number }> = {};
    for (const job of allJobs.filter((j) => new Date(j.createdAt) >= sixMonthsAgo)) {
      const key = new Date(job.createdAt).toISOString().slice(0, 7);
      if (!monthlyMap[key]) monthlyMap[key] = { completed: 0, total: 0 };
      monthlyMap[key].total++;
      if (job.status === ServiceRequestStatus.COMPLETED) monthlyMap[key].completed++;
    }

    // Reviews
    const reviews = await this.reviewsRepo.find({
      where: { vendorId },
      order: { createdAt: 'DESC' },
    });
    const avgRating = reviews.length
      ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10
      : null;
    const ratingBreakdown = [1,2,3,4,5].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));

    return {
      vendor: {
        id: vendor.id,
        name: `${vendor.firstName} ${vendor.lastName}`,
        email: vendor.email,
        companyName: vendor.vendorProfile?.companyName,
        joinedAt: vendor.createdAt,
        address: company?.address ?? null,
        city: company?.city ?? null,
        state: company?.state ?? null,
        zipCode: company?.zipCode ?? null,
        serviceCounties: company?.serviceCounties ?? null,
      },
      jobs: {
        total: allJobs.length,
        completed: completed.length,
        cancelled: cancelled.length,
        completionRate: allJobs.length ? Math.round(completed.length / allJobs.length * 100) : 0,
      },
      responsiveness: {
        avgResponseHours,
        avgCompletionHours,
      },
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        jobCount: payments.length,
      },
      monthlyTrend: Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, counts]) => ({ month, ...counts })),
      reviews: {
        averageRating: avgRating,
        totalCount: reviews.length,
        ratingBreakdown,
        recent: reviews.slice(0, 10).map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
        })),
      },
    };
  }

  async getCustomerActivity(customerId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: customerId },
      relations: ['customerProfile'],
    });
    if (!user) throw new NotFoundException('Customer not found');

    const [serviceRequests, payments, disputes, alerts] = await Promise.all([
      this.requestsRepo.find({
        where: { customerId },
        relations: ['vendor'],
        order: { createdAt: 'DESC' },
      }),
      this.paymentsRepo.find({
        where: { customerId },
        order: { createdAt: 'DESC' },
      }),
      this.disputesRepo.find({
        where: { customerId },
        order: { createdAt: 'DESC' },
      }),
      this.alertsRepo.find({
        where: { customerId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const vendorIds = [...new Set(disputes.map((d) => d.vendorId).filter(Boolean))];
    const vendors = vendorIds.length
      ? await this.usersRepo.createQueryBuilder('u').where('u.id IN (:...ids)', { ids: vendorIds }).getMany()
      : [];
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));

    return {
      customer: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        address: user.customerProfile?.address ?? null,
        city: user.customerProfile?.city ?? null,
        state: user.customerProfile?.state ?? null,
        zipCode: user.customerProfile?.zipCode ?? null,
        createdAt: user.createdAt,
      },
      serviceRequests: serviceRequests.map((r) => ({
        id: r.id,
        ticketNumber: r.ticketNumber,
        type: r.type,
        address: r.address,
        city: r.city,
        state: r.state,
        status: r.status,
        scheduledDate: r.scheduledDate,
        createdAt: r.createdAt,
        vendor: r.vendor ? { id: r.vendor.id, firstName: r.vendor.firstName, lastName: r.vendor.lastName, email: r.vendor.email } : null,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        description: p.description,
        amount: p.amount,
        status: p.status,
        paidAt: p.capturedAt,
        createdAt: p.createdAt,
      })),
      disputes: disputes.map((d) => {
        const v = vendorMap.get(d.vendorId);
        return {
          id: d.id,
          status: d.status,
          category: d.category,
          description: d.description,
          createdAt: d.createdAt,
          vendor: v ? { id: v.id, firstName: v.firstName, lastName: v.lastName, email: v.email } : null,
        };
      }),
      alerts: alerts.map((a) => ({
        id: a.id,
        severity: a.severity,
        deviceType: a.deviceType,
        deviceName: a.deviceName,
        message: a.message,
        createdAt: a.createdAt,
      })),
    };
  }

  async getVendorActivity(vendorId: string) {
    const user = await this.usersRepo.findOne({
      where: { id: vendorId },
      relations: ['vendorProfile'],
    });
    if (!user) throw new NotFoundException('Vendor not found');

    const [jobs, payments] = await Promise.all([
      this.requestsRepo.find({
        where: { vendorId },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
      this.paymentsRepo.find({
        where: { vendorId },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
    ]);

    return {
      vendor: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        companyName: user.vendorProfile?.companyName ?? null,
        createdAt: user.createdAt,
      },
      jobs: jobs.map((j) => ({
        id: j.id,
        ticketNumber: j.ticketNumber,
        type: j.type,
        address: j.address,
        city: j.city,
        state: j.state,
        status: j.status,
        scheduledDate: j.scheduledDate,
        completedAt: j.completedAt,
        createdAt: j.createdAt,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        description: p.description,
        amount: p.amount,
        vendorAmount: p.vendorAmount,
        status: p.status,
        capturedAt: p.capturedAt,
        createdAt: p.createdAt,
      })),
    };
  }

  async getAlerts(page = 1, limit = 50): Promise<{ alerts: any[]; total: number }> {
    const [alerts, total] = await this.alertsRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const customerIds = [...new Set(alerts.map((a) => a.customerId))];
    const [users, profiles] = await Promise.all([
      customerIds.length
        ? this.usersRepo.createQueryBuilder('u').where('u.id IN (:...ids)', { ids: customerIds }).getMany()
        : Promise.resolve([]),
      customerIds.length
        ? this.customerProfileRepo.createQueryBuilder('cp').where('cp.userId IN (:...ids)', { ids: customerIds }).getMany()
        : Promise.resolve([]),
    ]);

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

    return {
      total,
      alerts: alerts.map((alert) => {
        const user = userMap[alert.customerId];
        const profile = profileMap[alert.customerId];
        return {
          ...alert,
          customer: user
            ? {
                name: `${user.firstName} ${user.lastName}`,
                email: user.email,
                address: profile ? `${profile.address}, ${profile.city}, ${profile.state} ${profile.zipCode}` : null,
              }
            : null,
        };
      }),
    };
  }

  async getTeamUsers(callerLevel: AdminLevel) {
    const users = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.roles LIKE :role', { role: `%${UserRole.ADMIN}%` })
      .orderBy('u.createdAt', 'ASC')
      .getMany();

    // Admins (not Super Users) never see other Admin/Super User rows — not
    // just restricted actions on them, the rows themselves are invisible.
    const visible = callerLevel === AdminLevel.SUPER_USER
      ? users
      : users.filter((u) => u.adminLevel === AdminLevel.VIEW_ONLY);

    return visible.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      adminLevel: u.adminLevel,
      status: u.status,
      createdAt: u.createdAt,
    }));
  }

  async createTeamUser(
    data: { email: string; firstName: string; lastName: string; adminLevel: AdminLevel },
    callerLevel: AdminLevel,
  ) {
    if (callerLevel !== AdminLevel.SUPER_USER && data.adminLevel !== AdminLevel.VIEW_ONLY) {
      throw new BadRequestException('You can only add View Only users.');
    }

    const existing = await this.usersRepo.findOne({ where: { email: emailEquals(data.email) } });
    if (existing) throw new ConflictException('Email already in use');

    // Throwaway password — the invitee sets their own via the forgot-password flow below.
    const throwawayPassword = crypto.randomBytes(24).toString('hex');
    const created = await this.usersService.create({
      email: data.email,
      password: throwawayPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      roles: [UserRole.ADMIN],
    });
    await this.usersRepo.update(created.id, { adminLevel: data.adminLevel });
    const loginUrl = `${this.getAdminPortalUrl()}/forgot-password?email=${encodeURIComponent(data.email)}`;
    await this.emailService.sendTeamInvite(data.email, data.firstName, loginUrl);

    return this.usersRepo.findOne({ where: { id: created.id } });
  }

  async updateTeamUserLevel(userId: string, adminLevel: AdminLevel) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || !user.roles.includes(UserRole.ADMIN)) throw new NotFoundException('Admin user not found');

    if (user.adminLevel === AdminLevel.SUPER_USER && adminLevel !== AdminLevel.SUPER_USER) {
      const superUserCount = await this.usersRepo
        .createQueryBuilder('u')
        .where('u.adminLevel = :level', { level: AdminLevel.SUPER_USER })
        .andWhere('u.status = :status', { status: UserStatus.ACTIVE })
        .getCount();
      if (superUserCount <= 1) {
        throw new BadRequestException('Cannot demote the last remaining Super User');
      }
    }

    await this.usersRepo.update(userId, { adminLevel });
    return this.usersRepo.findOne({ where: { id: userId } });
  }

  async removeTeamUser(userId: string, callerLevel: AdminLevel) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || !user.roles.includes(UserRole.ADMIN)) throw new NotFoundException('Admin user not found');
    if (callerLevel !== AdminLevel.SUPER_USER && user.adminLevel !== AdminLevel.VIEW_ONLY) {
      throw new NotFoundException('Admin user not found');
    }

    if (user.adminLevel === AdminLevel.SUPER_USER) {
      const superUserCount = await this.usersRepo
        .createQueryBuilder('u')
        .where('u.adminLevel = :level', { level: AdminLevel.SUPER_USER })
        .andWhere('u.status = :status', { status: UserStatus.ACTIVE })
        .getCount();
      if (superUserCount <= 1) {
        throw new BadRequestException('Cannot remove the last remaining Super User');
      }
    }

    await this.usersRepo.update(userId, { status: UserStatus.SUSPENDED });
    return { success: true };
  }

  async reinstateTeamUser(userId: string, callerLevel: AdminLevel) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || !user.roles.includes(UserRole.ADMIN)) throw new NotFoundException('Admin user not found');
    if (callerLevel !== AdminLevel.SUPER_USER && user.adminLevel !== AdminLevel.VIEW_ONLY) {
      throw new NotFoundException('Admin user not found');
    }

    await this.usersRepo.update(userId, { status: UserStatus.ACTIVE });
    return this.usersRepo.findOne({ where: { id: userId } });
  }

  // Route-level @MinAdminLevel(AdminLevel.SUPER_USER) already restricts every
  // caller to Super User — no per-target-level carve-out needed here.
  async deleteTeamUser(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user || !user.roles.includes(UserRole.ADMIN)) throw new NotFoundException('Admin user not found');

    if (user.status !== UserStatus.SUSPENDED) {
      throw new BadRequestException('Suspend this user first (Remove) before deleting permanently.');
    }

    if (user.adminLevel === AdminLevel.SUPER_USER) {
      const superUserCount = await this.usersRepo
        .createQueryBuilder('u')
        .where('u.adminLevel = :level', { level: AdminLevel.SUPER_USER })
        .andWhere('u.status = :status', { status: UserStatus.ACTIVE })
        .getCount();
      if (superUserCount === 0) {
        throw new BadRequestException('Cannot delete the last Super User — reinstate another Super User first.');
      }
    }

    try {
      await this.usersRepo.delete(userId);
    } catch (err: any) {
      throw new BadRequestException('Could not delete this user — it may still have related records.');
    }
    return { success: true };
  }

  async getVendorApplications(status?: VendorApplicationStatus) {
    const companies = await this.vendorCompanyRepo.find({
      where: status ? { applicationStatus: status } : {},
      order: { createdAt: 'DESC' },
    });

    const admins = await this.usersRepo
      .createQueryBuilder('u')
      .innerJoinAndSelect('u.vendorProfile', 'vp')
      .where('vp.isCompanyAdmin = true')
      .andWhere('vp.companyId IN (:...ids)', { ids: companies.map((c) => c.id).length ? companies.map((c) => c.id) : [''] })
      .getMany();
    const adminByCompany = new Map(admins.map((a) => [a.vendorProfile.companyId, a]));

    return Promise.all(companies.map(async (c) => {
      const admin = adminByCompany.get(c.id);
      const coiValid = !!c.coiDocumentKey && !!c.coiExpirationDate && new Date(c.coiExpirationDate) > new Date();
      const [stateRegistrationUrl, coiUrl, adminAvatarUrl] = await Promise.all([
        c.stateRegistrationDocKey ? this.uploadsService.getSignedUrl(c.stateRegistrationDocKey) : Promise.resolve(null),
        c.coiDocumentKey ? this.uploadsService.getSignedUrl(c.coiDocumentKey) : Promise.resolve(null),
        admin?.avatarUrl ? this.uploadsService.getSignedUrl(admin.avatarUrl) : Promise.resolve(null),
      ]);
      return {
        ...c,
        stateRegistrationUrl,
        coiUrl,
        vendorAdmin: admin ? { id: admin.id, name: `${admin.firstName} ${admin.lastName}`, email: admin.email, avatarUrl: adminAvatarUrl } : null,
        completeness: {
          stateRegistration: !!c.stateRegistrationDocKey,
          ein: !!c.ein,
          coi: coiValid,
          vendorAdminPhoto: !!admin?.avatarUrl,
        },
      };
    }));
  }

  async reviewVendorApplication(companyId: string, status: VendorApplicationStatus, reviewNotes?: string) {
    const company = await this.vendorCompanyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Vendor company not found');

    company.applicationStatus = status;
    company.reviewedAt = new Date();
    company.reviewNotes = reviewNotes ?? null;
    await this.vendorCompanyRepo.save(company);

    const admin = await this.usersRepo
      .createQueryBuilder('u')
      .innerJoin('u.vendorProfile', 'vp')
      .where('vp.companyId = :companyId', { companyId })
      .andWhere('vp.isCompanyAdmin = true')
      .getOne();

    if (admin) {
      if (status === VendorApplicationStatus.APPROVED) {
        await this.usersRepo.update(admin.id, { status: UserStatus.ACTIVE });
      }
      const titles: Record<string, string> = {
        [VendorApplicationStatus.APPROVED]: 'Application Approved',
        [VendorApplicationStatus.REJECTED]: 'Application Rejected',
        [VendorApplicationStatus.NEEDS_INFO]: 'More Information Needed',
      };
      await this.notificationsService.notifyUser(
        admin.id,
        NotificationType.SERVICE_UPDATE,
        titles[status] ?? 'Application Updated',
        reviewNotes || `Your company application status is now ${status}.`,
        {},
      );
    }

    return company;
  }

  async getVendorCertifications(status?: CertificationReviewStatus) {
    const certs = await this.vendorCertificationRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
    const userIds = [...new Set(certs.map((c) => c.userId))];
    const users = userIds.length ? await this.usersRepo.find({ where: { id: In(userIds) } }) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return Promise.all(certs.map(async (c) => {
      const user = userMap.get(c.userId);
      const documentUrl = c.documentKey ? await this.uploadsService.getSignedUrl(c.documentKey) : null;
      return {
        ...c,
        documentUrl,
        user: user ? { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email } : null,
        completeness: {
          licenseNumber: !!c.licenseNumber,
          notExpired: new Date(c.expirationDate) > new Date(),
          document: !!c.documentKey,
        },
      };
    }));
  }

  async reviewVendorCertification(certId: string, status: CertificationReviewStatus, reviewNotes?: string) {
    const cert = await this.vendorCertificationRepo.findOne({ where: { id: certId } });
    if (!cert) throw new NotFoundException('Certification not found');

    cert.status = status;
    cert.reviewedAt = new Date();
    cert.reviewNotes = reviewNotes ?? null;
    await this.vendorCertificationRepo.save(cert);

    const titles: Record<string, string> = {
      [CertificationReviewStatus.APPROVED]: 'Certification Approved',
      [CertificationReviewStatus.REJECTED]: 'Certification Rejected',
    };
    await this.notificationsService.notifyUser(
      cert.userId,
      NotificationType.SERVICE_UPDATE,
      titles[status] ?? 'Certification Updated',
      reviewNotes || `Your ${cert.certificationType} certification status is now ${status}.`,
      {},
    );

    return cert;
  }

  async createCapability(data: { name: string; requiredCertificationType: string }): Promise<VendorCapability> {
    const entity: DeepPartial<VendorCapability> = { name: data.name, requiredCertificationType: data.requiredCertificationType as CertificationType };
    const saved = await this.vendorCapabilityRepo.save(this.vendorCapabilityRepo.create(entity));

    // Every active vendor, not just ones currently marked available for jobs
    // — this is an announcement, not a job-matching notification.
    const vendors = await this.usersService.findAllActiveVendors();
    if (vendors.length > 0) {
      await this.notificationsService.notifyVendors(
        vendors,
        NotificationType.NEW_CAPABILITY_AVAILABLE,
        'New Capability Available',
        `"${saved.name}" has been added — update your profile if you'd like to offer it.`,
        { screen: 'capabilities' },
      ).catch(() => {});
    }

    return saved;
  }

  async updateCapability(id: string, data: Partial<{ name: string; requiredCertificationType: string; isActive: boolean }>) {
    const capability = await this.vendorCapabilityRepo.findOne({ where: { id } });
    if (!capability) throw new NotFoundException('Capability not found');
    Object.assign(capability, data);
    return this.vendorCapabilityRepo.save(capability);
  }

  async getCapabilities() {
    return this.vendorCapabilityRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  // ── Home Monitoring Setup dispatch ────────────────────────────────────────

  // Annotates every active Standard/Premium customer with their connection
  // state, rather than filtering connected ones out — the admin UI needs to
  // show "Connected" + Edit for them, not just silently drop them from the list.
  private async getMonitoringCandidates(): Promise<{ customerId: string; isConnected: boolean; hasPendingRequest: boolean }[]> {
    const activeSubs = await this.subscriptionsRepo.find({ where: { status: SubscriptionStatus.ACTIVE } });
    const candidateIds = activeSubs
      .filter((s) => s.plan?.tier === PlanTier.STANDARD || s.plan?.tier === PlanTier.PREMIUM)
      .map((s) => s.customerId);
    if (candidateIds.length === 0) return [];

    const connectedHomes = await this.yolinkHomesRepo.find({ where: { customerId: In(candidateIds), isActive: true } });
    const connectedIds = new Set(connectedHomes.map((h) => h.customerId));

    let requestedIds = new Set<string>();
    const monitoringPrice = await this.pricingService.findByName('Home Monitoring Setup');
    if (monitoringPrice) {
      const existingRequests = await this.requestsRepo.find({
        where: { customerId: In(candidateIds), servicePriceId: monitoringPrice.id },
      });
      requestedIds = new Set(existingRequests.map((r) => r.customerId));
    }

    return candidateIds.map((id) => ({
      customerId: id,
      isConnected: connectedIds.has(id),
      hasPendingRequest: requestedIds.has(id),
    }));
  }

  async getMonitoringSetupRequests() {
    const candidates = await this.getMonitoringCandidates();
    if (candidates.length === 0) return [];
    const customers = await this.usersRepo.find({ where: { id: In(candidates.map((c) => c.customerId)) } });
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    return candidates
      .filter((c) => customerMap.has(c.customerId))
      .map((c) => {
        const u = customerMap.get(c.customerId)!;
        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          isConnected: c.isConnected,
          hasPendingRequest: c.hasPendingRequest,
        };
      });
  }

  async requestMonitoringConnection(customerId: string) {
    const monitoringPrice = await this.pricingService.findByName('Home Monitoring Setup');
    if (!monitoringPrice) {
      throw new BadRequestException('Add a "Home Monitoring Setup" service in Pricing first.');
    }
    const profile = await this.customerProfileRepo.findOne({ where: { userId: customerId } });
    if (!profile) throw new BadRequestException('This customer has no address on file.');

    const preferredDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    return this.serviceRequestsService.createStandaloneService(customerId, {
      servicePriceId: monitoringPrice.id,
      preferredDate: preferredDate.toISOString(),
      address: profile.address,
      city: profile.city,
      state: profile.state,
      zipCode: profile.zipCode,
      customerNotes: 'Home monitoring setup — requested by Houmi',
    });
  }

  async getWaitlist() {
    return this.waitlistRepo.find({ order: { createdAt: 'DESC' } });
  }
}
