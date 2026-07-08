import { Controller, Get, Patch, Delete, Param, Query, Body, UseGuards, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform dashboard statistics' })
  getStats() {
    return this.service.getStats();
  }

  @Get('customers')
  @ApiOperation({ summary: 'List all customers' })
  getCustomers() {
    return this.service.getCustomers();
  }

  @Get('vendors')
  @ApiOperation({ summary: 'List all vendors' })
  getVendors() {
    return this.service.getVendors();
  }

  @Get('vendors/:id/kpi')
  @ApiOperation({ summary: 'Get vendor performance KPIs' })
  getVendorKpi(@Param('id') id: string) {
    return this.service.getVendorKpi(id);
  }

  @Patch('vendors/:id/approve')
  @ApiOperation({ summary: 'Approve a vendor' })
  approveVendor(@Param('id') id: string) {
    return this.service.approveVendor(id);
  }

  @Delete('vendors/:id')
  @ApiOperation({ summary: 'Remove (deactivate) a vendor' })
  removeVendor(@Param('id') id: string) {
    return this.service.removeVendor(id);
  }

  @Get('schedule')
  @ApiOperation({ summary: 'Get all scheduled visits (calendar view)' })
  getSchedule(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.service.getSchedule(
      year ? parseInt(year, 10) : undefined,
      month !== undefined ? parseInt(month, 10) : undefined,
    );
  }

  @Patch('vendors/:id/plan')
  @ApiOperation({ summary: 'Set vendor plan tier (STANDARD or ELITE) with optional expiry date' })
  setVendorPlan(
    @Param('id') id: string,
    @Body() body: { tier: 'STANDARD' | 'ELITE'; expiresAt?: string },
  ) {
    return this.service.setVendorPlan(id, body.tier, body.expiresAt);
  }

  @Post('vendors/downgrade-check')
  @ApiOperation({ summary: 'Manually trigger downgrade check for expired Elite plans' })
  runDowngradeCheck() {
    return this.service.runVendorDowngradeCheck();
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get all monitoring events with customer info' })
  getAlerts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getAlerts(Number(page) || 1, Number(limit) || 50);
  }
}
