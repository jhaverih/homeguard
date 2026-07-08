import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import Stripe from 'stripe';
import { Payment } from './entities/payment.entity';
import { PaymentStatus, PaymentType } from '../common/enums/role.enum';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

const DISPUTE_WINDOW_HOURS = 48;

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentsRepo: Repository<Payment>,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY', ''), {
      apiVersion: '2024-04-10',
    });
  }

  async createVendorOnboardingLink(vendorId: string): Promise<{ url: string }> {
    const vendor = await this.usersService.findById(vendorId);
    let accountId = vendor.vendorProfile?.stripeConnectAccountId;

    if (!accountId) {
      try {
        const account = await this.stripe.accounts.create({
          type: 'express',
          email: vendor.email,
          metadata: { vendorId },
        });
        accountId = account.id;
        await this.usersService.updateProfile(vendorId, {
          vendorProfile: { ...vendor.vendorProfile, stripeConnectAccountId: accountId } as any,
        });
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
    const vendor = await this.usersService.findById(vendorId);
    const vendorAccountId = vendor.vendorProfile?.stripeConnectAccountId;

    const platformFeePercent = Number(this.configService.get('PLATFORM_FEE_PERCENT', '15'));
    const amountInCents = Math.round(amount * 100);
    const platformFeeInCents = Math.round(amountInCents * (platformFeePercent / 100));
    const stripeFee = Math.round(amountInCents * 0.029 + 30);
    const vendorAmountInCents = amountInCents - platformFeeInCents - stripeFee;

    const intentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: 'usd',
      capture_method: 'manual',
      metadata: { serviceRequestId, customerId, vendorId, paymentType: type },
      description,
    };

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

  async authorizePayment(paymentId: string, customerId: string): Promise<Payment> {
    const payment = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.customerId !== customerId) throw new ForbiddenException();
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not in a pending state');
    }

    const pi = await this.stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
    if (pi.status !== 'requires_capture') {
      throw new BadRequestException('Payment has not been authorized yet');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + DISPUTE_WINDOW_HOURS);

    payment.status = PaymentStatus.AUTHORIZED;
    payment.disputeWindowExpiresAt = expiresAt;
    const saved = await this.paymentsRepo.save(payment);

    await this.notificationsService.notifyUser(
      customerId,
      NotificationType.PAYMENT_PROCESSED,
      'Payment Authorized',
      `$${payment.amount} authorized. If no dispute is raised, it will be released in ${DISPUTE_WINDOW_HOURS} hours.`,
      { paymentId: saved.id },
    );

    return saved;
  }

  async getPendingPayments(customerId: string): Promise<Payment[]> {
    return this.paymentsRepo.find({
      where: { customerId, status: In([PaymentStatus.PENDING, PaymentStatus.AUTHORIZED]) },
      order: { createdAt: 'DESC' },
    });
  }

  async getVendorHistory(vendorId: string): Promise<Payment[]> {
    return this.paymentsRepo.find({
      where: { vendorId },
      order: { createdAt: 'DESC' },
    });
  }

  async getPaymentHistory(userId: string, role: 'customer' | 'vendor'): Promise<Payment[]> {
    const where = role === 'customer' ? { customerId: userId } : { vendorId: userId };
    return this.paymentsRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoCaptureExpiredHolds(): Promise<void> {
    const expired = await this.paymentsRepo.find({
      where: {
        status: PaymentStatus.AUTHORIZED,
        disputeWindowExpiresAt: LessThan(new Date()),
      },
    });

    for (const payment of expired) {
      try {
        await this.stripe.paymentIntents.capture(payment.stripePaymentIntentId);
        payment.status = PaymentStatus.SUCCEEDED;
        payment.capturedAt = new Date();
        await this.paymentsRepo.save(payment);

        await this.notificationsService.notifyUser(
          payment.customerId,
          NotificationType.PAYMENT_PROCESSED,
          'Payment Processed',
          `Your payment of $${payment.amount} for "${payment.description}" has been processed.`,
          { paymentId: payment.id },
        );

        if (payment.vendorId) {
          await this.notificationsService.notifyUser(
            payment.vendorId,
            NotificationType.PAYMENT_PROCESSED,
            'Payment Released',
            `Payment of $${payment.vendorAmount} for "${payment.description}" has been released.`,
            { paymentId: payment.id },
          );
        }
        this.logger.log(`Auto-captured payment ${payment.id}`);
      } catch (err) {
        this.logger.error(`Auto-capture failed for payment ${payment.id}: ${err.message}`);
      }
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
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.paymentsRepo.update(
          { stripePaymentIntentId: pi.id },
          { status: PaymentStatus.FAILED },
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
    const vendor = await this.usersService.findById(vendorId);
    const accountId = vendor.vendorProfile?.stripeConnectAccountId;

    if (!accountId) {
      return { connected: false, onboardingComplete: false };
    }

    // Already confirmed complete — skip the Stripe call
    if (vendor.vendorProfile?.stripeOnboardingComplete) {
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
}
