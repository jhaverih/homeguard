import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all available subscription plans' })
  getPlans() {
    return this.service.getPlans();
  }

  @Get('my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my active subscription' })
  getMySubscription(@Request() req) {
    return this.service.getActiveSubscription(req.user.id);
  }

  @Post('subscribe/:planId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Subscribe to a plan' })
  subscribe(@Request() req, @Param('planId') planId: string) {
    return this.service.subscribe(req.user.id, planId);
  }
}
