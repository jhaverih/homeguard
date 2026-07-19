import {
  Controller, Post, Get, Patch, Delete, Param, Body, Headers, RawBodyRequest,
  UseGuards, Request, Req, HttpCode, HttpStatus, Header, Inject, forwardRef,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MarketplaceService } from '../marketplace/marketplace.service';

const ONBOARDING_HTML = (title: string, icon: string, body: string) =>
  `<!DOCTYPE html><html><head><title>HomeGuard</title>
   <meta name="viewport" content="width=device-width,initial-scale=1">
   <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;padding:60px 24px;background:#f8f9fa;margin:0}
   h1{font-size:26px;margin-bottom:12px}p{color:#555;font-size:16px;line-height:1.6}</style>
   </head><body><h1>${icon} ${title}</h1><p>${body}</p></body></html>`;

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => MarketplaceService))
    private readonly marketplaceService: MarketplaceService,
  ) {}

  @Post('vendor/onboarding')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vendor: get Stripe Connect onboarding link' })
  getOnboardingLink(@Request() req) {
    return this.service.createVendorOnboardingLink(req.user.id);
  }

  @Get('vendor/stripe-status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vendor: check Stripe Connect onboarding status' })
  getStripeStatus(@Request() req) {
    return this.service.getVendorStripeStatus(req.user.id);
  }

  @Get('onboarding/complete')
  @Header('Content-Type', 'text/html')
  @ApiOperation({ summary: 'Stripe Connect onboarding return page' })
  onboardingComplete() {
    return ONBOARDING_HTML(
      'Payout Account Connected!',
      '✓',
      'Your Stripe account is set up. You can now close this window and return to the HomeGuard app.',
    );
  }

  @Get('onboarding/refresh')
  @Header('Content-Type', 'text/html')
  @ApiOperation({ summary: 'Stripe Connect onboarding refresh page' })
  onboardingRefresh() {
    return ONBOARDING_HTML(
      'Session Expired',
      '↩',
      'Please return to the HomeGuard app and tap <strong>Set Up Payouts</strong> again to continue.',
    );
  }

  @Get('pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: get pending payments requiring authorization' })
  getPending(@Request() req) {
    return this.service.getPendingPayments(req.user.id);
  }

  @Patch(':id/authorize')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: confirm payment was authorized via payment sheet' })
  authorize(@Param('id') id: string, @Request() req) {
    return this.service.authorizePayment(id, req.user.id);
  }

  @Get('vendor/history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vendor: get payment history with fee breakdown' })
  getVendorHistory(@Request() req) {
    return this.service.getVendorHistory(req.user.id);
  }

  @Get('history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get payment history' })
  getHistory(@Request() req) {
    const role = req.user.activeRole === 'VENDOR' ? 'vendor' : 'customer';
    return this.service.getPaymentHistory(req.user.id, role);
  }

  @Post('setup-intent')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: create a SetupIntent to save a new card' })
  createSetupIntent(@Request() req) {
    return this.service.createSetupIntent(req.user.id);
  }

  @Get('methods')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: list saved payment methods' })
  listPaymentMethods(@Request() req) {
    return this.service.listPaymentMethods(req.user.id);
  }

  @Patch('methods/:id/default')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: set the default payment method' })
  setDefaultPaymentMethod(@Request() req, @Param('id') id: string) {
    return this.service.setDefaultPaymentMethod(req.user.id, id);
  }

  @Delete('methods/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: remove a saved payment method' })
  removePaymentMethod(@Request() req, @Param('id') id: string) {
    return this.service.removePaymentMethod(req.user.id, id);
  }

  @Post('service/:serviceId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: create a payment intent for an approved additional service' })
  createServicePayment(@Param('serviceId') serviceId: string, @Request() req) {
    return this.service.createServicePayment(serviceId, req.user.id);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    let parsed: any;
    try { parsed = JSON.parse(req.rawBody.toString()); } catch { parsed = {}; }

    // Both handlers independently no-op if the event's stripeSubscriptionId
    // isn't theirs (a plain repo lookup that finds nothing) — simpler and
    // more robust than metadata-based routing, and each subscription type's
    // webhook logic stays fully encapsulated in its own service.
    const subEvents = ['invoice.payment_succeeded', 'invoice.payment_failed', 'customer.subscription.deleted'];
    if (subEvents.includes(parsed?.type)) {
      await this.subscriptionsService.handleSubscriptionWebhook(parsed);
      await this.marketplaceService.handleSubscriptionWebhook(parsed);
      return;
    }

    return this.service.handleWebhook(req.rawBody, sig);
  }
}
