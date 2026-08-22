import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { IotAnalyticsService } from './iot-analytics.service';
import { FindingStatus } from './entities/analytics-finding.entity';

// Route paths are UNCHANGED from the old HvacAnalyticsController — the
// mobile Analytics screen and admin Analytics page call these exact URLs,
// and this rewrite is backend-architecture-only.
@ApiTags('HVAC Analytics')
@Controller()
export class IotAnalyticsController {
  constructor(private readonly service: IotAnalyticsService) {}

  // ── Customer (HO app) ──────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('hvac-analytics/me')
  @ApiOperation({ summary: "My home's HVAC analytics — findings, sensor coverage, tier-gated" })
  getMine(@Request() req: any) {
    return this.service.getMyAnalytics(req.user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('hvac-analytics/findings/:id/resolve')
  @ApiOperation({ summary: '"I Fixed It" — mark a finding resolved' })
  resolveFinding(@Request() req: any, @Param('id') id: string) {
    return this.service.resolveFinding(req.user.id, id, FindingStatus.RESOLVED);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('hvac-analytics/findings/:id/dismiss')
  @ApiOperation({ summary: 'Dismiss a finding' })
  dismissFinding(@Request() req: any, @Param('id') id: string) {
    return this.service.resolveFinding(req.user.id, id, FindingStatus.DISMISSED);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('hvac-analytics/findings/:id/snooze')
  @ApiOperation({ summary: 'Silence repeat alerts for a still-active finding for 30/60/240 minutes' })
  snoozeFinding(@Request() req: any, @Param('id') id: string, @Body('minutes') minutes: number) {
    return this.service.snoozeFinding(req.user.id, id, minutes);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('hvac-analytics/request-contractor-visit')
  @ApiOperation({ summary: 'Request an Attenteve HVAC contractor visit' })
  requestContractorVisit(@Request() req: any) {
    return this.service.requestContractorVisit(req.user.id);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/hvac-analytics/customers')
  @ApiOperation({ summary: 'Search customers by name/email for the analytics picker' })
  searchCustomers(@Query('q') q: string) {
    return this.service.searchCustomers(q);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/hvac-analytics')
  @ApiOperation({ summary: "A customer's full HVAC analytics — findings, time series, rule availability" })
  getAdminAnalytics(@Query('customerId') customerId: string) {
    return this.service.getAdminAnalytics(customerId);
  }
}
