import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { MarketplaceCleaningPlan } from './entities/marketplace-cleaning-plan.entity';
import { MarketplaceRoomUnit } from './entities/marketplace-room-unit.entity';
import { MarketplaceConditionMultiplier } from './entities/marketplace-condition-multiplier.entity';
import { MarketplaceAddOn } from './entities/marketplace-add-on.entity';
import { MarketplaceFrequencyDiscount } from './entities/marketplace-frequency-discount.entity';
import { MarketplaceSubscription } from './entities/marketplace-subscription.entity';
import { MarketplaceSubscriptionEvent } from './entities/marketplace-subscription-event.entity';
import {
  CleaningType, VisitFrequency, MarketplaceSubscriptionStatus, MarketplaceEventType,
} from './enums/marketplace.enum';
import {
  computeBCU, computeConditionMultiplier, computeAddOnsTotal, computePerVisitCost,
  computeMonthlySubscriptionPrice, QUOTE_REQUIRED,
} from './marketplace-pricing.utils';
import { QuoteHouseCleaningDto } from './dto/quote-house-cleaning.dto';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { ServicePrice } from '../pricing/entities/service-price.entity';
import { ServiceCategory } from '../common/enums/service-category.enum';
import { ServiceGroup } from '../common/enums/service-group.enum';
import { PricingMethod } from '../common/enums/pricing-method.enum';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { ServiceRequestsService } from '../service-requests/service-requests.service';

export const CLEANING_SERVICES_CAPABILITY_NAME = 'Cleaning Services';
export const HOUSE_CLEANING_CATALOG_NAME = 'House Cleaning';

export interface HouseCleaningQuote {
  perVisitCost: number;
  monthlyPrice: number | null;
  quoteRequired: boolean;
}

// The next occurrence of the 1st of the month, as a Unix timestamp — always
// strictly in the future regardless of what day "now" is. Used as every
// subscription's Stripe billing_cycle_anchor so all Marketplace subscribers
// land on the same monthly billing date, with proration_behavior handling
// the partial first period automatically.
function nextMonthlyBillingAnchor(): number {
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
  return Math.floor(anchor.getTime() / 1000);
}

function advanceVisitDate(from: Date, frequency: VisitFrequency): Date {
  const next = new Date(from);
  if (frequency === VisitFrequency.WEEKLY) next.setDate(next.getDate() + 7);
  else if (frequency === VisitFrequency.BIWEEKLY) next.setDate(next.getDate() + 14);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

@Injectable()
export class MarketplaceService implements OnModuleInit {
  private stripe: Stripe;
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @InjectRepository(MarketplaceCleaningPlan) private plansRepo: Repository<MarketplaceCleaningPlan>,
    @InjectRepository(MarketplaceRoomUnit) private roomUnitsRepo: Repository<MarketplaceRoomUnit>,
    @InjectRepository(MarketplaceConditionMultiplier) private conditionsRepo: Repository<MarketplaceConditionMultiplier>,
    @InjectRepository(MarketplaceAddOn) private addOnsRepo: Repository<MarketplaceAddOn>,
    @InjectRepository(MarketplaceFrequencyDiscount) private frequencyDiscountsRepo: Repository<MarketplaceFrequencyDiscount>,
    @InjectRepository(MarketplaceSubscription) private subscriptionsRepo: Repository<MarketplaceSubscription>,
    @InjectRepository(MarketplaceSubscriptionEvent) private eventsRepo: Repository<MarketplaceSubscriptionEvent>,
    @InjectRepository(VendorCapability) private capabilityRepo: Repository<VendorCapability>,
    @InjectRepository(ServicePrice) private servicePriceRepo: Repository<ServicePrice>,
    private configService: ConfigService,
    private usersService: UsersService,
    private subscriptionsService: SubscriptionsService,
    private notificationsService: NotificationsService,
    @Inject(forwardRef(() => ServiceRequestsService))
    private serviceRequestsService: ServiceRequestsService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY', ''), { apiVersion: '2024-04-10' });
  }

  async onModuleInit() {
    await this.seedConfig();
    await this.seedCapabilityAndCatalog();
  }

  // ── Seeding ────────────────────────────────────────────────────────────

  private async seedConfig() {
    const plans: Partial<MarketplaceCleaningPlan>[] = [
      {
        cleaningType: CleaningType.STANDARD, costPerUnit: 13, retailPerUnit: 24,
        allowedFrequencies: [VisitFrequency.ONE_TIME, VisitFrequency.MONTHLY, VisitFrequency.BIWEEKLY, VisitFrequency.WEEKLY],
        defaultFrequency: VisitFrequency.MONTHLY,
      },
      {
        cleaningType: CleaningType.DEEP, costPerUnit: 20, retailPerUnit: 34,
        allowedFrequencies: [VisitFrequency.ONE_TIME, VisitFrequency.MONTHLY, VisitFrequency.BIWEEKLY, VisitFrequency.WEEKLY],
        defaultFrequency: VisitFrequency.MONTHLY,
      },
      {
        cleaningType: CleaningType.MOVE_OUT, costPerUnit: 25, retailPerUnit: 42,
        allowedFrequencies: [VisitFrequency.ONE_TIME],
        defaultFrequency: VisitFrequency.ONE_TIME,
      },
    ];
    for (const p of plans) {
      const existing = await this.plansRepo.findOne({ where: { cleaningType: p.cleaningType } });
      if (!existing) await this.plansRepo.save(this.plansRepo.create(p));
    }

    const roomUnits: Partial<MarketplaceRoomUnit>[] = [
      { key: 'bedroom', label: 'Bedroom', units: 1.0, sortOrder: 1 },
      { key: 'bathroom_full', label: 'Bathroom (full)', units: 1.5, sortOrder: 2 },
      { key: 'bathroom_half', label: 'Half Bathroom', units: 0.75, sortOrder: 3 },
      { key: 'kitchen', label: 'Kitchen', units: 2.0, sortOrder: 4 },
      { key: 'loft_bonus', label: 'Loft / Bonus Room', units: 1.0, sortOrder: 5 },
      { key: 'office', label: 'Office', units: 0.75, sortOrder: 6 },
      { key: 'dining_room', label: 'Dining Room', units: 0.5, sortOrder: 7 },
      { key: 'finished_basement', label: 'Finished Basement', units: 2.0, sortOrder: 8 },
      { key: 'additional_living_room', label: 'Additional Living Room', units: 1.0, sortOrder: 9 },
      { key: 'stairs_flight', label: 'Stairs (per flight)', units: 0.5, sortOrder: 10 },
    ];
    for (const r of roomUnits) {
      const existing = await this.roomUnitsRepo.findOne({ where: { key: r.key } });
      if (!existing) await this.roomUnitsRepo.save(this.roomUnitsRepo.create(r));
    }

    const conditions: Partial<MarketplaceConditionMultiplier>[] = [
      { key: 'well_maintained', label: 'Well Maintained', multiplier: 1.0, isBaseTier: true, sortOrder: 1 },
      { key: 'average', label: 'Average', multiplier: 1.1, isBaseTier: true, sortOrder: 2 },
      { key: 'not_cleaned_3mo', label: 'Not Cleaned in 3+ Months', multiplier: 1.25, isBaseTier: true, sortOrder: 3 },
      { key: 'has_pets', label: 'Has Pets', multiplier: 1.15, isBaseTier: false, sortOrder: 4 },
      { key: 'heavy_pet_hair', label: 'Heavy Pet Hair', multiplier: 1.25, isBaseTier: false, sortOrder: 5 },
      { key: 'has_children', label: 'Has Children', multiplier: 1.10, isBaseTier: false, sortOrder: 6 },
      { key: 'hoarding', label: 'Hoarding / Severe Dirt', multiplier: 1.0, isBaseTier: false, forcesQuote: true, sortOrder: 7 },
    ];
    for (const c of conditions) {
      const existing = await this.conditionsRepo.findOne({ where: { key: c.key } });
      if (!existing) await this.conditionsRepo.save(this.conditionsRepo.create(c));
    }

    const addOns: Partial<MarketplaceAddOn>[] = [
      { key: 'pet_hair', label: 'Pet Hair', subCost: 27.5, customerPrice: 39, sortOrder: 1 },
      { key: 'interior_windows', label: 'Interior Windows', subCost: 3, customerPrice: 7, perUnit: true, unitLabel: 'window', sortOrder: 2 },
      { key: 'refrigerator', label: 'Refrigerator', subCost: 25, customerPrice: 45, sortOrder: 3 },
      { key: 'oven', label: 'Oven', subCost: 27.5, customerPrice: 45, sortOrder: 4 },
      { key: 'laundry', label: 'Laundry', subCost: 27.5, customerPrice: 45, sortOrder: 5 },
      { key: 'dishes', label: 'Dishes', subCost: 20, customerPrice: 35, sortOrder: 6 },
      { key: 'bed_linen', label: 'Bed Linen Change', subCost: 5, customerPrice: 15, perUnit: true, unitLabel: 'bed', sortOrder: 7 },
      { key: 'balcony_patio', label: 'Balcony/Patio', subCost: 22.5, customerPrice: 35, sortOrder: 8 },
    ];
    for (const a of addOns) {
      const existing = await this.addOnsRepo.findOne({ where: { key: a.key } });
      if (!existing) await this.addOnsRepo.save(this.addOnsRepo.create(a));
    }

    const discounts: Partial<MarketplaceFrequencyDiscount>[] = [
      { frequency: VisitFrequency.MONTHLY, discountPercent: 0 },
      { frequency: VisitFrequency.BIWEEKLY, discountPercent: 10 },
      { frequency: VisitFrequency.WEEKLY, discountPercent: 15 },
    ];
    for (const d of discounts) {
      const existing = await this.frequencyDiscountsRepo.findOne({ where: { frequency: d.frequency } });
      if (!existing) await this.frequencyDiscountsRepo.save(this.frequencyDiscountsRepo.create(d));
    }
  }

  // Creates the "Cleaning Services" vendor capability (notifying every active
  // vendor, same as any admin-created capability) and one browsable/
  // searchable "House Cleaning" catalog row gated on it — see
  // marketplace-cleaning-plan/etc. for the actual pricing, this row's own
  // price fields are unused placeholders.
  private async seedCapabilityAndCatalog() {
    let capability = await this.capabilityRepo.findOne({ where: { name: CLEANING_SERVICES_CAPABILITY_NAME } });
    if (!capability) {
      capability = await this.capabilityRepo.save(this.capabilityRepo.create({ name: CLEANING_SERVICES_CAPABILITY_NAME }));
      const vendors = await this.usersService.findAllActiveVendors();
      if (vendors.length > 0) {
        await this.notificationsService.notifyVendors(
          vendors, NotificationType.NEW_CAPABILITY_AVAILABLE, 'New Capability Available',
          `"${capability.name}" has been added — update your profile if you'd like to offer it.`,
          { screen: 'capabilities' },
        ).catch(() => {});
      }
    }

    const existing = await this.servicePriceRepo.findOne({ where: { name: HOUSE_CLEANING_CATALOG_NAME } });
    if (!existing) {
      await this.servicePriceRepo.save(this.servicePriceRepo.create({
        name: HOUSE_CLEANING_CATALOG_NAME,
        description: 'Recurring house cleaning, tailored to your home and schedule.',
        basePrice: 0,
        pricingMethod: PricingMethod.FLAT_PRICE,
        category: ServiceCategory.HOUSE_CLEANING,
        serviceGroups: [ServiceGroup.MARKETPLACE],
        customerRequestable: true,
        requiredCapabilityId: capability.id,
      }));
    }
  }

  // ── Config lookups ─────────────────────────────────────────────────────

  async getConfig() {
    const [plans, roomUnits, conditions, addOns, frequencyDiscounts] = await Promise.all([
      this.plansRepo.find({ order: { cleaningType: 'ASC' } }),
      this.roomUnitsRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.conditionsRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.addOnsRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.frequencyDiscountsRepo.find({ where: { isActive: true } }),
    ]);
    return { plans: plans.filter((p) => p.isActive), roomUnits, conditions, addOns, frequencyDiscounts };
  }

  private async getActivePlan(cleaningType: CleaningType): Promise<MarketplaceCleaningPlan> {
    const plan = await this.plansRepo.findOne({ where: { cleaningType, isActive: true } });
    if (!plan) throw new BadRequestException(`${cleaningType} cleaning is not currently available.`);
    return plan;
  }

  private async getFrequencyDiscountPercent(frequency: VisitFrequency): Promise<number> {
    if (frequency === VisitFrequency.ONE_TIME) return 0;
    const row = await this.frequencyDiscountsRepo.findOne({ where: { frequency, isActive: true } });
    return row ? Number(row.discountPercent) : 0;
  }

  // ── Pricing ────────────────────────────────────────────────────────────

  async quote(dto: QuoteHouseCleaningDto): Promise<HouseCleaningQuote> {
    const plan = await this.getActivePlan(dto.cleaningType);
    if (!plan.allowedFrequencies.includes(dto.visitFrequency)) {
      throw new BadRequestException(`${dto.visitFrequency} is not available for ${dto.cleaningType} cleaning.`);
    }

    const [roomUnits, conditions, addOnCatalog] = await Promise.all([
      this.roomUnitsRepo.find(),
      this.conditionsRepo.find(),
      this.addOnsRepo.find(),
    ]);

    const conditionMultiplier = computeConditionMultiplier(dto.conditions, conditions);
    if (conditionMultiplier === QUOTE_REQUIRED) {
      return { perVisitCost: 0, monthlyPrice: null, quoteRequired: true };
    }

    const bcu = computeBCU(dto.houseConfig, roomUnits);
    const addOnsTotal = computeAddOnsTotal(dto.addOns ?? [], addOnCatalog);
    const frequencyDiscount = await this.getFrequencyDiscountPercent(dto.visitFrequency);
    const perVisitCost = computePerVisitCost(bcu, Number(plan.retailPerUnit), conditionMultiplier, frequencyDiscount, addOnsTotal);

    if (dto.visitFrequency === VisitFrequency.ONE_TIME) {
      return { perVisitCost, monthlyPrice: null, quoteRequired: false };
    }

    const monthlyPrice = computeMonthlySubscriptionPrice(perVisitCost, dto.visitFrequency);
    return { perVisitCost, monthlyPrice, quoteRequired: false };
  }

  // ── Subscribe (Standard/Deep, recurring) ──────────────────────────────

  async subscribe(customerId: string, dto: QuoteHouseCleaningDto): Promise<{ clientSecret: string | null; subscriptionId: string }> {
    if (dto.visitFrequency === VisitFrequency.ONE_TIME) {
      throw new BadRequestException('One-time cleanings are booked directly — use /marketplace/house-cleaning/one-time.');
    }
    if (dto.cleaningType === CleaningType.MOVE_OUT) {
      throw new BadRequestException('Move-Out cleanings are one-time only.');
    }

    // Marketplace is an add-on — requires an active core Attenteve plan.
    const coreSubscription = await this.subscriptionsService.getActiveSubscription(customerId);
    if (!coreSubscription) throw new BadRequestException('An active Attenteve plan is required to subscribe to Marketplace services.');

    const quote = await this.quote(dto);
    if (quote.quoteRequired || quote.monthlyPrice == null) {
      throw new BadRequestException('This configuration requires a manual quote — please contact support.');
    }

    const stripeCustomerId = await this.subscriptionsService.getOrCreateStripeCustomer(customerId);
    const product = await this.ensureStripeProduct();
    const anchor = nextMonthlyBillingAnchor();

    const stripeSub = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        price_data: {
          currency: 'usd',
          product: product.id,
          unit_amount: Math.round(quote.monthlyPrice * 100),
          recurring: { interval: 'month' },
        },
      }],
      billing_cycle_anchor: anchor,
      proration_behavior: 'create_prorations',
      payment_behavior: 'default_incomplete',
      // Card-only — same reasoning as the core plan's own subscription
      // creation (no deep-link/return-URL handling for redirect-based methods).
      payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
      expand: ['latest_invoice.payment_intent'],
      metadata: { type: 'marketplace', customerId, cleaningType: dto.cleaningType },
    });

    const now = new Date();
    const priceLockedUntil = new Date(now);
    priceLockedUntil.setFullYear(priceLockedUntil.getFullYear() + 1);

    const record = this.subscriptionsRepo.create({
      customerId,
      cleaningType: dto.cleaningType,
      visitFrequency: dto.visitFrequency,
      houseConfig: dto.houseConfig,
      conditions: dto.conditions,
      addOns: dto.addOns ?? [],
      computedPerVisitPrice: quote.perVisitCost,
      computedMonthlyPrice: quote.monthlyPrice,
      priceLockedUntil,
      status: MarketplaceSubscriptionStatus.ACTIVE,
      startDate: now,
      stripeSubscriptionId: stripeSub.id,
      nextVisitDate: now,
    });
    const saved = await this.subscriptionsRepo.save(record);

    await this.eventsRepo.save(this.eventsRepo.create({
      marketplaceSubscriptionId: saved.id,
      type: MarketplaceEventType.CREATED,
      amount: quote.monthlyPrice,
    }));

    const invoice = stripeSub.latest_invoice as Stripe.Invoice;
    const pi = invoice?.payment_intent as Stripe.PaymentIntent | null;

    return { clientSecret: pi?.client_secret ?? null, subscriptionId: saved.id };
  }

  private async ensureStripeProduct(): Promise<Stripe.Product> {
    const products = await this.stripe.products.list({ limit: 100, active: true });
    const existing = products.data.find((p) => p.name === 'House Cleaning Membership');
    if (existing) return existing;
    return this.stripe.products.create({ name: 'House Cleaning Membership' });
  }

  // ── One-time booking (Move-Out, or Standard/Deep booked once) ─────────

  async bookOneTimeCleaning(customerId: string, dto: QuoteHouseCleaningDto & { preferredDate: string }) {
    if (dto.visitFrequency !== VisitFrequency.ONE_TIME) {
      throw new BadRequestException('Use /marketplace/house-cleaning/subscribe for a recurring plan.');
    }
    const quote = await this.quote(dto);
    if (quote.quoteRequired) throw new BadRequestException('This configuration requires a manual quote — please contact support.');

    const houseCleaningPrice = await this.servicePriceRepo.findOne({ where: { name: HOUSE_CLEANING_CATALOG_NAME } });
    if (!houseCleaningPrice) throw new NotFoundException('House Cleaning is not currently available.');

    const customer = await this.usersService.findById(customerId);
    const profile = customer.customerProfile;
    if (!profile) throw new BadRequestException('A saved address is required to book a cleaning.');

    return this.serviceRequestsService.createMarketplaceBooking(customerId, {
      servicePriceId: houseCleaningPrice.id,
      preferredDate: dto.preferredDate,
      price: quote.perVisitCost,
      address: profile.address,
      city: profile.city,
      state: profile.state,
      zipCode: profile.zipCode,
    });
  }

  // ── Recurring visit generation (called by MarketplaceVisitSchedulerService) ─

  async generateDueVisits(): Promise<number> {
    const now = new Date();
    const due = await this.subscriptionsRepo.find({
      where: { status: MarketplaceSubscriptionStatus.ACTIVE, nextVisitDate: LessThanOrEqual(now) },
    });
    if (due.length === 0) return 0;

    const houseCleaningPrice = await this.servicePriceRepo.findOne({ where: { name: HOUSE_CLEANING_CATALOG_NAME } });
    if (!houseCleaningPrice) {
      this.logger.warn('House Cleaning catalog row missing — cannot generate Marketplace visits.');
      return 0;
    }

    let created = 0;
    for (const sub of due) {
      try {
        const customer = await this.usersService.findById(sub.customerId);
        const profile = customer.customerProfile;
        if (!profile) {
          this.logger.warn(`Marketplace subscription ${sub.id}: customer has no saved address, skipping this cycle.`);
          continue;
        }

        await this.serviceRequestsService.createMarketplaceBooking(sub.customerId, {
          servicePriceId: houseCleaningPrice.id,
          preferredDate: sub.nextVisitDate.toISOString(),
          price: Number(sub.computedPerVisitPrice),
          marketplaceSubscriptionId: sub.id,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          zipCode: profile.zipCode,
        });

        sub.nextVisitDate = advanceVisitDate(sub.nextVisitDate, sub.visitFrequency);
        sub.lastVisitGeneratedAt = now;
        await this.subscriptionsRepo.save(sub);
        created++;
      } catch (err: any) {
        this.logger.warn(`Failed to generate Marketplace visit for subscription ${sub.id}: ${err.message}`);
      }
    }
    return created;
  }

  // ── Stripe webhook (dispatched from PaymentsController alongside the core
  // plan's own handler — each independently no-ops if the stripeSubscriptionId
  // isn't theirs, so no metadata-based routing is needed) ─────────────────

  async handleSubscriptionWebhook(event: Stripe.Event): Promise<void> {
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!stripeSubId) return;
      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (!sub) return;

      if (sub.status !== MarketplaceSubscriptionStatus.ACTIVE) {
        sub.status = MarketplaceSubscriptionStatus.ACTIVE;
        await this.subscriptionsRepo.save(sub);
      }
      await this.eventsRepo.save(this.eventsRepo.create({
        marketplaceSubscriptionId: sub.id,
        type: MarketplaceEventType.RENEWED,
        amount: (invoice.amount_paid ?? 0) / 100,
      }));
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!stripeSubId) return;
      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (!sub) return;

      sub.status = MarketplaceSubscriptionStatus.PAST_DUE;
      await this.subscriptionsRepo.save(sub);
      await this.eventsRepo.save(this.eventsRepo.create({
        marketplaceSubscriptionId: sub.id,
        type: MarketplaceEventType.PAYMENT_FAILED,
      }));
    }

    if (event.type === 'customer.subscription.deleted') {
      const stripeSub = event.data.object as Stripe.Subscription;
      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSub.id } });
      if (!sub || sub.status === MarketplaceSubscriptionStatus.CANCELLED) return;

      sub.status = MarketplaceSubscriptionStatus.CANCELLED;
      sub.cancelledAt = new Date();
      await this.subscriptionsRepo.save(sub);
      await this.eventsRepo.save(this.eventsRepo.create({
        marketplaceSubscriptionId: sub.id,
        type: MarketplaceEventType.CANCELLED,
      }));
    }
  }

  // ── Admin config CRUD (enable/disable + edit-in-place) ─────────────────

  async updateCleaningPlan(id: string, data: Partial<MarketplaceCleaningPlan>) {
    await this.plansRepo.update(id, data);
    return this.plansRepo.findOne({ where: { id } });
  }

  async updateRoomUnit(id: string, data: Partial<MarketplaceRoomUnit>) {
    await this.roomUnitsRepo.update(id, data);
    return this.roomUnitsRepo.findOne({ where: { id } });
  }

  async updateConditionMultiplier(id: string, data: Partial<MarketplaceConditionMultiplier>) {
    await this.conditionsRepo.update(id, data);
    return this.conditionsRepo.findOne({ where: { id } });
  }

  async updateAddOn(id: string, data: Partial<MarketplaceAddOn>) {
    await this.addOnsRepo.update(id, data);
    return this.addOnsRepo.findOne({ where: { id } });
  }

  async updateFrequencyDiscount(id: string, data: Partial<MarketplaceFrequencyDiscount>) {
    await this.frequencyDiscountsRepo.update(id, data);
    return this.frequencyDiscountsRepo.findOne({ where: { id } });
  }
}
