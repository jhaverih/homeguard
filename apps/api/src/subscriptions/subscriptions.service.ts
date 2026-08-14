import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { CustomerSubscription, SubscriptionStatus } from './entities/customer-subscription.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { PlanTier } from '../common/enums/role.enum';
import { addYears } from './utils/date.util';
import { UsersService } from '../users/users.service';
import { YolinkService } from '../yolink/yolink.service';
import { PricingService } from '../pricing/pricing.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { CURRENT_CUSTOMER_TOS_VERSION } from '../common/constants/tos';
import { PropertyCharacteristicsService } from '../users/property-characteristics.service';
import { calcCarePlusSurcharge } from '../common/utils/property-surcharge.utils';

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  private stripe: Stripe;
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private plansRepo: Repository<SubscriptionPlan>,
    @InjectRepository(CustomerSubscription)
    private subscriptionsRepo: Repository<CustomerSubscription>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    private configService: ConfigService,
    private usersService: UsersService,
    private yolinkService: YolinkService,
    private pricingService: PricingService,
    private notificationsService: NotificationsService,
    private propertyCharacteristicsService: PropertyCharacteristicsService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY', ''), {
      apiVersion: '2024-04-10',
    });
  }

  async onModuleInit() {
    await this.seedPlans();
    await this.renameHomeInspectionInPlanText();
    await this.updateCarePlusProactiveContent();
  }

  // Always-run, unconditional content rewrite for CarePlus/Proactive's
  // description + feature checklist (converges to the same literal content
  // every boot, so no "already applied" guard is needed — same pattern as
  // renameHomeInspectionInPlanText above). Sub-items (e.g. under "Water
  // Leaks:") are plain strings in the flat features array prefixed with
  // "- " — apps/mobile/app/(customer)/subscribe.tsx strips that prefix and
  // renders those lines indented with no checkmark icon, everything else
  // keeps the normal checkmark row.
  private async updateCarePlusProactiveContent() {
    const inspectionScopeFeatures = [
      'HVAC Visual Assessment',
      'Doors & Windows',
      'Water Leaks:',
      '- Bathrooms',
      '- Kitchen',
      '- Water Heater',
      '- Laundry',
      'Exterior Visual Assessment:',
      '- Trim and Facia',
      '- Gutters',
      '- Roof',
      '- Decks',
      '- Siding',
      '- Concrete surfaces',
      '- Vegetation',
    ];

    await this.plansRepo.update(
      { tier: PlanTier.BASIC },
      {
        description: '',
        features: [
          'One (1) Preventative Home Assessment per year — Includes:',
          ...inspectionScopeFeatures,
          'Smoke Detector testing',
          'Materials not included',
        ],
      },
    );

    await this.plansRepo.update(
      { tier: PlanTier.STANDARD },
      {
        description: '',
        features: [
          'Two (2) Preventative Home Assessments per year — Includes:',
          ...inspectionScopeFeatures,
          'Smoke Detector testing',
          'Washer machine pan Monitoring and Alert',
          'AC drainage pan water leak Monitoring and Alert',
          'Low Temperature Monitoring and Alert',
          'Materials not included',
        ],
      },
    );
  }

  // Plan description/features text was set directly against the live DB
  // (the BASIC/STANDARD seed array below is stale — live prices/descriptions
  // already diverged from it before this ran) and repeatedly says "Home
  // Inspection" (e.g. CarePlus's "One (1) Home Inspection per year..."),
  // naming the catalog item just renamed to "Preventative Home Assessment"
  // in pricing.service.ts. A plain substring replace also handles the plural
  // ("Home Inspections" -> "Preventative Home Assessments") since the "s"
  // simply carries through unchanged. Idempotent — re-running finds nothing
  // left to replace.
  private async renameHomeInspectionInPlanText() {
    const plans = await this.plansRepo.find();
    for (const plan of plans) {
      const newDescription = plan.description?.replace(/Home Inspection/g, 'Preventative Home Assessment') ?? plan.description;
      const newFeatures = (plan.features ?? []).map((f) => f.replace(/Home Inspection/g, 'Preventative Home Assessment'));
      const descChanged = newDescription !== plan.description;
      const featuresChanged = newFeatures.some((f, i) => f !== plan.features?.[i]);
      if (descChanged || featuresChanged) {
        await this.plansRepo.update(plan.id, { description: newDescription, features: newFeatures });
      }
    }
  }

  private async seedPlans() {
    const plans = [
      {
        tier: PlanTier.FREE,
        name: 'Care Plan',
        description: 'Request any service or subscription at standard pricing — no membership fee.',
        price: 0,
        inspectionsPerYear: 0,
        addonInspectionPrice: 100,
        features: [
          'Request any service at standard pricing',
          'No annual membership fee',
          'Upgrade anytime for included inspections and member pricing',
        ],
      },
      {
        tier: PlanTier.BASIC,
        name: 'CarePlus',
        description: '2 annual inspections covering AC, toilets, and light bulbs',
        price: 99,
        inspectionsPerYear: 2,
        addonInspectionPrice: 89,
        features: [
          'AC visual inspection & filter replacement',
          'Toilet water leakage verification',
          'Light bulb replacement check',
          '2 inspections per year',
        ],
      },
      {
        tier: PlanTier.STANDARD,
        name: 'Proactive',
        description: 'CarePlus plan plus water leak monitoring for AC and washer',
        price: 199,
        inspectionsPerYear: 2,
        addonInspectionPrice: 79,
        features: [
          'All CarePlus plan features',
          'AC drainage pan water leak monitoring',
          'Washer machine pan monitoring',
          '2 inspections per year',
        ],
      },
    ];

    for (const planData of plans) {
      let existing = await this.plansRepo.findOne({ where: { tier: planData.tier } });

      if (!existing) {
        existing = await this.plansRepo.save(this.plansRepo.create(planData));
      }

      // A $0 plan is meant to activate instantly with no Stripe checkout —
      // subscribe() already falls back to manual activation whenever
      // stripePriceId is null, so just never create one for the free tier.
      const isFree = Number(planData.price) === 0;
      if (!isFree && !existing.stripePriceId && this.configService.get('STRIPE_SECRET_KEY', '').startsWith('sk_')) {
        try {
          const price = await this.ensureStripePriceForPlan(existing);
          await this.plansRepo.update(existing.id, { stripePriceId: price.id });
          this.logger.log(`Stripe Price synced for ${planData.tier}: ${price.id}`);
        } catch (err) {
          this.logger.warn(`Could not create Stripe price for ${planData.tier}: ${err.message}`);
        }
      }
    }
  }

  private async ensureStripePriceForPlan(plan: SubscriptionPlan): Promise<Stripe.Price> {
    const lookupKey = `homeguard_${plan.tier.toLowerCase()}`;

    const existing = await this.stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
    });

    if (existing.data.length > 0) return existing.data[0];

    const product = await this.stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { planTier: plan.tier },
    });

    return this.stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(Number(plan.price) * 100),
      currency: 'usd',
      recurring: { interval: 'year' },
      lookup_key: lookupKey,
      metadata: { planTier: plan.tier },
    });
  }

  // BASIC (CarePlus) is the only tier priced per-customer — every other tier
  // just uses its shared plan.stripePriceId unchanged. Returns plan.stripePriceId
  // itself whenever there's nothing to surcharge for (no characteristics on file,
  // or a $0 surcharge), so callers never need to special-case the "no surcharge"
  // case separately.
  private async resolveTargetStripePriceId(customerId: string, plan: SubscriptionPlan): Promise<string> {
    if (!plan.stripePriceId || plan.tier !== PlanTier.BASIC) return plan.stripePriceId;
    const characteristics = await this.propertyCharacteristicsService.get(customerId);
    if (!characteristics) return plan.stripePriceId;
    const surcharge = calcCarePlusSurcharge(characteristics);
    if (surcharge <= 0) return plan.stripePriceId;
    return this.getOrCreateCarePlusStripePriceId(plan, surcharge);
  }

  // One Stripe Price per distinct surcharge amount (not per customer) — every
  // customer with the same home characteristics-derived surcharge shares the
  // same Price object, keyed by a lookup_key derived from the dollar amount,
  // same reuse pattern as ensureStripePriceForPlan's lookup_key.
  private async getOrCreateCarePlusStripePriceId(plan: SubscriptionPlan, surcharge: number): Promise<string> {
    const lookupKey = `homeguard_careplus_surcharge_${Math.round(surcharge * 100)}`;
    const existing = await this.stripe.prices.list({ lookup_keys: [lookupKey], active: true });
    if (existing.data.length > 0) return existing.data[0].id;

    const basePrice = await this.stripe.prices.retrieve(plan.stripePriceId);
    const price = await this.stripe.prices.create({
      product: basePrice.product as string,
      unit_amount: Math.round((Number(plan.price) + surcharge) * 100),
      currency: 'usd',
      recurring: { interval: 'year' },
      lookup_key: lookupKey,
      metadata: { planTier: plan.tier, surcharge: String(surcharge) },
    });
    return price.id;
  }

  async getOrCreateStripeCustomer(userId: string): Promise<string> {
    const user = await this.usersService.findById(userId);

    if (user.stripeCustomerId) {
      try {
        const existing = await this.stripe.customers.retrieve(user.stripeCustomerId);
        if (!existing.deleted) return user.stripeCustomerId;
      } catch {
        // Customer doesn't exist in this Stripe account — fall through to create a new one
        await this.usersService.updateStripeCustomerId(userId, null);
      }
    }

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.fullName,
      metadata: { userId },
    });

    await this.usersService.updateStripeCustomerId(userId, customer.id);
    return customer.id;
  }

  async getPlans(): Promise<SubscriptionPlan[]> {
    const plans = await this.plansRepo.find({ where: { isActive: true } });
    // No ORDER BY at the DB level, so row order is otherwise undefined —
    // always show Basic/Standard/Premium in that fixed tier order, everywhere
    // this single endpoint is consumed (admin, mobile subscribe/register).
    const tierOrder = Object.values(PlanTier);
    return plans.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
  }

  async getActiveSubscription(customerId: string): Promise<CustomerSubscription | null> {
    // Family members share the primary account's subscription — "same rights" as the owner.
    const ownerId = await this.usersService.getEffectiveSubscriptionOwnerId(customerId);
    return this.subscriptionsRepo.findOne({
      where: { customerId: ownerId, status: SubscriptionStatus.ACTIVE },
      relations: ['plan'],
    });
  }

  async subscribe(customerId: string, planId: string, acceptedTerms = false): Promise<{ clientSecret: string; subscriptionId?: string; paymentIntentId?: string }> {
    const ownerId = await this.usersService.getEffectiveSubscriptionOwnerId(customerId);
    const existing = await this.getActiveSubscription(ownerId);
    if (existing) throw new BadRequestException('Customer already has an active subscription');
    customerId = ownerId;

    // Only the first-ever subscription needs a fresh acceptance — once
    // termsAcceptedAt is set we don't re-block a customer resubscribing later.
    const user = await this.usersService.findById(customerId);
    if (!user.termsAcceptedAt && !acceptedTerms) {
      throw new BadRequestException('You must accept the Terms and Conditions to subscribe.');
    }

    const plan = await this.plansRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    if (!user.termsAcceptedAt) {
      await this.usersService.acceptCustomerTerms(customerId, CURRENT_CUSTOMER_TOS_VERSION);
    }

    if (plan.stripePriceId) {
      const priceId = await this.resolveTargetStripePriceId(customerId, plan);
      return this.subscribeViaStripe(customerId, plan, priceId);
    }

    // Fallback: manual subscription (no Stripe price configured yet)
    const now = new Date();
    const subscription = this.subscriptionsRepo.create({
      customerId,
      planId,
      status: SubscriptionStatus.ACTIVE,
      inspectionsUsed: 0,
      startDate: now,
      endDate: addYears(now, 1),
    });
    await this.subscriptionsRepo.save(subscription);
    return { clientSecret: '' };
  }

  private async subscribeViaStripe(customerId: string, plan: SubscriptionPlan, priceId: string = plan.stripePriceId): Promise<{ clientSecret: string; subscriptionId: string }> {
    const stripeCustomerId = await this.getOrCreateStripeCustomer(customerId);

    const subscription = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      // Card-only — the app has no deep-link/return-URL handling built, and
      // redirect-based payment methods would require a return_url at
      // confirmation that we can't satisfy today.
      payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
      expand: ['latest_invoice.payment_intent'],
      metadata: { customerId, planId: plan.id },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const pi = invoice.payment_intent as Stripe.PaymentIntent;

    const now = new Date();
    const dbSub = this.subscriptionsRepo.create({
      customerId,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      inspectionsUsed: 0,
      startDate: now,
      endDate: addYears(now, 1),
      stripeSubscriptionId: subscription.id,
    });
    await this.subscriptionsRepo.save(dbSub);

    return { clientSecret: pi.client_secret, subscriptionId: subscription.id };
  }

  async incrementInspectionsUsed(subscriptionId: string, isAddon = false): Promise<void> {
    const sub = await this.subscriptionsRepo.findOne({ where: { id: subscriptionId }, relations: ['plan'] });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (!isAddon && sub.inspectionsUsed >= sub.plan.inspectionsPerYear) {
      throw new BadRequestException('No inspections remaining on this subscription');
    }
    await this.subscriptionsRepo.increment({ id: subscriptionId }, 'inspectionsUsed', 1);
  }

  async cancelSubscription(customerId: string): Promise<CustomerSubscription> {
    // Any family member can cancel the shared household subscription — "same rights".
    const sub = await this.getActiveSubscription(customerId);
    if (!sub) throw new NotFoundException('No active subscription found');

    if (sub.stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (err) {
        this.logger.warn(`Stripe subscription cancel failed: ${err.message}`);
      }
    }

    sub.status = SubscriptionStatus.CANCELLED;
    return this.subscriptionsRepo.save(sub);
  }

  async changePlan(customerId: string, newPlanId: string): Promise<{ clientSecret?: string; subscriptionId?: string }> {
    // Any family member can change the shared household subscription — "same rights".
    const sub = await this.getActiveSubscription(customerId);
    if (!sub) throw new NotFoundException('No active subscription found');
    const plan = await this.plansRepo.findOne({ where: { id: newPlanId } });
    if (!plan) throw new NotFoundException('Plan not found');

    if (sub.stripeSubscriptionId && plan.stripePriceId) {
      const priceId = await this.resolveTargetStripePriceId(sub.customerId, plan);
      const stripeSub = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

      if (stripeSub.status === 'incomplete') {
        // Payment was never collected — cancel the stale subscription and start fresh.
        // Use sub.customerId (the resolved owner), not the caller's own id, so a family
        // member restarting checkout doesn't fork off a separate subscription.
        try { await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId); } catch { /* ignore */ }
        await this.subscriptionsRepo.remove(sub);
        return this.subscribeViaStripe(sub.customerId, plan, priceId);
      }

      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{ id: stripeSub.items.data[0].id, price: priceId }],
        proration_behavior: 'create_prorations',
      });
    }

    sub.planId = newPlanId;
    sub.plan = plan;
    await this.subscriptionsRepo.save(sub);

    await this.checkMonitoringEligibility(sub.customerId).catch((e) =>
      this.logger.warn(`checkMonitoringEligibility failed after plan change: ${e.message}`),
    );
    return {};
  }

  // Notifies Houmi admins once a customer is confirmed on a paid Standard/Premium
  // plan and doesn't yet have home monitoring — admins review and dispatch a
  // vendor via the "Request Connection" action (admin.service.ts). Safe to call
  // repeatedly: the existing-request check prevents duplicate notifications.
  async checkMonitoringEligibility(customerId: string): Promise<void> {
    const sub = await this.getActiveSubscription(customerId);
    if (!sub || (sub.plan?.tier !== PlanTier.STANDARD && sub.plan?.tier !== PlanTier.PREMIUM)) return;

    const linkedHomes = await this.yolinkService.getLinkedHomes(sub.customerId);
    if (linkedHomes.length > 0) return;

    const monitoringPrice = await this.pricingService.findByName('Home Monitoring Setup');
    if (!monitoringPrice) return;

    const existingRequest = await this.requestsRepo.findOne({
      where: { customerId: sub.customerId, servicePriceId: monitoringPrice.id },
    });
    if (existingRequest) return;

    const admins = await this.usersService.findAdminTeamUsers();
    for (const admin of admins) {
      await this.notificationsService.notifyUserWithEmail(
        admin.id,
        NotificationType.MONITORING_SETUP_ELIGIBLE,
        'Home Monitoring Setup Needed',
        `A customer on the ${sub.plan.name} plan needs Yolink home monitoring dispatched — review in Monitoring Setup.`,
        { customerId: sub.customerId },
      );
    }
  }

  // Called after a customer adds/edits PropertyCharacteristics while already on
  // CarePlus — swaps their live subscription onto whatever Stripe Price the
  // current characteristics now resolve to (reuses the same swap-Stripe-price
  // mechanism as changePlan). A no-op for every other tier, or a customer whose
  // recomputed price hasn't actually changed.
  async repriceCarePlus(customerId: string): Promise<{ ok: boolean }> {
    const ownerId = await this.usersService.getEffectiveSubscriptionOwnerId(customerId);
    const sub = await this.getActiveSubscription(ownerId);
    if (!sub || sub.plan.tier !== PlanTier.BASIC || !sub.stripeSubscriptionId || !sub.plan.stripePriceId) {
      return { ok: false };
    }

    const priceId = await this.resolveTargetStripePriceId(ownerId, sub.plan);
    const stripeSub = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
    if (stripeSub.items.data[0].price.id === priceId) return { ok: true };

    await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: stripeSub.items.data[0].id, price: priceId }],
      proration_behavior: 'create_prorations',
    });
    return { ok: true };
  }

  async updatePlan(planId: string, data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    await this.plansRepo.update(planId, data);
    return this.plansRepo.findOne({ where: { id: planId } });
  }

  async handleSubscriptionWebhook(event: Stripe.Event): Promise<void> {
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!stripeSubId) return;

      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (!sub) return;

      if (sub.status !== SubscriptionStatus.ACTIVE) {
        sub.status = SubscriptionStatus.ACTIVE;
        const now = new Date();
        sub.startDate = now;
        sub.endDate = addYears(now, 1);
        await this.subscriptionsRepo.save(sub);

        await this.checkMonitoringEligibility(sub.customerId).catch((e) =>
          this.logger.warn(`checkMonitoringEligibility failed after subscription activation: ${e.message}`),
        );
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!stripeSubId) return;
      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSubId } });
      if (sub) {
        sub.status = SubscriptionStatus.CANCELLED;
        await this.subscriptionsRepo.save(sub);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const stripeSub = event.data.object as Stripe.Subscription;
      const sub = await this.subscriptionsRepo.findOne({ where: { stripeSubscriptionId: stripeSub.id } });
      if (sub && sub.status === SubscriptionStatus.ACTIVE) {
        sub.status = SubscriptionStatus.CANCELLED;
        await this.subscriptionsRepo.save(sub);
      }
    }
  }
}
