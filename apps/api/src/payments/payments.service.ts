import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from '../common/enums/role.enum';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

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
      const account = await this.stripe.accounts.create({
        type: 'express',
        email: vendor.email,
        metadata: { vendorId },
      });
      accountId = account.id;
      await this.usersService.updateProfile(vendorId, {
        vendorProfile: { ...vendor.vendorProfile, stripeConnectAccountId: accountId } as any,
      });
    }

    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${this.configService.get('API_URL')}/payments/onboarding/refresh`,
      return_url: `${this.configService.get('API_URL')}/payments/onboarding/complete`,
      type: 'account_onboarding',
    });

    return { url: link.url };
  }

  async createPaymentIntent(
    serviceRequestId: string,
    customerId: string,
    vendorId: string,
    amount: number,
  ): Promise<{ clientSecret: string; paymentId: string }> {
    const vendor = await this.usersService.findById(vendorId);
    const vendorAccountId = vendor.vendorProfile?.stripeConnectAccountId;
    if (!vendorAccountId) throw new BadRequestException('Vendor has not completed Stripe onboarding');

    const platformFeePercent = Number(this.configService.get('PLATFORM_FEE_PERCENT', '3'));
    const amountInCents = Math.round(amount * 100);
    const platformFeeInCents = Math.round(amountInCents * (platformFeePercent / 100));

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      application_fee_amount: platformFeeInCents,
      transfer_data: { destination: vendorAccountId },
      metadata: { serviceRequestId, customerId, vendorId },
    });

    const payment = this.paymentsRepo.create({
      serviceRequestId,
      customerId,
      vendorId,
      amount,
      platformFee: platformFeeInCents / 100,
      vendorAmount: (amountInCents - platformFeeInCents) / 100,
      currency: 'usd',
      status: PaymentStatus.PENDING,
      stripePaymentIntentId: paymentIntent.id,
    });
    const savedPayment = await this.paymentsRepo.save(payment);

    return { clientSecret: paymentIntent.client_secret, paymentId: savedPayment.id };
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const payment = await this.paymentsRepo.findOne({
        where: { stripePaymentIntentId: pi.id },
      });
      if (payment) {
        payment.status = PaymentStatus.SUCCEEDED;
        await this.paymentsRepo.save(payment);

        await this.notificationsService.notifyUser(
          payment.customerId,
          NotificationType.PAYMENT_PROCESSED,
          'Payment Successful',
          `Your payment of $${payment.amount} was processed successfully.`,
          { paymentId: payment.id },
        );
        await this.notificationsService.notifyUser(
          payment.vendorId,
          NotificationType.PAYMENT_PROCESSED,
          'Payment Received',
          `You received $${payment.vendorAmount} for a completed job.`,
          { paymentId: payment.id },
        );
      }
    }
  }

  async getPaymentHistory(userId: string, role: 'customer' | 'vendor'): Promise<Payment[]> {
    const where = role === 'customer' ? { customerId: userId } : { vendorId: userId };
    return this.paymentsRepo.find({ where, order: { createdAt: 'DESC' } });
  }
}
