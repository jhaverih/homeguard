import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
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

  @Patch('plans/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a subscription plan (admin only)' })
  updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.service.updatePlan(id, body);
  }
}
