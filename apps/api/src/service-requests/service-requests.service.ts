import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, forwardRef, Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, FindOptionsWhere, MoreThan, MoreThanOrEqual, DataSource } from 'typeorm';
import { ServiceRequest, ServiceType } from './entities/service-request.entity';
import { AdditionalService } from './entities/additional-service.entity';
import { SolarQuote } from './entities/solar-quote.entity';
import { SolarConsultation } from './entities/solar-consultation.entity';
import { ServiceRequestRejection } from './entities/service-request-rejection.entity';
import { ServiceRequestStatus, UserRole, PaymentType } from '../common/enums/role.enum';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { PaymentsService } from '../payments/payments.service';
import { PricingService } from '../pricing/pricing.service';
import { InspectionsService } from '../inspections/inspections.service';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany } from '../vendor/entities/vendor-company.entity';
import { VendorCapability, CertificationType } from '../vendor/entities/vendor-capability.entity';
import { VendorCapabilitySelection } from '../vendor/entities/vendor-capability-selection.entity';
import { VendorCertification, CertificationReviewStatus } from '../vendor/entities/vendor-certification.entity';
import { ServicePrice } from '../pricing/entities/service-price.entity';
import { calcTieredCost } from '../pricing/pricing.utils';
import { PricingMethod } from '../common/enums/pricing-method.enum';

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    @InjectRepository(AdditionalService)
    private additionalRepo: Repository<AdditionalService>,
    @InjectRepository(SolarQuote)
    private solarQuoteRepo: Repository<SolarQuote>,
    @InjectRepository(SolarConsultation)
    private solarConsultationRepo: Repository<SolarConsultation>,
    @InjectRepository(ServiceRequestRejection)
    private rejectionRepo: Repository<ServiceRequestRejection>,
    private subscriptionsService: SubscriptionsService,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
    private uploadsService: UploadsService,
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
    private pricingService: PricingService,
    @Inject(forwardRef(() => InspectionsService))
    private inspectionsService: InspectionsService,
    @InjectRepository(VendorProfile)
    private vendorProfileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorCompany)
    private vendorCompanyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorCapability)
    private vendorCapabilityRepo: Repository<VendorCapability>,
    @InjectRepository(VendorCapabilitySelection)
    private vendorCapabilitySelectionRepo: Repository<VendorCapabilitySelection>,
    @InjectRepository(VendorCertification)
    private vendorCertificationRepo: Repository<VendorCertification>,
    @InjectRepository(ServicePrice)
    private servicePriceRepo: Repository<ServicePrice>,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {}

  private async generateTicketNumber(): Promise<string> {
    const date = new Date();
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const prefix = `HSV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const count = await this.requestsRepo.count({ where: { createdAt: MoreThanOrEqual(startOfDay) } });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  // ticketNumber has a real DB unique constraint but generateTicketNumber()'s
  // count-then-increment is a plain read-then-write race under concurrent
  // submissions — this is the actual safety net: regenerate and retry on a
  // unique-violation instead of trusting the count blindly.
  private async saveNewRequest(build: (ticketNumber: string) => Partial<ServiceRequest>): Promise<ServiceRequest> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ticketNumber = await this.generateTicketNumber();
      const entity = this.requestsRepo.create(build(ticketNumber));
      try {
        return await this.requestsRepo.save(entity);
      } catch (e: any) {
        if (e?.code === '23505' && attempt < 4) continue;
        throw e;
      }
    }
    throw new Error('Failed to generate a unique ticket number after multiple attempts');
  }

  async create(customerId: string, dto: {
    preferredDate: string;
    customerNotes?: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    isPaidAddon?: boolean;
  }): Promise<ServiceRequest> {
    // Family members use the parent's subscription
    const subscriptionOwnerId = await this.usersService.getEffectiveSubscriptionOwnerId(customerId);
    const subscription = await this.subscriptionsService.getActiveSubscription(subscriptionOwnerId);
    if (!subscription) throw new BadRequestException('No active subscription found');

    const pendingCount = await this.requestsRepo.count({
      where: {
        subscriptionId: subscription.id,
        status: Not(In([ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED])),
      },
    });
    const limitReached = subscription.inspectionsUsed + pendingCount >= subscription.plan.inspectionsPerYear;
    if (limitReached && !dto.isPaidAddon) {
      throw new BadRequestException('No inspections remaining on your subscription');
    }

    const addonPrice = limitReached && dto.isPaidAddon
      ? Number(subscription.plan.addonInspectionPrice)
      : null;

    const saved = await this.saveNewRequest((ticketNumber) => ({
      customerId,
      subscriptionId: subscription.id,
      type: ServiceType.SCHEDULED_INSPECTION,
      status: ServiceRequestStatus.PENDING,
      ticketNumber,
      preferredDate: new Date(dto.preferredDate),
      customerNotes: dto.customerNotes,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      zipCode: dto.zipCode,
      isPaidAddon: !!addonPrice,
      addonPrice,
    }));

    const vendors = await this.usersService.findAvailableVendors();
    if (vendors.length > 0) {
      await this.notificationsService.notifyVendors(
        vendors,
        NotificationType.NEW_REQUEST,
        'New Inspection Request',
        `A customer in ${dto.city}, ${dto.state} needs an inspection.`,
        { serviceRequestId: saved.id },
      );
    }

    return saved;
  }

  async createStandaloneService(customerId: string, dto: {
    servicePriceId: string;
    preferredDate: string;
    customerNotes?: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    bookingGroupId?: string;
    quantity?: number;
  }): Promise<ServiceRequest> {
    const subscriptionOwnerId = await this.usersService.getEffectiveSubscriptionOwnerId(customerId);
    const subscription = await this.subscriptionsService.getActiveSubscription(subscriptionOwnerId);
    if (!subscription) throw new BadRequestException('No active subscription found');

    const prices = await this.pricingService.getAll();
    const servicePrice = prices.find((p) => p.id === dto.servicePriceId);
    if (!servicePrice) throw new BadRequestException('Service not found');

    // PER_UNIT bills a tiered cost (see calcTieredCost) at the billed
    // quantity, floored at minimumQuantity (if set) so the charge always
    // reflects at least the disclosed minimum. Other methods (Flat Price,
    // One-Time Fee, Request Quote) ignore quantity entirely — a single fixed
    // fee has no unit count.
    const isPerUnit = servicePrice.pricingMethod === PricingMethod.PER_UNIT;
    const enteredQty = isPerUnit ? (dto.quantity ?? 1) : 1;
    const minQty = servicePrice.minimumQuantity ? Number(servicePrice.minimumQuantity) : 0;
    const billedQty = isPerUnit && minQty > 0 ? Math.max(enteredQty, minQty) : enteredQty;

    const markup = servicePrice.markupPercent != null ? Number(servicePrice.markupPercent) : 15;
    const cost = calcTieredCost(servicePrice, billedQty);
    const customerPrice = Math.round(cost * (1 + markup / 100) * 100) / 100;

    const saved = await this.saveNewRequest((ticketNumber) => ({
      customerId,
      subscriptionId: subscription.id,
      type: ServiceType.ADDITIONAL_SERVICE,
      status: ServiceRequestStatus.PENDING,
      ticketNumber,
      preferredDate: new Date(dto.preferredDate),
      customerNotes: dto.customerNotes,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      zipCode: dto.zipCode,
      isPaidAddon: false,
      addonPrice: customerPrice,
      servicePriceId: servicePrice.id,
      bookingGroupId: dto.bookingGroupId ?? null,
    }));

    // Pre-create the approved additional service so vendor sees it immediately
    await this.additionalRepo.save(this.additionalRepo.create({
      serviceRequestId: saved.id,
      name: servicePrice.name,
      description: servicePrice.description,
      price: customerPrice,
      servicePriceId: servicePrice.id,
      quantity: isPerUnit ? billedQty : null,
      approved: true,
      approvedAt: new Date(),
    }));

    const vendors = await this.usersService.findAvailableVendors();
    if (vendors.length > 0) {
      await this.notificationsService.notifyVendors(
        vendors,
        NotificationType.NEW_REQUEST,
        'New Service Request',
        `A customer needs: ${servicePrice.name} in ${dto.city}, ${dto.state}.`,
        { serviceRequestId: saved.id },
      );
    }

    return saved;
  }

  async accept(requestId: string, vendorId: string, scheduledDate: string, notes?: string): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.status !== ServiceRequestStatus.PENDING) {
      throw new BadRequestException('Request is no longer available');
    }

    const proposed = new Date(scheduledDate);
    const preferred = new Date(request.preferredDate);
    const diffMs = Math.abs(proposed.getTime() - preferred.getTime());
    const sametime = diffMs < 5 * 60 * 1000;

    request.vendorId = vendorId;
    request.scheduledDate = proposed;
    if (notes?.trim()) request.vendorNotes = notes.trim();

    if (sametime) {
      request.status = ServiceRequestStatus.ACCEPTED;
      const saved = await this.requestsRepo.save(request);
      await this.notificationsService.notifyUser(
        request.customerId,
        NotificationType.REQUEST_ACCEPTED,
        'Vendor Accepted Your Request',
        `Your inspection has been scheduled for ${proposed.toLocaleDateString()}.`,
        { serviceRequestId: saved.id },
      );
      return saved;
    }

    request.status = ServiceRequestStatus.PENDING_CUSTOMER_REVIEW;
    const saved = await this.requestsRepo.save(request);
    await this.notificationsService.notifyUser(
      request.customerId,
      NotificationType.SCHEDULE_CHANGED,
      'Vendor Proposed a New Time',
      `Your vendor proposed ${proposed.toLocaleDateString()} at ${proposed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Please accept or decline.`,
      { serviceRequestId: saved.id },
    );
    return saved;
  }

  // Claims every request in the group this vendor is currently eligible for
  // and still PENDING — not all-or-nothing. A request another vendor claims
  // in the moment between this vendor loading their list and tapping "Accept
  // All" is silently skipped rather than failing the whole batch, since the
  // goal is avoiding *unnecessary* multi-vendor dispatch, not guaranteeing
  // every original group member goes to one vendor.
  async acceptGroup(bookingGroupId: string, vendorId: string, scheduledDate: string, notes?: string): Promise<ServiceRequest[]> {
    const eligible = await this.getEligiblePendingRequests(vendorId);
    const groupRequests = eligible.filter((r) => r.bookingGroupId === bookingGroupId);
    if (groupRequests.length === 0) {
      throw new BadRequestException('No eligible requests in this group are available');
    }

    const proposed = new Date(scheduledDate);
    const accepted: ServiceRequest[] = [];

    await this.dataSource.transaction(async (manager) => {
      for (const r of groupRequests) {
        const fresh = await manager.findOne(ServiceRequest, { where: { id: r.id } });
        if (!fresh || fresh.status !== ServiceRequestStatus.PENDING) continue;

        const preferred = new Date(fresh.preferredDate);
        const diffMs = Math.abs(proposed.getTime() - preferred.getTime());
        const sametime = diffMs < 5 * 60 * 1000;

        fresh.vendorId = vendorId;
        fresh.scheduledDate = proposed;
        if (notes?.trim()) fresh.vendorNotes = notes.trim();
        fresh.status = sametime ? ServiceRequestStatus.ACCEPTED : ServiceRequestStatus.PENDING_CUSTOMER_REVIEW;

        await manager.save(fresh);
        accepted.push(fresh);
      }
    });

    if (accepted.length === 0) {
      throw new BadRequestException('These requests are no longer available');
    }

    for (const saved of accepted) {
      const sametime = saved.status === ServiceRequestStatus.ACCEPTED;
      await this.notificationsService.notifyUser(
        saved.customerId,
        sametime ? NotificationType.REQUEST_ACCEPTED : NotificationType.SCHEDULE_CHANGED,
        sametime ? 'Vendor Accepted Your Request' : 'Vendor Proposed a New Time',
        sametime
          ? `Your service has been scheduled for ${proposed.toLocaleDateString()}.`
          : `Your vendor proposed ${proposed.toLocaleDateString()} at ${proposed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Please accept or decline.`,
        { serviceRequestId: saved.id },
      );
    }

    return accepted;
  }

  async confirmSchedule(requestId: string, customerId: string): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    if (!relatedIds.includes(request.customerId)) throw new ForbiddenException();
    if (request.status !== ServiceRequestStatus.PENDING_CUSTOMER_REVIEW) {
      throw new BadRequestException('No pending time review for this request');
    }
    request.status = ServiceRequestStatus.ACCEPTED;
    const saved = await this.requestsRepo.save(request);
    await this.notificationsService.notifyUser(
      request.vendorId,
      NotificationType.SCHEDULE_CHANGED,
      'Customer Confirmed the Time',
      `The customer confirmed your proposed time for ticket ${request.ticketNumber}.`,
      { serviceRequestId: saved.id },
    );
    return saved;
  }

  async declineSchedule(requestId: string, customerId: string): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    if (!relatedIds.includes(request.customerId)) throw new ForbiddenException();
    if (request.status !== ServiceRequestStatus.PENDING_CUSTOMER_REVIEW) {
      throw new BadRequestException('No pending time review for this request');
    }
    const prevVendorId = request.vendorId;
    request.status = ServiceRequestStatus.PENDING;
    request.vendorId = null;
    request.scheduledDate = null;
    const saved = await this.requestsRepo.save(request);
    if (prevVendorId) {
      await this.notificationsService.notifyUser(
        prevVendorId,
        NotificationType.SCHEDULE_CHANGED,
        'Customer Declined the Proposed Time',
        `The customer declined your proposed time for ticket ${request.ticketNumber}. The request is back in the pool.`,
        { serviceRequestId: saved.id },
      );
    }
    return saved;
  }

  async updateStatus(
    requestId: string,
    vendorId: string,
    status: ServiceRequestStatus,
    completionPhotoKeys?: string[],
    finalQuantities?: Record<string, number>,
  ): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();

    if (status === ServiceRequestStatus.COMPLETED) {
      if (!completionPhotoKeys || completionPhotoKeys.length === 0) {
        throw new BadRequestException('At least one completion photo is required to mark a job complete');
      }
      if (request.type !== ServiceType.ADDITIONAL_SERVICE) {
        const checklistDone = await this.inspectionsService.isChecklistComplete(requestId);
        if (!checklistDone) {
          throw new BadRequestException('All inspection checklist items must be completed before closing the job');
        }
        await this.subscriptionsService.incrementInspectionsUsed(request.subscriptionId, request.isPaidAddon);
      }
      request.completionPhotoKeys = completionPhotoKeys;
      request.completedAt = new Date();

      // Create auth holds for any approved additional services
      const approvedServices = await this.additionalRepo.find({
        where: { serviceRequestId: requestId, approved: true },
      });

      // Apply any vendor-entered final quantities BEFORE the hold-creation
      // loop below reads svc.price — Stripe manual-capture holds can't be
      // increased once created, so this only works cleanly because no hold
      // exists yet at this point. Never decreases price: the customer was
      // already floored at the service's minimum quantity at booking time.
      let priceIncreased = false;
      if (finalQuantities) {
        const prices = await this.pricingService.getAll(true);
        for (const svc of approvedServices) {
          const finalQty = finalQuantities[svc.id];
          if (finalQty == null || svc.quantity == null || finalQty <= Number(svc.quantity)) continue;
          const servicePrice = svc.servicePriceId ? prices.find((p) => p.id === svc.servicePriceId) : null;
          if (!servicePrice) continue;
          const markup = servicePrice.markupPercent != null ? Number(servicePrice.markupPercent) : 15;
          const newCost = calcTieredCost(servicePrice, finalQty);
          const newPrice = Math.round(newCost * (1 + markup / 100) * 100) / 100;
          await this.additionalRepo.update(svc.id, { finalQuantity: finalQty, price: newPrice });
          svc.price = newPrice;
          priceIncreased = true;
        }
        if (priceIncreased) {
          const newTotal = approvedServices.reduce((sum, s) => sum + Number(s.price), 0);
          request.addonPrice = newTotal;
        }
      }

      for (const svc of approvedServices) {
        try {
          await this.paymentsService.createAuthHold(
            requestId,
            request.customerId,
            vendorId,
            Number(svc.price),
            svc.name,
            PaymentType.ADDITIONAL_SERVICE,
          );
        } catch (err) {
          // Don't block job completion if payment hold fails
        }
      }

      if (priceIncreased) {
        await this.notificationsService.notifyUser(
          request.customerId,
          NotificationType.SERVICE_UPDATE,
          'Final Price Updated',
          `Your vendor confirmed a larger quantity than originally estimated for "${request.ticketNumber}" — your final charge has been updated accordingly.`,
          { serviceRequestId: request.id },
        );
      }
    }

    request.status = status;
    if (status === ServiceRequestStatus.VENDOR_EN_ROUTE) {
      request.vendorEnRouteAt = new Date();
    }
    const saved = await this.requestsRepo.save(request);

    const notifMap: Partial<Record<ServiceRequestStatus, { type: NotificationType; title: string; body: string }>> = {
      [ServiceRequestStatus.VENDOR_EN_ROUTE]: {
        type: NotificationType.VENDOR_EN_ROUTE,
        title: 'Vendor On The Way',
        body: 'Your vendor is on the way. Please make sure to be home when they arrive.',
      },
      [ServiceRequestStatus.IN_PROGRESS]: {
        type: NotificationType.VENDOR_ARRIVED,
        title: 'Vendor Has Arrived',
        body: 'Your vendor has arrived and started the inspection.',
      },
      [ServiceRequestStatus.COMPLETED]: {
        type: NotificationType.JOB_COMPLETED,
        title: 'Inspection Complete',
        body: 'Your inspection has been completed. Check the notes in the app.',
      },
    };

    const notif = notifMap[status];
    if (notif) {
      await this.notificationsService.notifyUser(
        request.customerId,
        notif.type,
        notif.title,
        notif.body,
        { serviceRequestId: saved.id },
      );
    }

    return saved;
  }

  async addVendorNotes(requestId: string, vendorId: string, notes: string): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();
    request.vendorNotes = notes;
    return this.requestsRepo.save(request);
  }

  async recommendAdditionalService(
    requestId: string, vendorId: string,
    dto: { name: string; description: string; price: number },
  ): Promise<AdditionalService> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();

    const service = this.additionalRepo.create({ ...dto, serviceRequestId: requestId });
    const saved = await this.additionalRepo.save(service);

    await this.notificationsService.notifyUser(
      request.customerId,
      NotificationType.ADDITIONAL_SERVICE_RECOMMENDED,
      'Additional Service Recommended',
      `Your vendor recommends: ${dto.name} ($${dto.price})`,
      { serviceRequestId: requestId, additionalServiceId: saved.id },
    );

    return saved;
  }

  async approveAdditionalService(serviceId: string, customerId: string): Promise<AdditionalService> {
    const service = await this.additionalRepo.findOne({
      where: { id: serviceId },
      relations: ['serviceRequest'],
    });
    if (!service) throw new NotFoundException();
    if (service.serviceRequest.customerId !== customerId) throw new ForbiddenException();

    service.approved = true;
    service.approvedAt = new Date();
    const saved = await this.additionalRepo.save(service);

    await this.notificationsService.notifyUser(
      service.serviceRequest.vendorId,
      NotificationType.ADDITIONAL_SERVICE_APPROVED,
      'Additional Service Approved',
      `Customer approved: ${service.name}`,
      { serviceRequestId: service.serviceRequestId },
    );

    return saved;
  }

  async declineAdditionalService(serviceId: string, customerId: string): Promise<void> {
    const service = await this.additionalRepo.findOne({
      where: { id: serviceId },
      relations: ['serviceRequest'],
    });
    if (!service) throw new NotFoundException();
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    if (!relatedIds.includes(service.serviceRequest.customerId)) throw new ForbiddenException();
    if (service.approved) throw new BadRequestException('Service has already been approved');

    const vendorId = service.serviceRequest.vendorId;
    const svcName = service.name;
    const requestId = service.serviceRequestId;
    await this.additionalRepo.delete(serviceId);

    if (vendorId) {
      await this.notificationsService.notifyUser(
        vendorId,
        NotificationType.ADDITIONAL_SERVICE_DECLINED,
        'Additional Service Declined',
        `Customer declined: ${svcName}`,
        { serviceRequestId: requestId },
      );
    }
  }

  async getCustomerRequests(customerId: string): Promise<ServiceRequest[]> {
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    return this.requestsRepo.find({
      where: { customerId: In(relatedIds) } as FindOptionsWhere<ServiceRequest>,
      relations: ['additionalServices'],
      order: { createdAt: 'DESC' },
    });
  }

  async getVendorRequests(vendorId: string): Promise<ServiceRequest[]> {
    return this.requestsRepo.find({
      where: { vendorId },
      relations: ['customer', 'customer.customerProfile', 'additionalServices'],
      order: { scheduledDate: 'ASC' },
    });
  }

  private async getEligiblePendingRequests(callerId: string): Promise<ServiceRequest[]> {
    const callerProfile = await this.vendorProfileRepo.findOne({ where: { userId: callerId } });
    if (!callerProfile) return [];

    const [caller, company] = await Promise.all([
      this.usersService.findById(callerId),
      callerProfile.companyId
        ? this.vendorCompanyRepo.findOne({ where: { id: callerProfile.companyId } })
        : Promise.resolve(null),
    ]);

    // Mandatory face-photo gate for technicians who go into customers' homes.
    // Vendor Admins who only manage the team/company are exempt.
    if (!callerProfile.isCompanyAdmin && !caller.avatarUrl) return [];

    const isElite = company?.planTier === 'ELITE';

    const [selections, approvedCerts] = await Promise.all([
      this.vendorCapabilitySelectionRepo.find({ where: { userId: callerId } }),
      this.vendorCertificationRepo.find({
        where: { userId: callerId, status: CertificationReviewStatus.APPROVED, expirationDate: MoreThan(new Date()) },
      }),
    ]);
    const selectedCapabilityIds = new Set(selections.map((s) => s.capabilityId));
    const approvedCertTypes = new Set(approvedCerts.map((c) => c.certificationType));

    const capabilities = await this.vendorCapabilityRepo.find();
    const capabilityMap = new Map(capabilities.map((c) => [c.id, c]));

    // Every capability the caller is currently allowed to see jobs for.
    const unlockedCapabilityIds = new Set<string>();
    for (const cap of capabilities) {
      if (!selectedCapabilityIds.has(cap.id)) continue;
      if (cap.requiredCertificationType === CertificationType.NONE) {
        unlockedCapabilityIds.add(cap.id);
      } else if (isElite && approvedCertTypes.has(cap.requiredCertificationType)) {
        unlockedCapabilityIds.add(cap.id);
      }
    }

    const all = await this.requestsRepo.find({
      where: { status: ServiceRequestStatus.PENDING },
      relations: ['additionalServices'],
      order: { createdAt: 'DESC' },
    });

    const servicePriceIds = [...new Set(all.map((r) => r.servicePriceId).filter(Boolean))] as string[];
    const servicePrices = servicePriceIds.length
      ? await this.servicePriceRepo.find({ where: { id: In(servicePriceIds) } })
      : [];
    const servicePriceMap = new Map(servicePrices.map((sp) => [sp.id, sp]));

    const elitePreferentialWindowMinutes = Number(
      this.configService.get('ELITE_PREFERENTIAL_WINDOW_MINUTES', '15'),
    );
    const eliteWindowCutoff = new Date(Date.now() - elitePreferentialWindowMinutes * 60 * 1000);

    return all.filter((r) => {
      if (!r.servicePriceId) return true; // base subscription inspections — open to everyone
      const servicePrice = servicePriceMap.get(r.servicePriceId);
      if (!servicePrice?.requiredCapabilityId) return true; // no capability requirement
      const capability = capabilityMap.get(servicePrice.requiredCapabilityId);
      if (!capability) return true;

      if (!unlockedCapabilityIds.has(capability.id)) return false;

      // Trade jobs (cert-required) are Elite-exclusive already — no separate window needed.
      if (capability.requiredCertificationType !== CertificationType.NONE) return true;

      // Non-trade job: Elite companies see it immediately; Standard companies wait out the window.
      if (isElite) return true;
      return r.createdAt <= eliteWindowCutoff;
    });
  }

  async getPendingRequests(callerId: string): Promise<ServiceRequest[]> {
    const [eligible, rejections] = await Promise.all([
      this.getEligiblePendingRequests(callerId),
      this.rejectionRepo.find({ where: { vendorId: callerId } }),
    ]);
    const rejectedIds = new Set(rejections.map((r) => r.serviceRequestId));
    return eligible.filter((r) => !rejectedIds.has(r.id));
  }

  async getRejectedRequests(callerId: string): Promise<ServiceRequest[]> {
    const [eligible, rejections] = await Promise.all([
      this.getEligiblePendingRequests(callerId),
      this.rejectionRepo.find({ where: { vendorId: callerId } }),
    ]);
    const rejectedIds = new Set(rejections.map((r) => r.serviceRequestId));
    return eligible.filter((r) => rejectedIds.has(r.id));
  }

  async rejectRequest(requestId: string, vendorId: string): Promise<{ ok: boolean }> {
    const request = await this.findById(requestId);
    if (request.status !== ServiceRequestStatus.PENDING) {
      throw new BadRequestException('Request is no longer available');
    }
    const existing = await this.rejectionRepo.findOne({ where: { serviceRequestId: requestId, vendorId } });
    if (!existing) {
      await this.rejectionRepo.save(this.rejectionRepo.create({ serviceRequestId: requestId, vendorId }));
    }
    return { ok: true };
  }

  async updateVendorLocation(
    requestId: string,
    vendorId: string,
    latitude: number,
    longitude: number,
  ): Promise<{ ok: boolean }> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();
    request.vendorLatitude = latitude;
    request.vendorLongitude = longitude;
    request.vendorLocationAt = new Date();
    await this.requestsRepo.save(request);
    return { ok: true };
  }

  async getPendingAdditionalServices(customerId: string): Promise<AdditionalService[]> {
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    const requests = await this.requestsRepo.find({
      where: { customerId: In(relatedIds) } as FindOptionsWhere<ServiceRequest>,
      select: ['id'],
    });
    if (requests.length === 0) return [];
    const requestIds = requests.map((r) => r.id);
    return this.additionalRepo.find({
      where: { serviceRequestId: In(requestIds), approved: false },
      relations: ['serviceRequest', 'serviceRequest.vendor'],
      order: { createdAt: 'DESC' },
    });
  }

  async cancelRequest(requestId: string, customerId: string): Promise<ServiceRequest> {
    const req = await this.findById(requestId);
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    if (!relatedIds.includes(req.customerId)) throw new ForbiddenException();
    if (req.status === ServiceRequestStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed inspection');
    }
    if (req.status === ServiceRequestStatus.CANCELLED) {
      throw new BadRequestException('Request is already cancelled');
    }
    req.status = ServiceRequestStatus.CANCELLED;
    const saved = await this.requestsRepo.save(req);
    if (req.vendorId) {
      await this.notificationsService.notifyUser(
        req.vendorId,
        NotificationType.JOB_COMPLETED,
        'Inspection Cancelled',
        'The customer has cancelled this inspection request.',
        { serviceRequestId: saved.id },
      );
    }
    return saved;
  }

  async getSolarQuote(requestId: string): Promise<SolarQuote | null> {
    return this.solarQuoteRepo.findOne({ where: { serviceRequestId: requestId } });
  }

  async submitSolarQuote(requestId: string, vendorId: string, dto: {
    systemSizeKw: number;
    numInverters: number;
    inverterManufacturer: string;
    inverterModel: string;
    pvSystemPrice: number;
    storageSizeKwh?: number;
    storageManufacturer?: string;
    storageModel?: string;
    storagePrice?: number;
  }): Promise<SolarQuote> {
    const req = await this.findById(requestId);
    if (req.vendorId !== vendorId) throw new ForbiddenException();

    const existing = await this.solarQuoteRepo.findOne({ where: { serviceRequestId: requestId } });
    if (existing) {
      Object.assign(existing, dto);
      return this.solarQuoteRepo.save(existing);
    }
    const quote = this.solarQuoteRepo.create({ serviceRequestId: requestId, vendorId, ...dto });
    const saved = await this.solarQuoteRepo.save(quote);
    // Notify customer
    await this.notificationsService.notifyUser(
      req.customerId,
      NotificationType.SERVICE_UPDATE,
      'Solar Quote Ready',
      'Your contractor has submitted a solar quote. Open the app to review it.',
      { screen: 'my-services', requestId },
    );
    return saved;
  }

  async findById(id: string): Promise<ServiceRequest> {
    const req = await this.requestsRepo.findOne({
      where: { id },
      relations: ['additionalServices', 'vendor', 'vendor.vendorProfile', 'customer'],
    });
    if (!req) throw new NotFoundException('Service request not found');
    return req;
  }

  async findByIdWithPhotos(id: string): Promise<any> {
    const req = await this.findById(id);
    const completionPhotoUrls = await Promise.all(
      (req.completionPhotoKeys || []).map((key) =>
        this.uploadsService.getSignedUrl(key).catch(() => null),
      ),
    );
    return { ...req, completionPhotoUrls: completionPhotoUrls.filter(Boolean) };
  }

  async findByIdForUser(id: string, userId: string): Promise<ServiceRequest> {
    const req = await this.findById(id);
    if (req.vendorId === userId) return req;
    if (req.status === ServiceRequestStatus.PENDING) return req;

    // Allow family members and parent to view each other's requests
    const relatedIds = await this.usersService.getRelatedCustomerIds(userId);
    if (relatedIds.includes(req.customerId)) return req;

    throw new ForbiddenException();
  }

  async reschedule(
    requestId: string,
    userId: string,
    newDate: string,
  ): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.customerId !== userId && request.vendorId !== userId) throw new ForbiddenException();

    request.scheduledDate = new Date(newDate);
    const saved = await this.requestsRepo.save(request);

    const otherPartyId = request.customerId === userId ? request.vendorId : request.customerId;
    if (otherPartyId) {
      await this.notificationsService.notifyUser(
        otherPartyId,
        NotificationType.SCHEDULE_CHANGED,
        'Schedule Updated',
        `The inspection has been rescheduled to ${new Date(newDate).toLocaleDateString()}.`,
        { serviceRequestId: saved.id },
      );
    }

    return saved;
  }

  async getSolarConsultation(requestId: string): Promise<SolarConsultation | null> {
    return this.solarConsultationRepo.findOne({ where: { serviceRequestId: requestId } });
  }

  async requestConsultation(requestId: string, customerId: string, preferredDate: Date): Promise<SolarConsultation> {
    const req = await this.findById(requestId);
    if (req.customerId !== customerId) throw new ForbiddenException();
    const quote = await this.solarQuoteRepo.findOne({ where: { serviceRequestId: requestId } });
    if (!quote) throw new BadRequestException('No solar quote exists for this request');

    const existing = await this.solarConsultationRepo.findOne({ where: { serviceRequestId: requestId } });
    if (existing) {
      if (existing.status === 'DECLINED') {
        existing.status = 'REQUESTED';
        existing.customerProposedDate = preferredDate;
        existing.vendorProposedDate = null;
        existing.confirmedDate = null;
        return this.solarConsultationRepo.save(existing);
      }
      return existing;
    }

    const consultation = this.solarConsultationRepo.create({
      serviceRequestId: requestId,
      solarQuoteId: quote.id,
      vendorId: req.vendorId,
      customerId,
      status: 'REQUESTED',
      customerProposedDate: preferredDate,
    });
    const saved = await this.solarConsultationRepo.save(consultation);

    await this.notificationsService.notifyUser(
      req.vendorId,
      NotificationType.SERVICE_UPDATE,
      'Consultation Requested',
      'A customer wants a site visit for their solar quote. Review and confirm the date.',
      { screen: 'my-jobs', requestId },
    );
    return saved;
  }

  async updateConsultation(
    requestId: string,
    userId: string,
    dto: { action: 'ACCEPT' | 'COUNTER' | 'DECLINE' | 'COMPLETE'; proposedDate?: Date },
  ): Promise<SolarConsultation> {
    const consultation = await this.solarConsultationRepo.findOne({ where: { serviceRequestId: requestId } });
    if (!consultation) throw new NotFoundException('No consultation found');

    if (dto.action === 'ACCEPT') {
      if (userId === consultation.vendorId && consultation.status === 'REQUESTED') {
        consultation.confirmedDate = consultation.customerProposedDate;
        consultation.status = 'CONFIRMED';
        await this.notificationsService.notifyUser(
          consultation.customerId,
          NotificationType.SERVICE_UPDATE,
          'Site Visit Confirmed',
          'Your contractor has confirmed the solar site visit. Check the app for the date.',
          { screen: 'my-services', requestId },
        );
      } else if (userId === consultation.customerId && consultation.status === 'VENDOR_COUNTER') {
        consultation.confirmedDate = consultation.vendorProposedDate;
        consultation.status = 'CONFIRMED';
        await this.notificationsService.notifyUser(
          consultation.vendorId,
          NotificationType.SERVICE_UPDATE,
          'Site Visit Date Accepted',
          'The customer accepted your proposed date for the solar site visit.',
          { screen: 'my-jobs', requestId },
        );
      }
    } else if (dto.action === 'COUNTER' && userId === consultation.vendorId) {
      consultation.vendorProposedDate = dto.proposedDate!;
      consultation.status = 'VENDOR_COUNTER';
      await this.notificationsService.notifyUser(
        consultation.customerId,
        NotificationType.SERVICE_UPDATE,
        'New Site Visit Date Proposed',
        'Your contractor proposed a new date for the solar site visit.',
        { screen: 'my-services', requestId },
      );
    } else if (dto.action === 'DECLINE' && userId === consultation.customerId) {
      consultation.status = 'DECLINED';
      const req = await this.findById(requestId);
      req.status = ServiceRequestStatus.CANCELLED;
      await this.requestsRepo.save(req);
    } else if (dto.action === 'COMPLETE' && userId === consultation.vendorId) {
      consultation.status = 'COMPLETED';
    }

    return this.solarConsultationRepo.save(consultation);
  }
}
