import { Controller, Get, Patch, Delete, Param, Query, Body, UseGuards, Post } from '@nestjs/common';
import { VendorApplicationStatus } from '../vendor/entities/vendor-company.entity';
import { CertificationReviewStatus } from '../vendor/entities/vendor-certification.entity';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminLevelGuard } from '../common/guards/admin-level.guard';
import { MinAdminLevel } from '../common/decorators/min-admin-level.decorator';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
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

  @Get('customers/:id/activity')
  @ApiOperation({ summary: 'Get full activity history for a customer' })
  getCustomerActivity(@Param('id') id: string) {
    return this.service.getCustomerActivity(id);
  }

  @Delete('customers/:id')
  @MinAdminLevel(AdminLevel.SUPER_USER)
  @ApiOperation({ summary: 'Remove (deactivate) a customer' })
  removeCustomer(@Param('id') id: string) {
    return this.service.removeCustomer(id);
  }

  @Get('vendors')
  @ApiOperation({ summary: 'List all vendors' })
  getVendors() {
    return this.service.getVendors();
  }

  @Get('vendors/:id/activity')
  @ApiOperation({ summary: 'Get recent job and payment activity for a vendor' })
  getVendorActivity(@Param('id') id: string) {
    return this.service.getVendorActivity(id);
  }

  @Get('vendors/:id/kpi')
  @ApiOperation({ summary: 'Get vendor performance KPIs' })
  getVendorKpi(@Param('id') id: string) {
    return this.service.getVendorKpi(id);
  }

  @Patch('vendors/:id/approve')
  @MinAdminLevel(AdminLevel.SUPER_USER)
  @ApiOperation({ summary: 'Approve a vendor' })
  approveVendor(@Param('id') id: string) {
    return this.service.approveVendor(id);
  }

  @Delete('vendors/:id')
  @MinAdminLevel(AdminLevel.SUPER_USER)
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
  @MinAdminLevel(AdminLevel.SUPER_USER)
  @ApiOperation({ summary: 'Set vendor plan tier (STANDARD or ELITE) with optional expiry date' })
  setVendorPlan(
    @Param('id') id: string,
    @Body() body: { tier: 'STANDARD' | 'ELITE'; expiresAt?: string },
  ) {
    return this.service.setVendorPlan(id, body.tier, body.expiresAt);
  }

  @Post('vendors/downgrade-check')
  @MinAdminLevel(AdminLevel.SUPER_USER)
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

  @Get('team-users')
  @MinAdminLevel(AdminLevel.SUPER_USER)
  @ApiOperation({ summary: 'Super User: list all admin-portal users' })
  getTeamUsers() {
    return this.service.getTeamUsers();
  }

  @Post('team-users')
  @MinAdminLevel(AdminLevel.SUPER_USER)
  @ApiOperation({ summary: 'Super User: invite a new admin-portal user' })
  createTeamUser(
    @Body() body: { email: string; firstName: string; lastName: string; adminLevel: AdminLevel },
  ) {
    return this.service.createTeamUser(body);
  }

  @Patch('team-users/:id/level')
  @MinAdminLevel(AdminLevel.SUPER_USER)
  @ApiOperation({ summary: "Super User: change an admin-portal user's level" })
  updateTeamUserLevel(@Param('id') id: string, @Body() body: { adminLevel: AdminLevel }) {
    return this.service.updateTeamUserLevel(id, body.adminLevel);
  }

  @Delete('team-users/:id')
  @MinAdminLevel(AdminLevel.SUPER_USER)
  @ApiOperation({ summary: 'Super User: deactivate an admin-portal user' })
  removeTeamUser(@Param('id') id: string) {
    return this.service.removeTeamUser(id);
  }

  @Get('vendor-applications')
  @MinAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({ summary: 'Admin/Super User: review queue for vendor company applications' })
  getVendorApplications(@Query('status') status?: VendorApplicationStatus) {
    return this.service.getVendorApplications(status);
  }

  @Patch('vendor-applications/:id')
  @MinAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({ summary: 'Admin/Super User: approve/reject/request-info on a vendor company application' })
  reviewVendorApplication(
    @Param('id') id: string,
    @Body() body: { status: VendorApplicationStatus; reviewNotes?: string },
  ) {
    return this.service.reviewVendorApplication(id, body.status, body.reviewNotes);
  }

  @Get('vendor-certifications')
  @MinAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({ summary: 'Admin/Super User: review queue for individual trade certifications' })
  getVendorCertifications(@Query('status') status?: CertificationReviewStatus) {
    return this.service.getVendorCertifications(status);
  }

  @Patch('vendor-certifications/:id')
  @MinAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({ summary: 'Admin/Super User: approve/reject an individual trade certification' })
  reviewVendorCertification(
    @Param('id') id: string,
    @Body() body: { status: CertificationReviewStatus; reviewNotes?: string },
  ) {
    return this.service.reviewVendorCertification(id, body.status, body.reviewNotes);
  }

  @Post('capabilities')
  @MinAdminLevel(AdminLevel.SUPER_USER)
  @ApiOperation({ summary: 'Super User: add a vendor capability to the catalog' })
  createCapability(@Body() body: { name: string; requiredCertificationType: string }) {
    return this.service.createCapability(body);
  }

  @Patch('capabilities/:id')
  @MinAdminLevel(AdminLevel.ADMIN)
  @ApiOperation({ summary: 'Admin: edit or deactivate a vendor capability' })
  updateCapability(@Param('id') id: string, @Body() body: any) {
    return this.service.updateCapability(id, body);
  }
}
