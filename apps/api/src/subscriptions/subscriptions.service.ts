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
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY', ''), {
      apiVersion: '2024-04-10',
    });
  }

  async onModuleInit() {
    await this.seedPlans();
  }

  private async seedPlans() {
    const plans = [
      {
        tier: PlanTier.BASIC,
        name: 'Basic Plan',
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
        name: 'Standard Plan',
        description: 'Basic plan plus water leak monitoring for AC and washer',
        price: 199,
        inspectionsPerYear: 2,
        addonInspectionPrice: 79,
        features: [
          'All Basic plan features',
          'AC drainage pan water leak monitoring',
          'Washer machine pan monitoring',
          '2 inspections per year',
        ],
      },
      {
        tier: PlanTier.PREMIUM,
        name: 'Premium Plan',
        description: 'Standard plan plus full HVAC monitoring',
        price: 299,
        inspectionsPerYear: 2,
        addonInspectionPrice: 69,
        features: [
          'All Standard plan features',
          'Full HVAC system monitoring',
          '2 inspections per year',
          'Priority scheduling',
        ],
      },
    ];

    for (const planData of plans) {
      let existing = await this.plansRepo.findOne({ where: { tier: planData.tier } });

      if (!existing) {
        existing = await this.plansRepo.save(this.plansRepo.create(planData));
      }

      if (!existing.stripePriceId && this.configService.get('STRIPE_SECRET_KEY', '').startsWith('sk_')) {
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
      return this.subscribeViaStripe(customerId, plan);
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

  private async subscribeViaStripe(customerId: string, plan: SubscriptionPlan): Promise<{ clientSecret: string; subscriptionId: string }> {
    const stripeCustomerId = await this.getOrCreateStripeCustomer(customerId);

    const subscription = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId }],
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
      const stripeSub = await this.stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

      if (stripeSub.status === 'incomplete') {
        // Payment was never collected — cancel the stale subscription and start fresh.
        // Use sub.customerId (the resolved owner), not the caller's own id, so a family
        // member restarting checkout doesn't fork off a separate subscription.
        try { await this.stripe.subscriptions.cancel(sub.stripeSubscriptionId); } catch { /* ignore */ }
        await this.subscriptionsRepo.remove(sub);
        return this.subscribeViaStripe(sub.customerId, plan);
      }

      await this.stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{ id: stripeSub.items.data[0].id, price: plan.stripePriceId }],
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
