import { Controller, Get, Post, Patch, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { CertificationType } from './entities/vendor-capability.entity';
import { VendorOnboardingService } from './vendor-onboarding.service';

// The only vendor endpoints open before a company is approved. The app uses
// all of them; the vendor portal only calls GET status.
@ApiTags('Vendor Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@Controller('vendor/onboarding')
export class VendorOnboardingController {
  constructor(private readonly service: VendorOnboardingService) {}

  @Get('status')
  @ApiOperation({ summary: 'Application status and open items only (vendor portal)' })
  getStatus(@Request() req) {
    return this.service.getStatus(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Full application: status, checklist and what is on file' })
  getApplication(@Request() req) {
    return this.service.getApplication(req.user.id);
  }

  @Patch('company')
  @ApiOperation({ summary: 'Company name, EIN and business address' })
  updateCompany(@Request() req, @Body() body: { name?: string; ein?: string; address?: string; city?: string; state?: string; zipCode?: string }) {
    return this.service.updateCompany(req.user.id, body);
  }

  @Patch('photo')
  @ApiOperation({ summary: 'Set the applicant\'s profile photo from an uploaded key' })
  setPhoto(@Request() req, @Body() body: { avatarKey: string }) {
    return this.service.setPhoto(req.user.id, body.avatarKey);
  }

  @Patch('documents')
  @ApiOperation({ summary: 'State registration and certificate of insurance' })
  updateDocuments(@Request() req, @Body() body: { stateRegistrationDocKey?: string; coiDocumentKey?: string; coiExpirationDate?: string }) {
    return this.service.updateDocuments(req.user.id, body);
  }

  @Get('services')
  @ApiOperation({ summary: 'Promoted services offered at sign-up, with my selections' })
  getServiceOptions(@Request() req) {
    return this.service.getServiceOptions(req.user.id);
  }

  @Put('services')
  @ApiOperation({ summary: 'Set the services I offer' })
  setServices(@Request() req, @Body() body: { capabilityIds: string[] }) {
    return this.service.setServices(req.user.id, body.capabilityIds);
  }

  @Post('services/:capabilityId/acknowledge')
  @ApiOperation({ summary: 'Confirm I have read a service\'s training material' })
  acknowledgeService(@Request() req, @Param('capabilityId') capabilityId: string) {
    return this.service.acknowledgeService(req.user.id, capabilityId);
  }

  @Post('licenses')
  @ApiOperation({ summary: 'Add a trade license' })
  addLicense(
    @Request() req,
    @Body() body: { certificationType: CertificationType; licenseNumber: string; issuingState: string; expirationDate: string; documentKey: string },
  ) {
    return this.service.addLicense(req.user.id, body);
  }

  @Post('licenses/upload')
  @ApiOperation({ summary: 'Upload a trade license; the license reader fills in its details in the background' })
  uploadLicense(@Request() req, @Body() body: { certificationType: CertificationType; documentKey: string }) {
    return this.service.uploadLicense(req.user.id, body);
  }

  @Delete('licenses/:id')
  @ApiOperation({ summary: 'Remove a license that has not been approved' })
  removeLicense(@Request() req, @Param('id') id: string) {
    return this.service.removeLicense(req.user.id, id);
  }

  @Get('counties')
  @ApiOperation({ summary: 'Counties open for service-area selection, grouped by state' })
  getCountyOptions() {
    return this.service.getCountyOptions();
  }

  @Put('counties')
  @ApiOperation({ summary: 'Set the counties my company serves' })
  setCounties(@Request() req, @Body() body: { serviceCounties: string[] }) {
    return this.service.setCounties(req.user.id, body.serviceCounties);
  }

  @Post('background-check')
  @ApiOperation({ summary: 'Sign the background check and drug test responsibility statement' })
  signBackgroundCheck(@Request() req, @Body() body: { signerName: string; signerTitle: string; agreed: boolean }) {
    return this.service.signBackgroundCheck(req.user.id, body);
  }

  // Renewal — the only vendor endpoints open while an approved company is
  // locked out for an expired credential.
  @Get('credentials')
  @ApiOperation({ summary: 'Insurance and license expiry status, and whether access is locked' })
  getCredentials(@Request() req) {
    return this.service.getCredentials(req.user.id);
  }

  @Post('credentials/insurance')
  @ApiOperation({ summary: 'Upload a renewed certificate of insurance (company admin)' })
  renewInsurance(@Request() req, @Body() body: { coiDocumentKey: string; coiExpirationDate: string }) {
    return this.service.renewInsurance(req.user.id, body);
  }

  @Post('credentials/licenses/:id/upload')
  @ApiOperation({ summary: 'Upload a renewed trade license; it is read automatically, then verified' })
  renewLicenseUpload(@Request() req, @Param('id') id: string, @Body() body: { documentKey: string }) {
    return this.service.renewLicenseUpload(req.user.id, id, body);
  }

  @Post('credentials/licenses/:id')
  @ApiOperation({ summary: 'Upload a renewed trade license (goes back to admin review)' })
  renewLicense(@Request() req, @Param('id') id: string, @Body() body: { licenseNumber?: string; expirationDate: string; documentKey: string }) {
    return this.service.renewLicense(req.user.id, id, body);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit the completed application for review' })
  submit(@Request() req) {
    return this.service.submit(req.user.id);
  }
}
