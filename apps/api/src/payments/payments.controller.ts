import {
  Controller, Post, Get, Patch, Param, Body, Headers, RawBodyRequest,
  UseGuards, Request, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Post('vendor/onboarding')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vendor: get Stripe Connect onboarding link' })
  getOnboardingLink(@Request() req) {
    return this.service.createVendorOnboardingLink(req.user.id);
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

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook endpoint' })
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    // Route subscription events to SubscriptionsService
    let parsed: any;
    try { parsed = JSON.parse(req.rawBody.toString()); } catch { parsed = {}; }

    const subEvents = ['invoice.payment_succeeded', 'invoice.payment_failed', 'customer.subscription.deleted'];
    if (subEvents.includes(parsed?.type)) {
      return this.subscriptionsService.handleSubscriptionWebhook(parsed);
    }

    return this.service.handleWebhook(req.rawBody, sig);
  }
}
