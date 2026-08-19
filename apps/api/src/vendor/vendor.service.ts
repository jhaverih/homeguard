import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany } from './entities/vendor-company.entity';
import { VendorCapability, CertificationType } from './entities/vendor-capability.entity';
import { VendorCapabilitySelection } from './entities/vendor-capability-selection.entity';
import { VendorCapabilityAcknowledgment } from './entities/vendor-capability-acknowledgment.entity';
import { VendorCertification, CertificationReviewStatus } from './entities/vendor-certification.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Dispute } from '../service-requests/entities/dispute.entity';
import { InspectionNote } from '../inspections/entities/inspection.entity';
import { InspectionTaskResult } from '../inspections/entities/inspection-task-result.entity';
import { UserRole, UserStatus, PaymentStatus, ServiceRequestStatus } from '../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { UploadsService } from '../uploads/uploads.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { emailEquals } from '../common/utils/email.util';
import { getEnabledCounties, isEnabledCountyFips } from '../common/utils/county.utils';
import { PricingService } from '../pricing/pricing.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { ServiceGroup, SERVICE_GROUP_META } from '../common/enums/service-group.enum';
import { calcAssessmentVendorCost } from '../common/utils/property-surcharge.utils';

const CAPABILITY_SEED: {
  name: string;
  requiredCertificationType: CertificationType;
  trainingDocumentUrl?: string;
  requiresAcknowledgment?: boolean;
}[] = [
  {
    name: 'Yolink Home Monitoring Setup',
    requiredCertificationType: CertificationType.NONE,
    trainingDocumentUrl: '/training/yolink-home-monitoring-setup.html',
    requiresAcknowledgment: true,
  },
  { name: 'HVAC Contractor', requiredCertificationType: CertificationType.HVAC },
  { name: 'Electrical Contractor', requiredCertificationType: CertificationType.ELECTRICAL },
  { name: 'Plumbing Contractor', requiredCertificationType: CertificationType.PLUMBING },
  { name: 'Carpenter', requiredCertificationType: CertificationType.NONE },
  { name: 'Drywall work', requiredCertificationType: CertificationType.NONE },
  { name: 'Pressure wash', requiredCertificationType: CertificationType.NONE },
  { name: 'Install fans', requiredCertificationType: CertificationType.NONE },
  { name: 'Install home appliances', requiredCertificationType: CertificationType.NONE },
  { name: 'Replace a toilet', requiredCertificationType: CertificationType.NONE },
  { name: 'Water leak inspection', requiredCertificationType: CertificationType.NONE },
  { name: 'HVAC Full inspection', requiredCertificationType: CertificationType.HVAC },
  { name: 'Electrical Panel inspection', requiredCertificationType: CertificationType.ELECTRICAL },
  { name: 'New water softener/filtering system installation', requiredCertificationType: CertificationType.PLUMBING },
  { name: 'Assembly new furniture', requiredCertificationType: CertificationType.NONE },
  { name: 'Move furniture', requiredCertificationType: CertificationType.NONE },
  // Licensed trades
  { name: 'Roofing Contractor', requiredCertificationType: CertificationType.ROOFING },
  // No platform-enforced license — large-masonry licensing requirements are
  // handled via Terms & Conditions / legal compliance language, not app-enforced.
  { name: 'Masonry', requiredCertificationType: CertificationType.NONE },
  { name: 'Renovation / General Contracting', requiredCertificationType: CertificationType.GENERAL_CONTRACTOR },
  { name: 'Solar Installation', requiredCertificationType: CertificationType.NABCEP },
  // Handyman broad categories
  { name: 'Interior Repairs & Maintenance', requiredCertificationType: CertificationType.NONE },
  { name: 'Minor Electrical Adjustments', requiredCertificationType: CertificationType.NONE },
  { name: 'Minor Plumbing Fixes', requiredCertificationType: CertificationType.NONE },
  { name: 'Mounting & Installations', requiredCertificationType: CertificationType.NONE },
  { name: 'Carpentry & Assembly', requiredCertificationType: CertificationType.NONE },
  { name: 'Exterior & Outdoor Services', requiredCertificationType: CertificationType.NONE },
];

@Injectable()
export class VendorService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(VendorProfile) private vendorProfileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorCompany) private companyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorCapability) private capabilityRepo: Repository<VendorCapability>,
    @InjectRepository(VendorCapabilitySelection) private selectionRepo: Repository<VendorCapabilitySelection>,
    @InjectRepository(VendorCapabilityAcknowledgment) private acknowledgmentRepo: Repository<VendorCapabilityAcknowledgment>,
    @InjectRepository(VendorCertification) private certificationRepo: Repository<VendorCertification>,
    @InjectRepository(ServiceRequest) private requestsRepo: Repository<ServiceRequest>,
    @InjectRepository(Payment) private paymentsRepo: Repository<Payment>,
    @InjectRepository(Dispute) private disputesRepo: Repository<Dispute>,
    @InjectRepository(InspectionNote) private notesRepo: Repository<InspectionNote>,
    @InjectRepository(InspectionTaskResult) private taskResultsRepo: Repository<InspectionTaskResult>,
    private usersService: UsersService,
    private authService: AuthService,
    private uploadsService: UploadsService,
    private notificationsService: NotificationsService,
    private pricingService: PricingService,
    private marketplaceService: MarketplaceService,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedCapabilities();
    await this.grandfatherExistingVendors();
  }

  private async seedCapabilities() {
    for (const cap of CAPABILITY_SEED) {
      const existing = await this.capabilityRepo.findOne({ where: { name: cap.name } });
      if (!existing) await this.capabilityRepo.save(this.capabilityRepo.create(cap));
    }
  }

  // Existing vendor users (from the VendorCompany backfill) shouldn't lose access to
  // the jobs they could already see — auto-grant every non-certification-required
  // capability. Idempotent: only touches users with zero capability selections, so a
  // vendor who has since customized their list is left alone.
  private async grandfatherExistingVendors() {
    // Never auto-grant a capability that requires reading a training doc first
    // (e.g. Yolink Home Monitoring Setup) — grandfathering only covers
    // capabilities that were open-checkbox before this system existed.
    const nonCertCapabilities = await this.capabilityRepo.find({
      where: { requiredCertificationType: CertificationType.NONE, requiresAcknowledgment: false },
    });
    if (!nonCertCapabilities.length) return;

    const vendorUsers = await this.usersRepo
      .createQueryBuilder('u')
      .innerJoin('u.vendorProfile', 'vp')
      .where('u.roles LIKE :role', { role: `%${UserRole.VENDOR}%` })
      .andWhere('vp.companyId IS NOT NULL')
      .select(['u.id'])
      .getMany();

    for (const user of vendorUsers) {
      const existingCount = await this.selectionRepo.count({ where: { userId: user.id } });
      if (existingCount > 0) continue;
      await this.selectionRepo.save(
        nonCertCapabilities.map((cap) => this.selectionRepo.create({ userId: user.id, capabilityId: cap.id })),
      );
    }
  }

  private async requireProfile(userId: string): Promise<VendorProfile> {
    const profile = await this.vendorProfileRepo.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Vendor profile not found');
    return profile;
  }

  private async requireCompany(userId: string): Promise<VendorCompany> {
    const profile = await this.requireProfile(userId);
    if (!profile.companyId) throw new NotFoundException('Vendor company not found');
    const company = await this.companyRepo.findOne({ where: { id: profile.companyId } });
    if (!company) throw new NotFoundException('Vendor company not found');
    return company;
  }

  async getCustomers(userId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const requests = await this.requestsRepo.find({
      where: { vendorId: In(teamIds) },
      relations: ['customer'],
      order: { createdAt: 'DESC' },
    });
    const byCustomer = new Map<string, { id: string; name: string; email: string; jobCount: number }>();
    for (const r of requests) {
      if (!r.customer) continue;
      const existing = byCustomer.get(r.customerId);
      if (existing) existing.jobCount++;
      else byCustomer.set(r.customerId, {
        id: r.customer.id,
        name: `${r.customer.firstName} ${r.customer.lastName}`,
        email: r.customer.email,
        jobCount: 1,
      });
    }
    return [...byCustomer.values()];
  }

  // stripePaymentIntentId is never returned to a vendor — internal-only,
  // same rule as the customer-facing disputes endpoints.
  private omitPaymentIntentId<T extends { stripePaymentIntentId?: string }>(row: T) {
    const { stripePaymentIntentId, ...rest } = row;
    return rest;
  }

  async getPayments(userId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const payments = await this.paymentsRepo.find({ where: { vendorId: In(teamIds) }, order: { createdAt: 'DESC' } });
    const safe = payments.map((p) => this.omitPaymentIntentId(p));
    return {
      received: safe.filter((p) => p.status === PaymentStatus.SUCCEEDED),
      pending: safe.filter((p) => p.status === PaymentStatus.PENDING || p.status === PaymentStatus.AUTHORIZED),
      disputed: safe.filter((p) => p.status === PaymentStatus.DISPUTED),
    };
  }

  async getDisputes(userId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const disputes = await this.disputesRepo.find({ where: { vendorId: In(teamIds) }, order: { createdAt: 'DESC' } });
    return disputes.map((d) => this.omitPaymentIntentId(d));
  }

  async getJobs(userId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const requests = await this.requestsRepo.find({
      where: { vendorId: In(teamIds) },
      relations: ['customer', 'vendor'],
      order: { createdAt: 'DESC' },
    });
    return Promise.all(requests.map(async (r) => ({
      id: r.id,
      ticketNumber: r.ticketNumber,
      type: r.type,
      status: r.status,
      address: r.address,
      city: r.city,
      state: r.state,
      scheduledDate: r.scheduledDate,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
      customer: r.customer ? { id: r.customer.id, name: `${r.customer.firstName} ${r.customer.lastName}` } : null,
      technician: r.vendor ? {
        id: r.vendor.id,
        name: `${r.vendor.firstName} ${r.vendor.lastName}`,
        avatarUrl: r.vendor.avatarUrl ? await this.uploadsService.getSignedUrl(r.vendor.avatarUrl) : null,
      } : null,
    })));
  }

  async getJobReport(userId: string, jobId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const request = await this.requestsRepo.findOne({ where: { id: jobId }, relations: ['additionalServices'] });
    if (!request || !request.vendorId || !teamIds.includes(request.vendorId)) {
      throw new NotFoundException('Job not found');
    }
    const isSolar = (request.additionalServices ?? []).some((s) => s.name?.toLowerCase().includes('solar'));

    const [notes, taskResults] = await Promise.all([
      this.notesRepo.find({ where: { serviceRequestId: jobId } }),
      this.taskResultsRepo.find({ where: { serviceRequestId: jobId } }),
    ]);

    const notesResolved = await Promise.all(notes.map(async (n) => ({
      ...n,
      photoUrls: n.photoUrls?.length ? await Promise.all(n.photoUrls.map((k) => this.uploadsService.getSignedUrl(k))) : [],
    })));
    const tasksResolved = await Promise.all(taskResults.map(async (t) => ({
      ...t,
      photoKeys: t.photoKeys?.length ? await Promise.all(t.photoKeys.map((k) => this.uploadsService.getSignedUrl(k))) : [],
    })));

    return { notes: notesResolved, taskResults: tasksResolved, isSolar };
  }

  async assignJob(userId: string, jobId: string, technicianId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    if (!teamIds.includes(technicianId)) throw new BadRequestException('Technician is not on your team');

    const request = await this.requestsRepo.findOne({ where: { id: jobId } });
    if (!request || !request.vendorId || !teamIds.includes(request.vendorId)) {
      throw new NotFoundException('Job not found');
    }

    request.vendorId = technicianId;
    return this.requestsRepo.save(request);
  }

  async autoAssignJob(userId: string, jobId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const request = await this.requestsRepo.findOne({ where: { id: jobId } });
    if (!request || !request.vendorId || !teamIds.includes(request.vendorId)) {
      throw new NotFoundException('Job not found');
    }

    const activeCounts = await Promise.all(teamIds.map(async (id) => {
      const count = await this.requestsRepo.count({
        where: { vendorId: id, status: In([
          ServiceRequestStatus.ACCEPTED, ServiceRequestStatus.VENDOR_EN_ROUTE, ServiceRequestStatus.IN_PROGRESS,
        ]) },
      });
      return { id, count };
    }));
    activeCounts.sort((a, b) => a.count - b.count);
    const nextTechnicianId = activeCounts[0]?.id ?? userId;

    request.vendorId = nextTechnicianId;
    return this.requestsRepo.save(request);
  }

  async getStatus(userId: string) {
    const company = await this.requireCompany(userId);
    return {
      planTier: company.planTier,
      elitePlanExpiresAt: company.elitePlanExpiresAt,
      eliteRequestedAt: company.eliteRequestedAt,
      assignmentMode: company.assignmentMode,
      applicationStatus: company.applicationStatus,
    };
  }

  async requestElite(userId: string) {
    const company = await this.requireCompany(userId);
    if (company.planTier === 'ELITE') return company;
    company.eliteRequestedAt = new Date();
    const saved = await this.companyRepo.save(company);

    await this.notificationsService.notifyAdmins(
      NotificationType.ELITE_REQUESTED,
      'Elite Plan Requested',
      `${company.name} has requested an upgrade to the Elite plan.`,
      { vendorCompanyId: company.id },
    );

    return saved;
  }

  async retractEliteRequest(userId: string) {
    const company = await this.requireCompany(userId);
    if (!company.eliteRequestedAt || company.planTier === 'ELITE') {
      throw new BadRequestException('No pending Elite request to retract');
    }
    company.eliteRequestedAt = null;
    return this.companyRepo.save(company);
  }

  async setAssignmentMode(userId: string, mode: 'MANUAL' | 'ROUND_ROBIN') {
    const company = await this.requireCompany(userId);
    company.assignmentMode = mode;
    return this.companyRepo.save(company);
  }

  async getCompany(userId: string) {
    const company = await this.requireCompany(userId);
    const logoUrl = company.logoKey ? await this.uploadsService.getSignedUrl(company.logoKey) : null;
    return { ...company, logoUrl };
  }

  async updateCompany(userId: string, data: { name?: string; logoKey?: string; serviceCounties?: string[] }) {
    const company = await this.requireCompany(userId);
    if (data.name !== undefined) company.name = data.name;
    if (data.logoKey !== undefined) company.logoKey = data.logoKey;
    if (data.serviceCounties !== undefined) {
      if (data.serviceCounties.some((fips) => !isEnabledCountyFips(fips))) {
        throw new BadRequestException('One or more counties are not currently open for service-area selection');
      }
      company.serviceCounties = data.serviceCounties;
    }
    const saved = await this.companyRepo.save(company);
    // Keep the legacy per-profile companyName in sync for old read sites.
    await this.vendorProfileRepo.update({ companyId: company.id }, { companyName: saved.name });
    return saved;
  }

  getSelectableCounties() {
    return getEnabledCounties();
  }

  async getTeam(userId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const users = await this.usersRepo.find({ where: { id: In(teamIds) }, relations: ['vendorProfile'] });
    return Promise.all(users.map(async (u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      avatarUrl: u.avatarUrl ? await this.uploadsService.getSignedUrl(u.avatarUrl) : null,
      status: u.status,
      isCompanyAdmin: u.vendorProfile?.isCompanyAdmin ?? false,
    })));
  }

  async createTechnician(userId: string, data: { email: string; firstName: string; lastName: string; avatarUrl?: string }) {
    const company = await this.requireCompany(userId);
    const existing = await this.usersRepo.findOne({ where: { email: emailEquals(data.email) } });
    if (existing) throw new ConflictException('Email already in use');

    const throwawayPassword = crypto.randomBytes(24).toString('hex');
    const created = await this.usersService.create({
      email: data.email,
      password: throwawayPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      roles: [UserRole.VENDOR],
      skipCompanyCreation: true,
    });
    const profile = await this.vendorProfileRepo.findOne({ where: { userId: created.id } });
    if (profile) {
      await this.vendorProfileRepo.update(profile.id, { companyId: company.id, isCompanyAdmin: false, companyName: company.name });
    }
    // Joining an already-vetted company — no separate platform-level approval needed,
    // unlike a brand-new company registration which starts PENDING_APPROVAL.
    // isEmailVerified: true — the inviting company owner already vouches for
    // this email, and there's no verification UI for a technician created
    // this way (they never go through the mobile registration wizard), so
    // it would otherwise never become true and this account could never log in.
    const userUpdate: { status: UserStatus; avatarUrl?: string; isEmailVerified: boolean } = { status: UserStatus.ACTIVE, isEmailVerified: true };
    if (data.avatarUrl) userUpdate.avatarUrl = data.avatarUrl;
    await this.usersRepo.update(created.id, userUpdate);
    await this.authService.forgotPassword(data.email);

    return this.usersRepo.findOne({ where: { id: created.id } });
  }

  async updateTeamMember(actingUserId: string, memberId: string, data: { firstName?: string; lastName?: string; avatarUrl?: string }) {
    const teamIds = await this.usersService.getVendorTeamIds(actingUserId);
    if (!teamIds.includes(memberId)) throw new BadRequestException('Not a member of your team');

    const update: { firstName?: string; lastName?: string; avatarUrl?: string } = {};
    if (data.firstName !== undefined) update.firstName = data.firstName;
    if (data.lastName !== undefined) update.lastName = data.lastName;
    if (data.avatarUrl !== undefined) update.avatarUrl = data.avatarUrl;
    if (Object.keys(update).length) await this.usersRepo.update(memberId, update);

    return this.usersRepo.findOne({ where: { id: memberId } });
  }

  async removeTeamMember(userId: string, memberId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    if (!teamIds.includes(memberId) || memberId === userId) {
      throw new BadRequestException('Not a removable team member');
    }
    const profile = await this.vendorProfileRepo.findOne({ where: { userId: memberId } });
    if (!profile) throw new NotFoundException('Team member not found');
    await this.vendorProfileRepo.update(profile.id, { companyId: null, isCompanyAdmin: false });
    return { success: true };
  }

  async getCustomerHistory(userId: string, customerId: string) {
    const company = await this.requireCompany(userId);
    if (company.planTier !== 'ELITE') {
      throw new ForbiddenException('Customer history requires an Elite plan');
    }
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const requests = await this.requestsRepo.find({
      where: { customerId, vendorId: In(teamIds) },
      order: { createdAt: 'DESC' },
    });
    return requests.map((r) => ({
      id: r.id,
      ticketNumber: r.ticketNumber,
      type: r.type,
      status: r.status,
      scheduledDate: r.scheduledDate,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    }));
  }

  async getCapabilities(userId?: string) {
    const capabilities = await this.capabilityRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    if (!userId) return capabilities;

    const acks = await this.acknowledgmentRepo.find({ where: { userId } });
    const ackedIds = new Set(acks.map((a) => a.capabilityId));
    return capabilities.map((c) => ({ ...c, acknowledged: ackedIds.has(c.id) }));
  }

  async getMyCapabilities(userId: string) {
    const selections = await this.selectionRepo.find({ where: { userId }, relations: ['capability'] });
    return selections.map((s) => s.capability);
  }

  async setMyCapabilities(userId: string, capabilityIds: string[]) {
    // Defensive — a malformed client payload (e.g. a stray null/undefined
    // entry) should fail cleanly, not crash the insert with an unhandled
    // NOT NULL violation surfaced to the user as a raw 500.
    capabilityIds = (capabilityIds ?? []).filter((id): id is string => !!id);

    if (capabilityIds.length) {
      const capabilities = await this.capabilityRepo.find({ where: { id: In(capabilityIds) } });
      const needingAck = capabilities.filter((c) => c.requiresAcknowledgment);
      if (needingAck.length) {
        const acks = await this.acknowledgmentRepo.find({
          where: { userId, capabilityId: In(needingAck.map((c) => c.id)) },
        });
        const ackedIds = new Set(acks.map((a) => a.capabilityId));
        const missing = needingAck.find((c) => !ackedIds.has(c.id));
        if (missing) {
          throw new BadRequestException(`Read and confirm the training material for "${missing.name}" before selecting it.`);
        }
      }
    }

    // Wrapped in a transaction — previously the delete committed immediately
    // and the insert was a separate statement, so a failed insert (e.g. the
    // NOT NULL crash this was fixed alongside) left the vendor with their
    // prior selections wiped and nothing in their place.
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(VendorCapabilitySelection, { userId });
      if (capabilityIds.length) {
        await manager.save(
          capabilityIds.map((capabilityId) => manager.create(VendorCapabilitySelection, { userId, capabilityId })),
        );
      }
    });
    return this.getMyCapabilities(userId);
  }

  async acknowledgeCapability(userId: string, capabilityId: string) {
    const capability = await this.capabilityRepo.findOne({ where: { id: capabilityId } });
    if (!capability) throw new NotFoundException('Capability not found');

    const existing = await this.acknowledgmentRepo.findOne({ where: { userId, capabilityId } });
    if (existing) return existing;

    return this.acknowledgmentRepo.save(this.acknowledgmentRepo.create({ userId, capabilityId }));
  }

  // ── My Rates (vendor-facing compensation reference) ─────────────────────────
  // Never surfaces customer prices, gmPercent, or the platform-fee percentage —
  // only the vendor-side numbers admin has configured. Formula-heavy items
  // (dynamic GM% brackets, the platform-fee-split payout, per-customer
  // characteristic surcharges) are deliberately reduced to plain-language
  // base/range figures rather than shown as computed formulas.

  private formatLinearRate(base: number, perUnit: number, includedQty: number, unit: string): { shapeTag: string; rateText: string } {
    if (!perUnit) return { shapeTag: 'Flat Rate', rateText: `$${base.toFixed(2)} flat` };
    if (includedQty > 0) {
      const plural = includedQty !== 1 ? 's' : '';
      return { shapeTag: 'Tiered', rateText: `$${base.toFixed(2)} for the first ${includedQty} ${unit}${plural}, then $${perUnit.toFixed(2)} per additional ${unit}` };
    }
    return { shapeTag: 'Tiered', rateText: `$${base.toFixed(2)} base, plus $${perUnit.toFixed(2)} per ${unit}` };
  }

  // Package-style entries (Lawncare/Pest/Template) never carry their own
  // vendor rate — compensation decomposes to whichever underlying services
  // apply to the actual work order, so every package gets the same
  // compensation line, only the included-services list changes.
  private readonly PACKAGE_COMPENSATION_TEXT = 'Based on applicable contracted service rates';

  private resolveLawncareLikeItem(svc: { subCostBase: number; subCostPerUnit: number; includedQty: number; pricingUnit: string }) {
    return this.formatLinearRate(Number(svc.subCostBase), Number(svc.subCostPerUnit), Number(svc.includedQty || 0), svc.pricingUnit || 'unit');
  }

  async getRates(userId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const selections = await this.selectionRepo.find({ where: { userId: In(teamIds) } });
    const unlockedCapabilityIds = new Set(selections.map((s) => s.capabilityId));

    // ── Plain catalog (Inspect/Repair/Improve/Maintain) ──────────────────────
    const catalogItems = await this.pricingService.getAll(false);
    const catalogGroups = [ServiceGroup.INSPECT, ServiceGroup.REPAIR, ServiceGroup.IMPROVE, ServiceGroup.MAINTAIN]
      .map((group) => {
        const items = catalogItems
          .filter((item) => item.serviceGroups?.includes(group))
          .filter((item) => !item.requiredCapabilityId || unlockedCapabilityIds.has(item.requiredCapabilityId))
          .map((item) => {
            if (item.useCharacteristicPricing) {
              // calcAssessmentVendorCost is per-customer-home (a formula) — rather
              // than show that formula, compute its two boundaries (no surcharge /
              // fully-saturated surcharge) once and show the resulting range.
              const zero = { squareFootage: 0, hvacCount: 0, waterHeaterCount: 0, bathroomCount: 0, kitchenCount: 0, hasDetachedGarage: false };
              const max = { squareFootage: 999999, hvacCount: 999, waterHeaterCount: 999, bathroomCount: 999, kitchenCount: 2, hasDetachedGarage: true };
              const base = calcAssessmentVendorCost(zero);
              const ceiling = calcAssessmentVendorCost(max);
              return { id: item.id, name: item.name, shapeTag: 'Flat + Surcharge', rateText: `$${base.toFixed(2)} flat, up to $${ceiling.toFixed(2)} for larger properties` };
            }
            if (item.requiresQuote) {
              return { id: item.id, name: item.name, shapeTag: 'Quoted', rateText: 'Request a Quote' };
            }
            return { id: item.id, name: item.name, shapeTag: item.pricingMethod === 'PER_UNIT' ? 'Tiered' : 'Flat Rate', rateText: item.priceDisplay };
          });
        return { group, label: SERVICE_GROUP_META[group].label, items };
      })
      .filter((g) => g.items.length > 0);

    // ── Lawn Care ─────────────────────────────────────────────────────────────
    const { services: lawncareServices, packages: lawncarePackages } = await this.marketplaceService.getLawncareConfig(false);
    const lawncareByKey = new Map(lawncareServices.map((s) => [s.key, s]));
    const lawnMowing = lawncareByKey.get('lawn_mowing');
    const lawncare = lawncareServices.length === 0 ? null : {
      packages: lawncarePackages.map((pkg) => ({
        id: pkg.id,
        label: pkg.label,
        includedServiceLabels: pkg.composition.map((c) => lawncareByKey.get(c.serviceKey)?.label).filter((l): l is string => !!l),
        compensationText: this.PACKAGE_COMPENSATION_TEXT,
      })),
      mowingTiers: lawnMowing?.sizeTiers?.map((t) => ({
        label: t.label,
        vendorRateText: t.requiresQuote || t.vendorBase == null ? 'Custom Quote' : `$${Number(t.vendorBase).toFixed(2)}`,
        adderText: t.requiresQuote || t.vendorAddlRate == null ? '—' : `$${Number(t.vendorAddlRate).toFixed(2)}`,
      })) ?? null,
      services: lawncareServices
        .filter((s) => s.key !== 'lawn_mowing')
        .map((s) => ({ id: s.id, name: s.label, ...this.resolveLawncareLikeItem(s) })),
    };

    // ── Pest Control ──────────────────────────────────────────────────────────
    const { services: pestServices, packages: pestPackages } = await this.marketplaceService.getPestConfig(false);
    const pestByKey = new Map(pestServices.map((s) => [s.key, s]));
    const pest = pestServices.length === 0 ? null : {
      packages: pestPackages.map((pkg) => ({
        id: pkg.id,
        label: pkg.label,
        includedServiceLabels: pkg.composition.map((c) => pestByKey.get(c.serviceKey)?.label).filter((l): l is string => !!l),
        compensationText: this.PACKAGE_COMPENSATION_TEXT,
      })),
      services: pestServices.map((s) => ({ id: s.id, name: s.label, ...this.resolveLawncareLikeItem(s) })),
    };

    // ── House Cleaning ────────────────────────────────────────────────────────
    const { plans: cleaningPlans } = await this.marketplaceService.getConfig(false);
    const houseCleaning = cleaningPlans.length === 0 ? null : {
      plans: cleaningPlans.map((p) => ({
        id: p.id,
        name: `${p.cleaningType.charAt(0)}${p.cleaningType.slice(1).toLowerCase()} Cleaning`,
        shapeTag: 'Per Unit',
        rateText: `$${Number(p.costPerUnit).toFixed(2)} per room-unit`,
      })),
    };

    // ── Dynamic Offer Templates (admin-created verticals beyond the three above) ──
    const offerTemplates = await this.marketplaceService.getOfferTemplates(false);
    const templates = [];
    for (const tpl of offerTemplates) {
      if (tpl.requiredCapabilityId && !unlockedCapabilityIds.has(tpl.requiredCapabilityId)) continue;
      const { packages, services } = await this.marketplaceService.getOfferTemplateConfig(tpl.id, false);
      if (services.length === 0) continue;
      const svcByKey = new Map(services.map((s) => [s.key, s]));
      templates.push({
        id: tpl.id,
        name: tpl.name,
        packages: packages.map((pkg) => ({
          id: pkg.id,
          label: pkg.name,
          includedServiceLabels: services.filter((s) => s.packageIds?.includes(pkg.id)).map((s) => s.label),
          compensationText: this.PACKAGE_COMPENSATION_TEXT,
        })),
        services: services
          .filter((s) => !svcByKey.get(s.key)?.packageIds?.length) // à la carte only — package-only services are represented via their package's included list above
          .map((s) => ({ id: s.id, name: s.label, ...this.resolveLawncareLikeItem(s) })),
      });
    }

    return { catalogGroups, lawncare, pest, houseCleaning, templates };
  }

  // Company-admin-only (enforced at the controller via @VendorAdminOnly()) — shows every
  // certification submitted by anyone on the admin's team, not just their own, with a
  // resolved signed document URL and submitter identity attached.
  async getMyCertifications(userId: string) {
    const teamIds = await this.usersService.getVendorTeamIds(userId);
    const certs = await this.certificationRepo.find({ where: { userId: In(teamIds) }, order: { createdAt: 'DESC' } });
    const submitterIds = [...new Set(certs.map((c) => c.userId))];
    const submitters = submitterIds.length ? await this.usersRepo.find({ where: { id: In(submitterIds) } }) : [];
    const submitterMap = new Map(submitters.map((u) => [u.id, u]));
    return Promise.all(certs.map(async (c) => {
      const submitter = submitterMap.get(c.userId);
      return {
        ...c,
        documentUrl: c.documentKey ? await this.uploadsService.getSignedUrl(c.documentKey) : null,
        user: submitter ? { id: submitter.id, name: `${submitter.firstName} ${submitter.lastName}`, email: submitter.email } : null,
      };
    }));
  }

  async submitCertification(userId: string, data: {
    certificationType: CertificationType; licenseNumber: string; issuingState?: string;
    expirationDate: string; documentKey: string;
  }) {
    const cert = this.certificationRepo.create({
      userId,
      certificationType: data.certificationType,
      licenseNumber: data.licenseNumber,
      issuingState: data.issuingState,
      expirationDate: new Date(data.expirationDate),
      documentKey: data.documentKey,
      status: CertificationReviewStatus.PENDING_REVIEW,
    });
    return this.certificationRepo.save(cert);
  }

  // Editing a teammate's certification is company-admin-only (enforced at the
  // controller); re-verify the target actually belongs to the admin's own team so a
  // guessed ID from another company can't be edited (NotFoundException, not
  // ForbiddenException, so existence of a foreign cert ID isn't leaked either).
  async updateCertification(adminUserId: string, certId: string, data: {
    certificationType?: CertificationType; licenseNumber?: string; issuingState?: string;
    expirationDate?: string; documentKey?: string;
  }) {
    const teamIds = await this.usersService.getVendorTeamIds(adminUserId);
    const cert = await this.certificationRepo.findOne({ where: { id: certId } });
    if (!cert || !teamIds.includes(cert.userId)) throw new NotFoundException('Certification not found');

    if (data.certificationType !== undefined) cert.certificationType = data.certificationType;
    if (data.licenseNumber !== undefined) cert.licenseNumber = data.licenseNumber;
    if (data.issuingState !== undefined) cert.issuingState = data.issuingState;
    if (data.expirationDate !== undefined) cert.expirationDate = new Date(data.expirationDate);
    if (data.documentKey !== undefined) cert.documentKey = data.documentKey;
    // An edited license needs re-verification — same assumption Attenteve's own review flow makes.
    cert.status = CertificationReviewStatus.PENDING_REVIEW;
    cert.reviewedAt = null;
    cert.reviewNotes = null;
    const saved = await this.certificationRepo.save(cert);

    return {
      ...saved,
      documentUrl: saved.documentKey ? await this.uploadsService.getSignedUrl(saved.documentKey) : null,
    };
  }

  async getApplication(userId: string) {
    return this.requireCompany(userId);
  }

  async submitApplication(userId: string, data: {
    ein?: string; stateRegistrationDocKey?: string;
    coiDocumentKey?: string; coiExpirationDate?: string;
  }) {
    const company = await this.requireCompany(userId);
    if (data.ein !== undefined) company.ein = data.ein;
    if (data.stateRegistrationDocKey !== undefined) company.stateRegistrationDocKey = data.stateRegistrationDocKey;
    if (data.coiDocumentKey !== undefined) company.coiDocumentKey = data.coiDocumentKey;
    if (data.coiExpirationDate !== undefined) company.coiExpirationDate = new Date(data.coiExpirationDate);
    return this.companyRepo.save(company);
  }
}
