import {
  Controller, Post, Get, Body, Headers, RawBodyRequest,
  UseGuards, Request, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post('vendor/onboarding')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Vendor: get Stripe Connect onboarding link' })
  getOnboardingLink(@Request() req) {
    return this.service.createVendorOnboardingLink(req.user.id);
  }

  @Post('create-intent')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: create payment intent for a service' })
  createIntent(@Request() req, @Body() body: { serviceRequestId: string; vendorId: string; amount: number }) {
    return this.service.createPaymentIntent(
      body.serviceRequestId, req.user.id, body.vendorId, body.amount,
    );
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
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    return this.service.handleWebhook(req.rawBody, sig);
  }
}
