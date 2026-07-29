import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { VendorAdminGuard } from '../common/guards/vendor-admin.guard';
import { VendorAdminOnly } from '../common/decorators/vendor-admin.decorator';
import { VendorService } from './vendor.service';
import { CertificationType } from './entities/vendor-capability.entity';
import { SetCapabilitiesDto } from './dto/set-capabilities.dto';

@ApiTags('Vendor Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, VendorAdminGuard)
@Roles(UserRole.VENDOR)
@Controller('vendor')
export class VendorController {
  constructor(private readonly service: VendorService) {}

  @Get('customers')
  @ApiOperation({ summary: 'Customers serviced by my company' })
  getCustomers(@Request() req) {
    return this.service.getCustomers(req.user.id);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Payments received/pending for my company' })
  getPayments(@Request() req) {
    return this.service.getPayments(req.user.id);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'Disputes for my company' })
  getDisputes(@Request() req) {
    return this.service.getDisputes(req.user.id);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'All jobs for my company, with assigned technician' })
  getJobs(@Request() req) {
    return this.service.getJobs(req.user.id);
  }

  @Get('jobs/:id/report')
  @ApiOperation({ summary: 'Inspection report + photos for one job' })
  getJobReport(@Request() req, @Param('id') id: string) {
    return this.service.getJobReport(req.user.id, id);
  }

  @Patch('jobs/:id/assign')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: manually assign a job to a technician' })
  assignJob(@Request() req, @Param('id') id: string, @Body() body: { technicianId: string }) {
    return this.service.assignJob(req.user.id, id, body.technicianId);
  }

  @Post('jobs/:id/auto-assign')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: auto-assign (load-balanced) a job to a technician' })
  autoAssignJob(@Request() req, @Param('id') id: string) {
    return this.service.autoAssignJob(req.user.id, id);
  }

  @Get('status')
  @ApiOperation({ summary: 'My company plan tier / assignment mode / application status' })
  getStatus(@Request() req) {
    return this.service.getStatus(req.user.id);
  }

  @Post('status/request-elite')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: request an Elite plan upgrade' })
  requestElite(@Request() req) {
    return this.service.requestElite(req.user.id);
  }

  @Post('status/retract-elite-request')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: retract a pending Elite plan request' })
  retractEliteRequest(@Request() req) {
    return this.service.retractEliteRequest(req.user.id);
  }

  @Patch('status/assignment-mode')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: set manual or round-robin job assignment' })
  setAssignmentMode(@Request() req, @Body() body: { mode: 'MANUAL' | 'ROUND_ROBIN' }) {
    return this.service.setAssignmentMode(req.user.id, body.mode);
  }

  @Get('company')
  @ApiOperation({ summary: 'My company profile' })
  getCompany(@Request() req) {
    return this.service.getCompany(req.user.id);
  }

  @Patch('company')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: update company name/logo/service area' })
  updateCompany(@Request() req, @Body() body: { name?: string; logoKey?: string; serviceCounties?: string[] }) {
    return this.service.updateCompany(req.user.id, body);
  }

  @Get('counties')
  @ApiOperation({ summary: 'Counties currently selectable for service-area coverage, grouped by state' })
  getCounties() {
    return this.service.getSelectableCounties();
  }

  @Get('team')
  @ApiOperation({ summary: 'My company team roster' })
  getTeam(@Request() req) {
    return this.service.getTeam(req.user.id);
  }

  @Post('team')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: invite a new technician' })
  createTechnician(@Request() req, @Body() body: { email: string; firstName: string; lastName: string; avatarUrl?: string }) {
    return this.service.createTechnician(req.user.id, body);
  }

  @Patch('team/:id')
  @VendorAdminOnly()
  @ApiOperation({ summary: "Vendor Admin: edit a team member's name/photo (including their own)" })
  updateTeamMember(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { firstName?: string; lastName?: string; avatarUrl?: string },
  ) {
    return this.service.updateTeamMember(req.user.id, id, body);
  }

  @Delete('team/:id')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: remove a technician from the company' })
  removeTeamMember(@Request() req, @Param('id') id: string) {
    return this.service.removeTeamMember(req.user.id, id);
  }

  @Get('customers/:id/history')
  @ApiOperation({ summary: 'Elite-gated: full history for one customer' })
  getCustomerHistory(@Request() req, @Param('id') id: string) {
    return this.service.getCustomerHistory(req.user.id, id);
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Full capability catalog, with my acknowledgment status per capability' })
  getCapabilities(@Request() req) {
    return this.service.getCapabilities(req.user.id);
  }

  @Get('me/capabilities')
  @ApiOperation({ summary: 'My own selected capabilities' })
  getMyCapabilities(@Request() req) {
    return this.service.getMyCapabilities(req.user.id);
  }

  @Patch('me/capabilities')
  @ApiOperation({ summary: 'Set my own selected capabilities' })
  setMyCapabilities(@Request() req, @Body() body: SetCapabilitiesDto) {
    return this.service.setMyCapabilities(req.user.id, body.capabilityIds);
  }

  @Post('me/capabilities/:capabilityId/acknowledge')
  @ApiOperation({ summary: 'Confirm I have read a capability\'s training material' })
  acknowledgeCapability(@Request() req, @Param('capabilityId') capabilityId: string) {
    return this.service.acknowledgeCapability(req.user.id, capabilityId);
  }

  @Get('me/certifications')
  @VendorAdminOnly()
  @ApiOperation({ summary: "Vendor Admin: every certification submitted by my team, with a viewable document link" })
  getMyCertifications(@Request() req) {
    return this.service.getMyCertifications(req.user.id);
  }

  @Post('me/certifications')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: submit a trade certification for review' })
  submitCertification(
    @Request() req,
    @Body() body: {
      certificationType: CertificationType; licenseNumber: string; issuingState?: string;
      expirationDate: string; documentKey: string;
    },
  ) {
    return this.service.submitCertification(req.user.id, body);
  }

  @Patch('me/certifications/:id')
  @VendorAdminOnly()
  @ApiOperation({ summary: "Vendor Admin: revise a certification submitted by anyone on my team" })
  updateCertification(
    @Request() req,
    @Param('id') id: string,
    @Body() body: {
      certificationType?: CertificationType; licenseNumber?: string; issuingState?: string;
      expirationDate?: string; documentKey?: string;
    },
  ) {
    return this.service.updateCertification(req.user.id, id, body);
  }

  @Get('application')
  @ApiOperation({ summary: 'My company application/document status' })
  getApplication(@Request() req) {
    return this.service.getApplication(req.user.id);
  }

  @Post('application')
  @VendorAdminOnly()
  @ApiOperation({ summary: 'Vendor Admin: submit/update company verification documents' })
  submitApplication(
    @Request() req,
    @Body() body: {
      ein?: string; stateRegistrationDocKey?: string;
      coiDocumentKey?: string; coiExpirationDate?: string;
    },
  ) {
    return this.service.submitApplication(req.user.id, body);
  }
}
