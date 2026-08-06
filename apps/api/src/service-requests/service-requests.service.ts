import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, forwardRef, Inject, Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, FindOptionsWhere, MoreThan, MoreThanOrEqual, LessThan, IsNull, DataSource } from 'typeorm';
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
import { haversineMiles } from '../common/utils/geo.utils';

// How close (in meters) the vendor's GPS needs to be to the job's geocoded
// address before "I Have Arrived" is confirmable/auto-triggers — roughly
// 1-2 house-lots of buffer against typical phone GPS error.
const ARRIVAL_RADIUS_METERS = 150;

// Safety net for a request stuck in VENDOR_EN_ROUTE with no further update —
// app crash, dead phone, vendor never revisiting the screen. Neither the
// vendor-release action nor a reschedule helps if the vendor never opens the
// app again; this is the backstop that surfaces it for manual follow-up.
const STUCK_EN_ROUTE_THRESHOLD_HOURS = 2.5;

// Matches the minimum cancellation fee already disclosed in the T&Cs
// (apps/api/legal/customer-terms.md) for cancelling less than 24 hours
// before the appointment — VENDOR_EN_ROUTE is always within that window.
const LATE_CANCELLATION_FEE_USD = 25;

// Same default markup used everywhere else pricing is computed in this
// codebase (pricing.utils.ts's formatCustomerPriceDisplay, this file's own
// booking-price recalcs) — materials use a flat rate rather than inheriting
// any specific catalog item's configurable markupPercent, since a logged
// material isn't tied to one.
const MATERIAL_MARKUP_PERCENT = 15;

@Injectable()
export class ServiceRequestsService {
  private readonly logger = new Logger(ServiceRequestsService.name);

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

  // Shared quota pool for both booking flows: the built-in Inspection tab
  // (SCHEDULED_INSPECTION requests) and any catalog item flagged
  // isQuotaInspection booked through the Additional Services flow
  // (ADDITIONAL_SERVICE requests with an isQuotaCovered line item) draw down
  // the same subscription.plan.inspectionsPerYear allowance, so a customer
  // can't get e.g. 2 free via the tab and 2 more free via the catalog.
  // Counts pending (not yet completed/cancelled) requests from both flows in
  // addition to the already-completed inspectionsUsed count, so a burst of
  // simultaneous bookings can't overshoot the limit before any of them complete.
  private async getInspectionsRemaining(subscription: {
    id: string;
    inspectionsUsed: number;
    plan: { inspectionsPerYear: number };
  }): Promise<{ used: number; pending: number; perYear: number; remaining: number }> {
    const pendingInspections = await this.requestsRepo.count({
      where: {
        subscriptionId: subscription.id,
        type: ServiceType.SCHEDULED_INSPECTION,
        status: Not(In([ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED])),
      },
    });

    const pendingAdditionalServiceRequests = await this.requestsRepo.find({
      where: {
        subscriptionId: subscription.id,
        type: ServiceType.ADDITIONAL_SERVICE,
        status: Not(In([ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED])),
      },
      select: ['id'],
    });
    const pendingQuotaAddons = pendingAdditionalServiceRequests.length
      ? await this.additionalRepo.count({
          where: { serviceRequestId: In(pendingAdditionalServiceRequests.map((r) => r.id)), isQuotaCovered: true },
        })
      : 0;

    const pending = pendingInspections + pendingQuotaAddons;
    const perYear = subscription.plan.inspectionsPerYear;
    const remaining = Math.max(0, perYear - subscription.inspectionsUsed - pending);

    return { used: subscription.inspectionsUsed, pending, perYear, remaining };
  }

  // Public counterpart of the private calc above, for the client to display
  // an accurate "X of Y used" instead of the naive inspectionsUsed-only
  // count the subscription object itself exposes — that count never
  // reflects pending (not yet completed) bookings from either flow, so the
  // client previously had no way to know a booking or cancellation had
  // changed the customer's real remaining allowance.
  async getInspectionsQuota(customerId: string): Promise<{ used: number; pending: number; perYear: number; remaining: number } | null> {
    const subscriptionOwnerId = await this.usersService.getEffectiveSubscriptionOwnerId(customerId);
    const subscription = await this.subscriptionsService.getActiveSubscription(subscriptionOwnerId);
    if (!subscription) return null;
    return this.getInspectionsRemaining(subscription);
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

    const limitReached = (await this.getInspectionsRemaining(subscription)).remaining <= 0;
    if (limitReached && !dto.isPaidAddon) {
      throw new BadRequestException('No inspections remaining on your subscription');
    }

    const addonPrice = limitReached && dto.isPaidAddon
      ? Number(subscription.plan.addonInspectionPrice)
      : null;

    // Server-authoritative coordinates (never client-supplied) for GPS
    // arrival-proximity checks — see CustomerProfile.latitude/longitude.
    const profile = await this.usersService.getCustomerProfile(customerId);

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
      latitude: profile?.latitude ?? null,
      longitude: profile?.longitude ?? null,
      isPaidAddon: !!addonPrice,
      addonPrice,
      checklistGroupKey: 'GENERAL_HOME_INSPECTION',
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

    // The one catalog item flagged isQuotaInspection (expected: "General
    // Inspection") is free while the plan's shared inspection allowance
    // remains — see getInspectionsRemaining — and charges its normal
    // tiered/markup price once that allowance is used up.
    const isQuotaCovered = servicePrice.isQuotaInspection && (await this.getInspectionsRemaining(subscription)).remaining > 0;
    const markup = servicePrice.markupPercent != null ? Number(servicePrice.markupPercent) : 15;
    const cost = calcTieredCost(servicePrice, billedQty);
    const customerPrice = isQuotaCovered ? 0 : Math.round(cost * (1 + markup / 100) * 100) / 100;
    const profile = await this.usersService.getCustomerProfile(customerId);

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
      latitude: profile?.latitude ?? null,
      longitude: profile?.longitude ?? null,
      isPaidAddon: false,
      addonPrice: customerPrice,
      servicePriceId: servicePrice.id,
      bookingGroupId: dto.bookingGroupId ?? null,
      checklistGroupKey: servicePrice.checklistGroupKey ?? null,
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
      isQuotaCovered,
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

  // Shared by both Marketplace booking paths: a recurring visit generated by
  // MarketplaceVisitSchedulerService (marketplaceSubscriptionId set — the
  // completion-charge loop below skips it, since it's already covered by the
  // subscription's monthly Stripe charge) and a one-time Move-Out cleaning
  // (marketplaceSubscriptionId omitted — charged normally at completion,
  // same as any other approved additional service). `price` is always the
  // caller's own pre-computed amount (from marketplace-pricing.utils.ts),
  // never derived from servicePriceId's own (unused, placeholder) price
  // fields the way createStandaloneService derives its price.
  async createMarketplaceBooking(customerId: string, dto: {
    servicePriceId: string;
    preferredDate: string;
    price: number;
    marketplaceSubscriptionId?: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    // false only for a subscription-free Move-Out cleaning — someone moving
    // out has no ongoing home relationship for a core Attenteve plan to
    // maintain. Every other Marketplace booking (recurring visits,
    // Standard/Deep one-time) keeps the default requirement.
    requireCoreSubscription?: boolean;
    // Lawncare on-demand bookings share one generic "Lawncare Subscription"
    // catalog row across all 18 individual services (for capability
    // matching), so the AdditionalService line item needs the specific
    // service's own name/description instead of the catalog row's generic
    // ones — e.g. "Lawn Mowing", not "Lawncare Subscription".
    nameOverride?: string;
    descriptionOverride?: string;
  }): Promise<ServiceRequest> {
    const requireCoreSubscription = dto.requireCoreSubscription ?? true;
    let subscriptionId: string | null = null;
    if (requireCoreSubscription) {
      const subscriptionOwnerId = await this.usersService.getEffectiveSubscriptionOwnerId(customerId);
      const subscription = await this.subscriptionsService.getActiveSubscription(subscriptionOwnerId);
      if (!subscription) throw new BadRequestException('No active subscription found');
      subscriptionId = subscription.id;
    }

    const prices = await this.pricingService.getAll();
    const servicePrice = prices.find((p) => p.id === dto.servicePriceId);
    if (!servicePrice) throw new BadRequestException('Service not found');
    const profile = await this.usersService.getCustomerProfile(customerId);

    const saved = await this.saveNewRequest((ticketNumber) => ({
      customerId,
      subscriptionId,
      type: ServiceType.ADDITIONAL_SERVICE,
      status: ServiceRequestStatus.PENDING,
      ticketNumber,
      preferredDate: new Date(dto.preferredDate),
      address: dto.address,
      city: dto.city,
      state: dto.state,
      zipCode: dto.zipCode,
      latitude: profile?.latitude ?? null,
      longitude: profile?.longitude ?? null,
      isPaidAddon: false,
      addonPrice: dto.price,
      servicePriceId: servicePrice.id,
      marketplaceSubscriptionId: dto.marketplaceSubscriptionId ?? null,
    }));

    const displayName = dto.nameOverride ?? servicePrice.name;
    await this.additionalRepo.save(this.additionalRepo.create({
      serviceRequestId: saved.id,
      name: displayName,
      description: dto.descriptionOverride ?? servicePrice.description,
      price: dto.price,
      servicePriceId: servicePrice.id,
      approved: true,
      approvedAt: new Date(),
      isQuotaCovered: false,
    }));

    const vendors = await this.usersService.findAvailableVendors();
    if (vendors.length > 0) {
      await this.notificationsService.notifyVendors(
        vendors,
        NotificationType.NEW_REQUEST,
        'New Service Request',
        `A customer needs: ${displayName} in ${dto.city}, ${dto.state}.`,
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
    if (proposed.getTime() <= Date.now()) {
      throw new BadRequestException('That date and time has already passed — please choose a future date and time.');
    }
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
    if (proposed.getTime() <= Date.now()) {
      throw new BadRequestException('That date and time has already passed — please choose a future date and time.');
    }
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

      const { approvedServices, priceIncreased } = await this.prepCompletion(request, completionPhotoKeys, finalQuantities);

      for (const svc of approvedServices) {
        if (svc.isQuotaCovered) continue; // covered by the plan — nothing to charge
        if (request.marketplaceSubscriptionId) continue; // covered by the Marketplace subscription's monthly charge — nothing to charge per-visit
        try {
          // Charges the customer immediately (off-session where possible,
          // falling back to a "Pay Now" card only if that fails) rather than
          // waiting on the customer to open the app — see
          // PaymentsService.chargeForCompletedService.
          await this.paymentsService.chargeForCompletedService(
            requestId,
            request.customerId,
            vendorId,
            Number(svc.price),
            svc.name,
            PaymentType.ADDITIONAL_SERVICE,
          );
        } catch (err) {
          // Don't block job completion if payment fails
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

    return this.finalizeStatusTransition(request, status);
  }

  // Shared prep for closing out a request: photo/checklist validation,
  // inspection-quota increments, and any vendor-entered final-quantity price
  // bumps — everything EXCEPT the actual charge, since updateStatus (one
  // charge per line item) and completeBundle (one combined charge across
  // several requests) each need to charge differently. Mutates `request` in
  // place (completionPhotoKeys/completedAt/addonPrice) but does not save it —
  // the caller's own save (via finalizeStatusTransition) covers that.
  private async prepCompletion(
    request: ServiceRequest,
    completionPhotoKeys: string[],
    finalQuantities?: Record<string, number>,
  ): Promise<{ approvedServices: AdditionalService[]; priceIncreased: boolean }> {
    const requestId = request.id;

    // Fetched up-front (rather than only for the auth-hold loop below, as
    // before) so a quota-covered line item's completion here can also
    // increment inspectionsUsed, same as a Flow A inspection does.
    const approvedServices = await this.additionalRepo.find({
      where: { serviceRequestId: requestId, approved: true },
    });
    const quotaCoveredCount = approvedServices.filter((s) => s.isQuotaCovered).length;

    // Checklist completion is gated by whether this job resolves to ANY
    // checklist group (General Home Inspection, HVAC Full Inspection,
    // Comprehensive Inspection, ...) — not by request.type, so standalone
    // add-on inspections (e.g. HVAC) are held to the same standard as the
    // base subscription inspection, not just SCHEDULED_INSPECTION requests.
    if (request.checklistGroupKey) {
      const checklistDone = await this.inspectionsService.isChecklistComplete(requestId);
      if (!checklistDone) {
        throw new BadRequestException('All inspection checklist items must be completed before closing the job');
      }
    }

    if (request.type !== ServiceType.ADDITIONAL_SERVICE) {
      await this.subscriptionsService.incrementInspectionsUsed(request.subscriptionId, request.isPaidAddon);
    } else if (quotaCoveredCount > 0) {
      for (let i = 0; i < quotaCoveredCount; i++) {
        // Best-effort — a narrow race (concurrent quota-covered bookings
        // each cleared at their own booking-time check) shouldn't block
        // this job from closing out, matching the auth-hold loop below.
        await this.subscriptionsService.incrementInspectionsUsed(request.subscriptionId, false).catch((err) =>
          this.logger.warn(`Failed to increment inspectionsUsed for quota-covered request ${requestId}: ${err.message}`),
        );
      }
    }
    request.completionPhotoKeys = completionPhotoKeys;
    request.completedAt = new Date();

    // Apply any vendor-entered final quantities BEFORE the hold-creation
    // loop below reads svc.price — Stripe manual-capture holds can't be
    // increased once created, so this only works cleanly because no hold
    // exists yet at this point. Never decreases price: the customer was
    // already floored at the service's minimum quantity at booking time.
    let priceIncreased = false;
    if (finalQuantities) {
      const prices = await this.pricingService.getAll(true);
      for (const svc of approvedServices) {
        if (svc.isQuotaCovered) continue; // stays free regardless of final quantity
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

    return { approvedServices, priceIncreased };
  }

  // Status assignment + save + customer notification — shared tail for
  // VENDOR_EN_ROUTE/IN_PROGRESS/COMPLETED across both the single-request
  // (updateStatus) and bundle (updateBundleStatus/completeBundle) paths.
  private async finalizeStatusTransition(request: ServiceRequest, status: ServiceRequestStatus): Promise<ServiceRequest> {
    request.status = status;
    if (status === ServiceRequestStatus.VENDOR_EN_ROUTE) {
      request.vendorEnRouteAt = new Date();
      request.stuckJobAlertSentAt = null;
    }
    // Freeze the checklist config the job actually started with — guarded so a
    // job cycling IN_PROGRESS -> ACCEPTED -> IN_PROGRESS again (reschedule()) keeps
    // its original snapshot rather than picking up whatever an admin has since
    // edited in the Configurator. New jobs (no snapshot yet) always read live.
    if (status === ServiceRequestStatus.IN_PROGRESS && !request.checklistSnapshot && request.checklistGroupKey) {
      request.checklistSnapshot = await this.inspectionsService.buildChecklistSnapshot(request.checklistGroupKey);
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

  // Vendor-initiated bundling: unlike acceptGroup (keyed on a bookingGroupId
  // the CUSTOMER already set at submission time), this lets the vendor pick
  // an arbitrary set of still-PENDING, currently-eligible requests from ONE
  // customer and claim them together as one visit — they need not have
  // shared any bookingGroupId before this call, and any stale individual
  // value is overwritten with a fresh one shared by every accepted member.
  async acceptAsBundle(
    requestIds: string[], vendorId: string, scheduledDate: string, notes?: string,
  ): Promise<ServiceRequest[]> {
    if (requestIds.length < 2) {
      throw new BadRequestException('Select at least 2 requests to bundle');
    }

    const eligible = await this.getEligiblePendingRequests(vendorId);
    const candidates = eligible.filter((r) => requestIds.includes(r.id));
    if (candidates.length === 0) {
      throw new BadRequestException('None of these requests are available');
    }
    if (new Set(candidates.map((r) => r.customerId)).size > 1) {
      throw new BadRequestException('All selected requests must belong to the same homeowner');
    }

    const proposed = new Date(scheduledDate);
    if (proposed.getTime() <= Date.now()) {
      throw new BadRequestException('That date and time has already passed — please choose a future date and time.');
    }
    const freshBookingGroupId = `bg-vendor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const accepted: ServiceRequest[] = [];

    await this.dataSource.transaction(async (manager) => {
      for (const r of candidates) {
        const fresh = await manager.findOne(ServiceRequest, { where: { id: r.id } });
        if (!fresh || fresh.status !== ServiceRequestStatus.PENDING) continue; // race guard, same as acceptGroup

        const preferred = new Date(fresh.preferredDate);
        const diffMs = Math.abs(proposed.getTime() - preferred.getTime());
        const sametime = diffMs < 5 * 60 * 1000;

        fresh.vendorId = vendorId;
        fresh.scheduledDate = proposed;
        fresh.bookingGroupId = freshBookingGroupId; // overwrite any stale/absent value — this vendor's bundle wins
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

  // Applies the same VENDOR_EN_ROUTE/IN_PROGRESS transition to every request
  // sharing this bookingGroupId that this vendor owns and that's still in a
  // valid prior state — mirrors the single-id ownership guard in
  // updateStatus, but batched. Silently skips any member not in the expected
  // prior state (e.g. already released/cancelled) rather than failing the
  // whole visit — consistent with acceptAsBundle/acceptGroup's best-effort
  // style. Completion has its own dedicated path (completeBundle) since it
  // needs batched charging, not just a batched status write.
  async updateBundleStatus(
    bookingGroupId: string, vendorId: string, status: ServiceRequestStatus,
  ): Promise<ServiceRequest[]> {
    const members = await this.requestsRepo.find({ where: { bookingGroupId, vendorId } });
    if (members.length === 0) {
      throw new NotFoundException('No bundle found for this vendor');
    }

    const requiredPrior = status === ServiceRequestStatus.VENDOR_EN_ROUTE
      ? ServiceRequestStatus.ACCEPTED
      : ServiceRequestStatus.VENDOR_EN_ROUTE;

    const updated: ServiceRequest[] = [];
    for (const member of members) {
      if (member.status !== requiredPrior) continue;
      updated.push(await this.finalizeStatusTransition(member, status));
    }
    if (updated.length === 0) {
      throw new BadRequestException('No members of this bundle are in a state that can advance');
    }
    return updated;
  }

  // "Close All" — closes whichever bundle-member requests the vendor has
  // already prepped (checklist done + photo attached), one PaymentIntent for
  // the combined total instead of one per request. Partial: a member the
  // vendor hasn't prepped yet is simply skipped (not failed) — it stays
  // IN_PROGRESS and can be closed later individually via updateStatus, or in
  // a later completeBundle call.
  async completeBundle(
    vendorId: string,
    items: { serviceRequestId: string; completionPhotoKeys: string[]; finalQuantities?: Record<string, number> }[],
  ): Promise<ServiceRequest[]> {
    const chargeLines: { serviceRequestId: string; customerId: string; svcId: string; name: string; price: number }[] = [];
    const completed: ServiceRequest[] = [];

    for (const item of items) {
      const request = await this.findById(item.serviceRequestId);
      if (request.vendorId !== vendorId) throw new ForbiddenException();
      if (request.status !== ServiceRequestStatus.IN_PROGRESS) continue; // best-effort, same as bundle-status skip
      if (!item.completionPhotoKeys?.length) continue;

      const { approvedServices } = await this.prepCompletion(request, item.completionPhotoKeys, item.finalQuantities);
      completed.push(await this.finalizeStatusTransition(request, ServiceRequestStatus.COMPLETED));

      for (const svc of approvedServices) {
        if (svc.isQuotaCovered) continue;
        if (request.marketplaceSubscriptionId) continue;
        chargeLines.push({
          serviceRequestId: request.id, customerId: request.customerId, svcId: svc.id, name: svc.name, price: Number(svc.price),
        });
      }
    }

    if (completed.length === 0) {
      throw new BadRequestException('None of these services could be completed');
    }

    if (chargeLines.length > 0) {
      try {
        await this.paymentsService.chargeForCompletedBundle(chargeLines, vendorId);
      } catch (err) {
        // Don't block job completion if payment fails — same policy as updateStatus's own charge loop
      }
    }

    return completed;
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

  // Vendor logs a material cost incurred doing the current repair — auto-
  // included in the customer's total immediately (no approval step, unlike
  // recommendAdditionalService above) since it's a necessary cost of a
  // repair the customer already asked for, not a discretionary upsell.
  // Server-computes the marked-up customer price from cost so the vendor
  // never directly sets what the customer is charged (recommendAdditionalService
  // trusts a client-sent price verbatim — deliberately not repeated here).
  // Only allowed while IN_PROGRESS: nothing re-triggers a charge for a row
  // added after completion (same reason materials skip approval — see plan),
  // so this closes that gap by construction rather than leaving a way to
  // create a row that can never actually get billed.
  async addMaterialCost(requestId: string, vendorId: string, dto: { description: string; cost: number }): Promise<AdditionalService> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();
    if (request.status !== ServiceRequestStatus.IN_PROGRESS) {
      throw new BadRequestException('Materials can only be added while the job is in progress');
    }

    const price = Math.round(dto.cost * (1 + MATERIAL_MARKUP_PERCENT / 100) * 100) / 100;
    const service = this.additionalRepo.create({
      serviceRequestId: requestId,
      name: 'Materials',
      description: dto.description,
      price,
      materialCost: dto.cost,
      isMaterial: true,
      approved: true,
      approvedAt: new Date(),
    });
    const saved = await this.additionalRepo.save(service);

    await this.notificationsService.notifyUser(
      request.customerId,
      NotificationType.SERVICE_UPDATE,
      'Materials Added',
      `Your vendor added materials ($${price.toFixed(2)}) for this job.`,
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
      relations: ['additionalServices', 'customer', 'customer.customerProfile'],
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
    heading?: number | null,
  ): Promise<{ ok: boolean }> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();
    // Reject once the job is no longer actively en route (cancelled,
    // released, rescheduled, completed, ...) — one guard covering every
    // transition, rather than each one needing to separately know to stop
    // the vendor's still-running client-side location interval. The mobile
    // client stops its own polling the moment it sees this rejection.
    if (request.status !== ServiceRequestStatus.VENDOR_EN_ROUTE) {
      throw new BadRequestException('This job is no longer en route — location updates are no longer accepted.');
    }
    request.vendorLatitude = latitude;
    request.vendorLongitude = longitude;
    request.vendorHeading = heading ?? null;
    request.vendorLocationAt = new Date();

    // Auto-detect arrival: if this job has real geocoded coordinates (see
    // ServiceRequest.latitude/longitude) and the vendor's new position is
    // within range, advance straight to IN_PROGRESS — reuses the same path
    // (and existing "Vendor Has Arrived" notification) as a manual "I Have
    // Arrived" tap. Requests without geocoded coordinates (legacy, or
    // geocoding failed) skip this entirely and stay manual-only. No
    // "already notified" flag needed: the VENDOR_EN_ROUTE guard above
    // already rejects further location updates once status advances, so
    // this can only fire once per job.
    if (request.latitude != null && request.longitude != null) {
      const distanceMeters = haversineMiles(latitude, longitude, Number(request.latitude), Number(request.longitude)) * 1609.34;
      if (distanceMeters <= ARRIVAL_RADIUS_METERS) {
        // finalizeStatusTransition saves the entity itself (status +
        // whatever's already mutated on it, including the vendor location
        // fields just set above) — no separate save needed here.
        await this.finalizeStatusTransition(request, ServiceRequestStatus.IN_PROGRESS);
        return { ok: true };
      }
    }

    await this.requestsRepo.save(request);
    return { ok: true };
  }

  // A vendor backing out after accepting (breakdown, emergency, running very
  // late) previously had no real path — the only available action was
  // Reschedule, which only changes scheduledDate and leaves status/vendorId/
  // location fields untouched, producing a self-contradictory "still en
  // route, now for a different date" state. This actually releases the job.
  async vendorReleaseJob(requestId: string, vendorId: string): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();
    if (![ServiceRequestStatus.ACCEPTED, ServiceRequestStatus.VENDOR_EN_ROUTE, ServiceRequestStatus.IN_PROGRESS].includes(request.status)) {
      throw new BadRequestException('This job cannot be released in its current status');
    }

    request.status = ServiceRequestStatus.PENDING;
    request.vendorId = null;
    request.vendorLatitude = null;
    request.vendorLongitude = null;
    request.vendorHeading = null;
    request.vendorLocationAt = null;
    request.vendorEnRouteAt = null;
    const saved = await this.requestsRepo.save(request);

    await this.notificationsService.notifyUser(
      request.customerId,
      NotificationType.VENDOR_RELEASED_JOB,
      'Vendor Update',
      "Your vendor is no longer able to make this visit — we're finding a new one for you.",
      { serviceRequestId: saved.id },
    ).catch(() => {});

    return saved;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkStuckEnRouteRequests(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_EN_ROUTE_THRESHOLD_HOURS * 60 * 60 * 1000);
    const stuck = await this.requestsRepo.find({
      where: {
        status: ServiceRequestStatus.VENDOR_EN_ROUTE,
        vendorEnRouteAt: LessThan(cutoff),
        stuckJobAlertSentAt: IsNull(),
      },
    });

    for (const request of stuck) {
      request.stuckJobAlertSentAt = new Date();
      await this.requestsRepo.save(request);
      await this.notificationsService.notifyAdmins(
        NotificationType.STUCK_JOB_ALERT,
        'Job Stuck En Route',
        `Ticket ${request.ticketNumber ?? request.id} has been "vendor en route" for over ${STUCK_EN_ROUTE_THRESHOLD_HOURS} hours with no update — may need manual follow-up.`,
        { serviceRequestId: request.id },
      ).catch((err) => this.logger.warn(`Failed to notify admins about stuck request ${request.id}: ${err.message}`));
    }

    if (stuck.length > 0) {
      this.logger.warn(`Flagged ${stuck.length} request(s) stuck in VENDOR_EN_ROUTE past ${STUCK_EN_ROUTE_THRESHOLD_HOURS}h`);
    }
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

    // A cancellation while the vendor is already en route is always within
    // the <24h window the $25 late-cancellation fee applies to — that policy
    // has been disclosed in the T&Cs since launch but was never actually
    // charged anywhere until now.
    const wasEnRoute = req.status === ServiceRequestStatus.VENDOR_EN_ROUTE;

    req.status = ServiceRequestStatus.CANCELLED;
    if (wasEnRoute) {
      // Stop showing/tracking a live location for a job that's no longer
      // happening — matches the same cleanup vendorReleaseJob/reschedule
      // already do. The vendor's still-running location-report interval
      // (if any) gets rejected and stops itself on its next tick via
      // updateVendorLocation's own status check, independent of this.
      req.vendorLatitude = null;
      req.vendorLongitude = null;
      req.vendorHeading = null;
      req.vendorLocationAt = null;
      req.vendorEnRouteAt = null;
    }
    const saved = await this.requestsRepo.save(req);

    if (wasEnRoute) {
      try {
        const result = await this.paymentsService.chargeCustomerCancellationFee(
          req.customerId,
          LATE_CANCELLATION_FEE_USD,
          `Late cancellation fee — ${req.ticketNumber ?? req.id}`,
        );
        if (result.status !== 'succeeded') {
          await this.notifyCancellationFeeFailure(req, result.failureReason);
        }
      } catch (err: any) {
        // Charge helper throws (rather than returning 'failed') specifically
        // when there's no payment method on file at all — still don't block
        // the cancellation itself for that, just surface it.
        await this.notifyCancellationFeeFailure(req, err.message);
      }
    }

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

  private async notifyCancellationFeeFailure(request: ServiceRequest, reason?: string): Promise<void> {
    this.logger.warn(`Cancellation fee charge failed for request ${request.id}: ${reason}`);
    await this.notificationsService.notifyAdmins(
      NotificationType.CANCELLATION_FEE_FAILED,
      'Cancellation Fee Not Collected',
      `The $${LATE_CANCELLATION_FEE_USD} late-cancellation fee for ticket ${request.ticketNumber ?? request.id} could not be charged (${reason ?? 'unknown error'}) — may need manual follow-up.`,
      { serviceRequestId: request.id },
    ).catch(() => {});
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
    // Getters on the TypeORM entity don't survive JSON serialization — attach
    // explicitly, same as the plain findOne() endpoint. This is the endpoint
    // the customer app's request-detail screen actually calls, so etaMinutes
    // silently vanishing here (while present on the other endpoint) is what
    // caused the vendor-en-route ETA to never show up.
    return {
      ...req,
      completionPhotoUrls: completionPhotoUrls.filter(Boolean),
      isMonitoringSetupJob: req.isMonitoringSetupJob,
      etaMinutes: req.etaMinutes,
    };
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

    const proposed = new Date(newDate);
    if (proposed.getTime() <= Date.now()) {
      throw new BadRequestException('That date and time has already passed — please choose a future date and time.');
    }

    // A re-timed visit shouldn't still claim to be "en route" or "in
    // progress" — without this, rescheduling mid-trip left the request
    // showing a live ETA banner pointed at a stale GPS ping for a visit
    // that's now scheduled for an entirely different time.
    if ([ServiceRequestStatus.VENDOR_EN_ROUTE, ServiceRequestStatus.IN_PROGRESS].includes(request.status)) {
      request.status = ServiceRequestStatus.ACCEPTED;
      request.vendorLatitude = null;
      request.vendorLongitude = null;
      request.vendorHeading = null;
      request.vendorLocationAt = null;
      request.vendorEnRouteAt = null;
    }

    request.scheduledDate = proposed;
    const saved = await this.requestsRepo.save(request);

    const otherPartyId = request.customerId === userId ? request.vendorId : request.customerId;
    if (otherPartyId) {
      await this.notificationsService.notifyUser(
        otherPartyId,
        NotificationType.SCHEDULE_CHANGED,
        'Schedule Updated',
        `The inspection has been rescheduled to ${proposed.toLocaleDateString()}.`,
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
