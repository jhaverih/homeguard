import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminLevelGuard } from '../common/guards/admin-level.guard';
import { MinAdminLevel } from '../common/decorators/min-admin-level.decorator';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { SubscriptionsService } from './subscriptions.service';
import { SubscribeDto } from './dto/subscribe.dto';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get('plans')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get the subscription plans this user can buy (launch tiers only, unless a preview tester)' })
  getPlans(@Request() req) {
    return this.service.getPlans(req.user?.email);
  }

  @Get('features')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Which not-yet-launched homeowner features this user can see' })
  getFeatures(@Request() req) {
    return this.service.getLaunchFeatures(req.user.id, req.user.email);
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
  @ApiOperation({ summary: 'Subscribe to a plan — requires acceptedTerms: true on a customer\'s first subscription' })
  subscribe(@Request() req, @Param('planId') planId: string, @Body() body: SubscribeDto) {
    return this.service.subscribe(req.user.id, planId, body.acceptedTerms ?? false, req.user.email);
  }

  @Post('cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancel my active subscription' })
  cancel(@Request() req) {
    return this.service.cancelSubscription(req.user.id);
  }

  @Post('change/:planId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change my subscription plan' })
  changePlan(@Request() req, @Param('planId') planId: string) {
    return this.service.changePlan(req.user.id, planId, req.user.email);
  }

  @Post('reprice')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Recompute my CarePlus surcharge from my current home characteristics' })
  reprice(@Request() req) {
    return this.service.repriceCarePlus(req.user.id);
  }

  @Patch('plans/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({ summary: 'Update a subscription plan (admin only)' })
  updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.service.updatePlan(id, body);
  }
}
