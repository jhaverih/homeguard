import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, In, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import Stripe from 'stripe';
import { Payment } from './entities/payment.entity';
import { AdditionalService } from '../service-requests/entities/additional-service.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { VendorMembershipPayment } from '../vendor/entities/vendor-membership-payment.entity';
import { PaymentStatus, PaymentType } from '../common/enums/role.enum';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const DISPUTE_WINDOW_HOURS = 48;

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentsRepo: Repository<Payment>,
    @InjectRepository(AdditionalService)
    private additionalRepo: Repository<AdditionalService>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    @InjectRepository(VendorMembershipPayment)
    private membershipPaymentsRepo: Repository<VendorMembershipPayment>,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
    private subscriptionsService: SubscriptionsService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY', ''), {
      apiVersion: '2024-04-10',
    });
  }

  async createVendorOnboardingLink(vendorId: string): Promise<{ url: string }> {
    const vendor = await this.usersService.findById(vendorId);
    const companyStripe = await this.usersService.getCompanyStripeAccount(vendorId);
    let accountId = companyStripe.accountId;

    if (!accountId) {
      try {
        const account = await this.stripe.accounts.create({
          type: 'express',
          email: vendor.email,
          metadata: { vendorId },
        });
        accountId = account.id;
        await this.usersService.saveVendorStripeAccountId(vendorId, accountId);
      } catch (err: any) {
        const detail = err?.raw?.message || err?.message || 'Stripe Connect not enabled';
        this.logger.warn(`Stripe Connect unavailable for vendor ${vendorId}: ${detail}`);
        throw new BadRequestException('STRIPE_CONNECT_UNAVAILABLE');
      }
    }

    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${this.configService.get('API_URL')}/payments/onboarding/refresh`,
      return_url: `${this.configService.get('API_URL')}/payments/onboarding/complete`,
      type: 'account_onboarding',
    });

    return { url: link.url };
  }

  async createAuthHold(
    serviceRequestId: string,
    customerId: string,
    vendorId: string,
    amount: number,
    description: string,
    type: PaymentType = PaymentType.ADDITIONAL_SERVICE,
  ): Promise<{ clientSecret: string; paymentId: string }> {
    // Payouts always go to the assigned technician's company account, never an
    // individual technician's own (unused) Stripe Connect account.
    const { accountId: vendorAccountId } = await this.usersService.getCompanyStripeAccount(vendorId);

    const platformFeePercent = Number(this.configService.get('PLATFORM_FEE_PERCENT', '15'));
    const amountInCents = Math.round(amount * 100);
    const platformFeeInCents = Math.round(amountInCents * (platformFeePercent / 100));
    const stripeFee = Math.round(amountInCents * 0.029 + 30);
    const vendorAmountInCents = amountInCents - platformFeeInCents - stripeFee;

    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: 'usd',
      capture_method: 'manual',
      // The app is card-only today with no deep-link/return-URL handling built,
      // so redirect-based payment methods are explicitly disabled — otherwise
      // Stripe requires a return_url at confirmation that we can't satisfy.
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { serviceRequestId, customerId, vendorId, paymentType: type },
      description,
    };

    // Attach the customer's saved default card (if any) so a "change payment method"
    // update actually affects one-off charges too, not just subscription renewals.
    const customer = await this.usersService.findById(customerId);
    if (customer.stripeCustomerId) {
      intentParams.customer = customer.stripeCustomerId;
    }

    if (vendorAccountId) {
      intentParams.application_fee_amount = platformFeeInCents;
      intentParams.transfer_data = { destination: vendorAccountId };
    }

    const paymentIntent = await this.stripe.paymentIntents.create(intentParams);

    const payment = this.paymentsRepo.create({
      serviceRequestId,
      customerId,
      vendorId,
      type,
      description,
      amount,
      platformFee: platformFeeInCents / 100,
      stripeFee: stripeFee / 100,
      vendorAmount: vendorAmountInCents / 100,
      currency: 'usd',
      status: PaymentStatus.PENDING,
      stripePaymentIntentId: paymentIntent.id,
      stripeClientSecret: paymentIntent.client_secret,
    });
    const saved = await this.paymentsRepo.save(payment);

    return { clientSecret: paymentIntent.client_secret, paymentId: saved.id };
  }

  // Called the moment a job is marked COMPLETED — charges the customer's
  // saved default card immediately (off-session, no app interaction
  // required) so vendor payout doesn't depend on the customer ever opening
  // the app. Falls back to a normal client-confirmable PaymentIntent (same
  // shape as createAuthHold, but automatic capture) when there's no saved
  // card or the off-session attempt fails (e.g. requires interactive 3DS) —
  // that fallback is what surfaces as the "Pay Now" card, resolved via
  // authorizePayment above.
  async chargeForCompletedService(
    serviceRequestId: string,
    customerId: string,
    vendorId: string,
    amount: number,
    description: string,
    type: PaymentType = PaymentType.ADDITIONAL_SERVICE,
  ): Promise<Payment> {
    const { accountId: vendorAccountId } = await this.usersService.getCompanyStripeAccount(vendorId);

    const platformFeePercent = Number(this.configService.get('PLATFORM_FEE_PERCENT', '15'));
    const amountInCents = Math.round(amount * 100);
    const platformFeeInCents = Math.round(amountInCents * (platformFeePercent / 100));
    const stripeFee = Math.round(amountInCents * 0.029 + 30);
    const vendorAmountInCents = amountInCents - platformFeeInCents - stripeFee;

    const transferParams: Partial<Stripe.PaymentIntentCreateParams> = vendorAccountId
      ? { application_fee_amount: platformFeeInCents, transfer_data: { destination: vendorAccountId } }
      : {};

    const basePayment = {
      serviceRequestId,
      customerId,
      vendorId,
      type,
      description,
      amount,
      platformFee: platformFeeInCents / 100,
      stripeFee: stripeFee / 100,
      vendorAmount: vendorAmountInCents / 100,
      currency: 'usd',
    };

    const customer = await this.usersService.findById(customerId);
    const methods = customer.stripeCustomerId ? await this.listPaymentMethods(customerId) : [];
    const defaultMethod = methods.find((m) => m.isDefault) ?? methods[0];

    if (defaultMethod) {
      try {
        const intent = await this.stripe.paymentIntents.create({
          customer: customer.stripeCustomerId,
          payment_method: defaultMethod.id,
          amount: amountInCents,
          currency: 'usd',
          off_session: true,
          confirm: true,
          description,
          metadata: { serviceRequestId, customerId, vendorId, paymentType: type },
          ...transferParams,
        });
        if (intent.status === 'succeeded') {
          const payment = this.paymentsRepo.create({
            ...basePayment,
            status: PaymentStatus.SUCCEEDED,
            stripePaymentIntentId: intent.id,
            capturedAt: new Date(),
            disputeWindowExpiresAt: this.disputeDeadline(),
          });
          return this.paymentsRepo.save(payment);
        }
      } catch (err: any) {
        // Off-session confirmations fail fast (rather than hang) when the
        // card requires interactive 3DS authentication — Stripe's
        // documented behavior — or is simply declined. Either way, fall
        // through to the client-confirmable PaymentIntent below.
        this.logger.warn(`Automatic charge failed for service request ${serviceRequestId}: ${err.message}`);
      }
    }

    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { serviceRequestId, customerId, vendorId, paymentType: type },
      description,
      ...transferParams,
    };
    if (customer.stripeCustomerId) intentParams.customer = customer.stripeCustomerId;

    const fallbackIntent = await this.stripe.paymentIntents.create(intentParams);
    const payment = this.paymentsRepo.create({
      ...basePayment,
      status: PaymentStatus.PENDING,
      stripePaymentIntentId: fallbackIntent.id,
      stripeClientSecret: fallbackIntent.client_secret,
    });
    const saved = await this.paymentsRepo.save(payment);

    await this.notificationsService.notifyUser(
      customerId,
      NotificationType.PAYMENT_PROCESSED,
      'Payment Needs Your Attention',
      `We couldn't automatically charge your card for "${description}" ($${amount}). Open the app to complete payment.`,
      { paymentId: saved.id },
    ).catch(() => {});

    return saved;
  }

  // Reached via the "Pay Now" fallback card — either the automatic
  // off-session charge in chargeForCompletedService already failed (no
  // saved card, or the card needed interactive 3DS the app can now
  // provide), or this is a legacy AUTHORIZED payment from before this
  // charge-at-completion redesign (created under the old manual-capture
  // hold flow, confirmed by the customer at the time but never captured —
  // the cron that used to auto-capture those was repurposed into an
  // alert-only job when capture moved to happen immediately everywhere
  // else, orphaning any that were already sitting in that state).
  //
  // The mobile client calls this BEFORE ever opening Stripe's payment
  // sheet now (not after) — Stripe's SDK refuses to initialize a sheet
  // against a PaymentIntent already past requires_payment_method (that's
  // exactly what a stuck legacy AUTHORIZED row looks like from the client's
  // side), so the decision of whether a sheet is even needed has to be made
  // here first.
  async authorizePayment(paymentId: string, customerId: string): Promise<
    { status: 'SUCCEEDED'; payment: Payment } | { status: 'NEEDS_CLIENT_ACTION'; clientSecret: string }
  > {
    const payment = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    // Any family member can authorize a shared household payment — "same rights".
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    if (!relatedIds.includes(payment.customerId)) throw new ForbiddenException();
    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.AUTHORIZED) {
      throw new BadRequestException('Payment is not in a payable state');
    }

    const pi = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);

    if (pi.status === 'requires_capture') {
      // Already confirmed (this legacy case, or a customer who completed
      // the sheet on an earlier attempt that didn't finish this call) —
      // just capture it. No further client interaction needed.
      await this.stripe.paymentIntents.capture(payment.stripePaymentIntentId);
    } else if (pi.status !== 'succeeded') {
      // Genuinely needs the customer to complete Stripe's payment sheet —
      // hand back the client secret instead of erroring, so the caller can
      // open it and then call this same endpoint again once it succeeds.
      return { status: 'NEEDS_CLIENT_ACTION', clientSecret: payment.stripeClientSecret };
    }

    payment.status = PaymentStatus.SUCCEEDED;
    payment.capturedAt = new Date();
    payment.disputeWindowExpiresAt = this.disputeDeadline();
    const saved = await this.paymentsRepo.save(payment);

    await this.notificationsService.notifyUser(
      customerId,
      NotificationType.PAYMENT_PROCESSED,
      'Payment Processed',
      `$${payment.amount} charged for "${payment.description}". You have ${DISPUTE_WINDOW_HOURS} hours to report an issue if something's wrong.`,
      { paymentId: saved.id },
    );

    return { status: 'SUCCEEDED', payment: saved };
  }

  private disputeDeadline(): Date {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + DISPUTE_WINDOW_HOURS);
    return expiresAt;
  }

  // Lets DisputesService check dispute-window eligibility (see openDispute)
  // without needing its own direct repository access to payments.
  async findByStripePaymentIntentId(stripePaymentIntentId: string): Promise<Payment | null> {
    return this.paymentsRepo.findOne({ where: { stripePaymentIntentId } });
  }

  // Called by DisputesService.resolve() when a dispute is resolved in the
  // customer's favor — the job is charged immediately at completion now
  // (see chargeForCompletedService), so "the customer wins the dispute"
  // means reversing money that's already moved, not voiding a hold.
  // reverse_transfer pulls the vendor's already-transferred portion back
  // out of their Connect account too, not just Attenteve's platform fee —
  // Stripe's standard semantics for refunding a Connect destination charge.
  async refundForDispute(stripePaymentIntentId: string): Promise<void> {
    const payment = await this.paymentsRepo.findOne({ where: { stripePaymentIntentId } });
    if (!payment) {
      this.logger.warn(`No payment found for disputed PaymentIntent ${stripePaymentIntentId} — nothing to refund`);
      return;
    }
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      this.logger.warn(`Payment ${payment.id} is ${payment.status}, not SUCCEEDED — skipping refund`);
      return;
    }

    await this.stripe.refunds.create({
      payment_intent: stripePaymentIntentId,
      reverse_transfer: true,
    });

    payment.status = PaymentStatus.REFUNDED;
    await this.paymentsRepo.save(payment);
  }

  // Also surfaces recently-SUCCEEDED payments still inside their dispute
  // window — the dashboard uses this same list to show "Charged $XXX" as a
  // completion confirmation with a chance to report an issue, not just
  // payments still awaiting the (now-rare) Pay Now fallback. It naturally
  // drops out of this list once disputeWindowExpiresAt passes, no separate
  // "dismiss" step needed.
  async getPendingPayments(customerId: string): Promise<Payment[]> {
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    return this.paymentsRepo.find({
      where: [
        { customerId: In(relatedIds), status: In([PaymentStatus.PENDING, PaymentStatus.AUTHORIZED]) },
        { customerId: In(relatedIds), status: PaymentStatus.SUCCEEDED, disputeWindowExpiresAt: MoreThan(new Date()) },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async getVendorHistory(vendorId: string): Promise<Payment[]> {
    return this.paymentsRepo.find({
      where: { vendorId },
      order: { createdAt: 'DESC' },
    });
  }

  async createServicePayment(
    serviceId: string,
    customerId: string,
  ): Promise<{ clientSecret: string; paymentId: string }> {
    const service = await this.additionalRepo.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Additional service not found');
    if (!service.approved) throw new BadRequestException('Service has not been approved by the customer');

    const request = await this.requestsRepo.findOne({ where: { id: service.serviceRequestId } });
    if (!request) throw new NotFoundException('Service request not found');
    // Any family member can pay for a shared household service — "same rights".
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    if (!relatedIds.includes(request.customerId)) throw new ForbiddenException();

    const existing = await this.paymentsRepo.findOne({
      where: { serviceRequestId: request.id, description: service.name, customerId: request.customerId },
    });
    if (existing) {
      return { clientSecret: existing.stripeClientSecret, paymentId: existing.id };
    }

    // Record the payment under the request's own owner, not whichever family member
    // triggered it, so the existing-payment lookup above stays consistent regardless
    // of which household member pays.
    return this.createAuthHold(
      request.id,
      request.customerId,
      request.vendorId,
      Number(service.price),
      service.name,
      PaymentType.ADDITIONAL_SERVICE,
    );
  }

  async getPaymentHistory(userId: string, role: 'customer' | 'vendor'): Promise<Payment[]> {
    if (role === 'customer') {
      const relatedIds = await this.usersService.getRelatedCustomerIds(userId);
      return this.paymentsRepo.find({ where: { customerId: In(relatedIds) }, order: { createdAt: 'DESC' } });
    }
    return this.paymentsRepo.find({ where: { vendorId: userId }, order: { createdAt: 'DESC' } });
  }

  // Was a delayed-capture trigger back when payments were held for 48h
  // before release. Both charging paths (chargeForCompletedService,
  // authorizePayment) now capture immediately, so there's nothing left to
  // capture on a timer — repurposed as a safety net that alerts admins
  // about any payment still stuck PENDING (the automatic attempt failed
  // AND the customer hasn't completed the "Pay Now" fallback) for longer
  // than a business day, rather than letting it silently sit forever.
  @Cron(CronExpression.EVERY_HOUR)
  async alertStalePendingPayments(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await this.paymentsRepo.find({
      where: {
        status: PaymentStatus.PENDING,
        createdAt: LessThan(cutoff),
        stalePaymentAlertSentAt: IsNull(),
      },
    });

    for (const payment of stale) {
      payment.stalePaymentAlertSentAt = new Date();
      await this.paymentsRepo.save(payment);
      await this.notificationsService.notifyAdmins(
        NotificationType.PAYMENT_COLLECTION_FAILED,
        'Payment Still Uncollected',
        `Payment for "${payment.description}" ($${payment.amount}) has been pending for over 24 hours — may need manual follow-up.`,
        { paymentId: payment.id },
      ).catch((err) => this.logger.warn(`Failed to notify admins about stale payment ${payment.id}: ${err.message}`));
    }

    if (stale.length > 0) {
      this.logger.warn(`Flagged ${stale.length} payment(s) stuck PENDING past 24h`);
    }
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<{ received: boolean }> {
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET', '');
    let event: Stripe.Event;

    if (webhookSecret && webhookSecret !== 'TODO_setup_webhook_at_stripe_dashboard_see_instructions_below') {
      try {
        event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      } catch (err) {
        this.logger.error(`Webhook signature verification failed: ${err.message}`);
        throw new BadRequestException('Invalid webhook signature');
      }
    } else {
      // No webhook secret configured — parse raw payload for dev/test
      event = JSON.parse(payload.toString()) as Stripe.Event;
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.paymentsRepo.update(
          { stripePaymentIntentId: pi.id },
          { status: PaymentStatus.SUCCEEDED, capturedAt: new Date() },
        );
        // Elite membership fees use the same PaymentIntent type but live in
        // their own table (see VendorMembershipPayment) — the synchronous
        // charge result in AdminService::setVendorPlan covers the common
        // case, this is the fallback/source-of-truth reconciliation, same
        // role the webhook already plays for customer payments above.
        await this.membershipPaymentsRepo.update(
          { stripePaymentIntentId: pi.id },
          { status: PaymentStatus.SUCCEEDED },
        );
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.paymentsRepo.update(
          { stripePaymentIntentId: pi.id },
          { status: PaymentStatus.FAILED },
        );
        await this.membershipPaymentsRepo.update(
          { stripePaymentIntentId: pi.id },
          {
            status: PaymentStatus.FAILED,
            failureReason: pi.last_payment_error?.message ?? null,
          },
        );
        break;
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        if (account.charges_enabled && account.details_submitted) {
          await this.usersService.markVendorStripeComplete(account.id);
        }
        break;
      }
    }

    return { received: true };
  }

  async getVendorStripeStatus(vendorId: string): Promise<{ connected: boolean; onboardingComplete: boolean }> {
    const { accountId, onboardingComplete } = await this.usersService.getCompanyStripeAccount(vendorId);

    if (!accountId) {
      return { connected: false, onboardingComplete: false };
    }

    // Already confirmed complete — skip the Stripe call
    if (onboardingComplete) {
      return { connected: true, onboardingComplete: true };
    }

    // Poll Stripe directly — webhooks can't reach a local/staging server
    try {
      const account = await this.stripe.accounts.retrieve(accountId);
      const complete = !!(account.charges_enabled && account.details_submitted);
      if (complete) {
        await this.usersService.markVendorStripeComplete(accountId);
      }
      return { connected: true, onboardingComplete: complete };
    } catch {
      return { connected: true, onboardingComplete: false };
    }
  }

  async recordDisputedPayment(stripePaymentIntentId: string): Promise<void> {
    if (!stripePaymentIntentId) return;
    await this.paymentsRepo.update(
      { stripePaymentIntentId },
      { status: PaymentStatus.DISPUTED },
    );
  }

  async createSetupIntent(userId: string): Promise<{ setupIntentClientSecret: string; ephemeralKeySecret: string; customerId: string }> {
    const customerId = await this.subscriptionsService.getOrCreateStripeCustomer(userId);

    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2024-04-10' },
    );
    // Redirect-based payment methods are disabled — the app is card-only today
    // with no deep-link/return-URL handling built, and Stripe requires a
    // return_url at confirmation for any redirect-capable method otherwise.
    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    return {
      setupIntentClientSecret: setupIntent.client_secret,
      ephemeralKeySecret: ephemeralKey.secret,
      customerId,
    };
  }

  async listPaymentMethods(userId: string): Promise<{ id: string; brand: string; last4: string; isDefault: boolean }[]> {
    const user = await this.usersService.findById(userId);
    if (!user.stripeCustomerId) return [];

    const [methods, customer] = await Promise.all([
      this.stripe.paymentMethods.list({ customer: user.stripeCustomerId, type: 'card' }),
      this.stripe.customers.retrieve(user.stripeCustomerId),
    ]);
    const defaultId = !('deleted' in customer)
      ? (customer.invoice_settings?.default_payment_method as string | null)
      : null;

    return methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'card',
      last4: pm.card?.last4 ?? '',
      isDefault: pm.id === defaultId,
    }));
  }

  async setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<{ success: boolean }> {
    const user = await this.usersService.findById(userId);
    if (!user.stripeCustomerId) throw new BadRequestException('No saved payment methods for this account');

    const methods = await this.listPaymentMethods(userId);
    if (!methods.some((m) => m.id === paymentMethodId)) {
      throw new ForbiddenException('That payment method does not belong to your account');
    }

    await this.stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Keep the household's active subscription (if any) on the same default card.
    const ownerId = await this.usersService.getEffectiveSubscriptionOwnerId(userId);
    const sub = await this.subscriptionsService.getActiveSubscription(ownerId);
    if (sub?.stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.update(sub.stripeSubscriptionId, { default_payment_method: paymentMethodId });
      } catch (err) {
        this.logger.warn(`Could not update subscription default payment method: ${err.message}`);
      }
    }

    return { success: true };
  }

  async removePaymentMethod(userId: string, paymentMethodId: string): Promise<{ success: boolean }> {
    const methods = await this.listPaymentMethods(userId);
    if (!methods.some((m) => m.id === paymentMethodId)) {
      throw new ForbiddenException('That payment method does not belong to your account');
    }
    await this.stripe.paymentMethods.detach(paymentMethodId);
    return { success: true };
  }

  // Charges a vendor's saved card off-session (admin-initiated, vendor not
  // present) — e.g. the Elite membership fee. Vendors reuse the same
  // User.stripeCustomerId + saved-card plumbing as customers; this is
  // unrelated to their separate Stripe Connect account (payout destination).
  async chargeVendorMembershipFee(
    vendorUserId: string,
    amount: number,
    description: string,
  ): Promise<{ status: 'succeeded' | 'failed'; paymentIntentId?: string; failureReason?: string }> {
    return this.chargeOffSession(vendorUserId, amount, description, 'Vendor membership charge');
  }

  // Flat off-session charge for a customer who cancels a request while the
  // vendor is already VENDOR_EN_ROUTE — the $25 late-cancellation fee has
  // been disclosed policy (customer-terms.md) since the app's earliest T&Cs,
  // this is the first place it's actually enforced rather than just shown.
  async chargeCustomerCancellationFee(
    customerUserId: string,
    amount: number,
    description: string,
  ): Promise<{ status: 'succeeded' | 'failed'; paymentIntentId?: string; failureReason?: string }> {
    return this.chargeOffSession(customerUserId, amount, description, 'Customer cancellation fee charge');
  }

  private async chargeOffSession(
    userId: string,
    amount: number,
    description: string,
    logContext: string,
  ): Promise<{ status: 'succeeded' | 'failed'; paymentIntentId?: string; failureReason?: string }> {
    const user = await this.usersService.findById(userId);
    const methods = user.stripeCustomerId ? await this.listPaymentMethods(userId) : [];
    const defaultMethod = methods.find((m) => m.isDefault) ?? methods[0];
    if (!defaultMethod) {
      throw new BadRequestException('No payment method on file');
    }

    try {
      const intent = await this.stripe.paymentIntents.create({
        customer: user.stripeCustomerId,
        payment_method: defaultMethod.id,
        amount: Math.round(amount * 100),
        currency: 'usd',
        off_session: true,
        confirm: true,
        description,
      });
      if (intent.status === 'succeeded') {
        return { status: 'succeeded', paymentIntentId: intent.id };
      }
      return { status: 'failed', paymentIntentId: intent.id, failureReason: `Unexpected status: ${intent.status}` };
    } catch (err: any) {
      // Off-session confirmations fail fast (rather than hang) when the card
      // requires interactive 3DS authentication — Stripe's documented
      // behavior. Treated the same as any other decline for now; the user
      // is notified to add/update a card via an on-session retry.
      this.logger.warn(`${logContext} failed for user ${userId}: ${err.message}`);
      return { status: 'failed', failureReason: err.message };
    }
  }
}
