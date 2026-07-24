import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminLevelGuard } from '../common/guards/admin-level.guard';
import { MinAdminLevel } from '../common/decorators/min-admin-level.decorator';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { MarketplaceService } from './marketplace.service';
import { QuoteHouseCleaningDto } from './dto/quote-house-cleaning.dto';
import {
  QuoteLawncareDto, SubscribeLawncarePackageDto, SubscribeLawncareServiceDto, BookLawncareServiceDto, UpsertLawncarePropertyProfileDto,
} from './dto/quote-lawncare.dto';
import {
  QuotePestDto, SubscribePestPackageDto, BookPestServiceDto, UpsertPestPropertyProfileDto,
} from './dto/quote-pest.dto';
import { IsDateString } from 'class-validator';

class BookOneTimeCleaningDto extends QuoteHouseCleaningDto {
  @IsDateString()
  preferredDate: string;
}

class SubscribeHouseCleaningDto extends QuoteHouseCleaningDto {
  @IsDateString()
  preferredVisitDate: string;
}

@ApiTags('Marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  @Get('house-cleaning/config')
  @ApiOperation({ summary: 'Cleaning plans, room units, condition multipliers, and frequency discounts. Public callers always get active-only; ?all=true (used by the admin Marketplace page) also includes disabled rows, since those otherwise become invisible/impossible to re-enable once turned off.' })
  getConfig(@Query('all') all?: string) {
    return this.service.getConfig(all === 'true');
  }

  @Get('house-cleaning/property-profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Customer: fetch their saved House Cleaning room configuration (updated automatically after each subscribe/booking)" })
  getHouseCleaningPropertyProfile(@Request() req) {
    return this.service.getHouseCleaningPropertyProfile(req.user.id);
  }

  @Post('house-cleaning/quote')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: compute a House Cleaning price before committing' })
  quote(@Body() dto: QuoteHouseCleaningDto) {
    return this.service.quote(dto);
  }

  @Post('house-cleaning/subscribe')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: subscribe to a recurring House Cleaning plan (Standard/Deep)' })
  subscribe(@Body() dto: SubscribeHouseCleaningDto, @Request() req) {
    return this.service.subscribe(req.user.id, dto);
  }

  @Post('house-cleaning/one-time')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: book a one-time cleaning (Move-Out, or a single Standard/Deep visit)' })
  bookOneTime(@Body() dto: BookOneTimeCleaningDto, @Request() req) {
    return this.service.bookOneTimeCleaning(req.user.id, dto);
  }

  @Patch('house-cleaning/plans/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a cleaning plan (cost/retail per unit, allowed frequencies, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updatePlan(@Param('id') id: string, @Body() data: any) {
    return this.service.updateCleaningPlan(id, data);
  }

  @Patch('house-cleaning/room-units/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a room unit (Base Cleaning Unit weight, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateRoomUnit(@Param('id') id: string, @Body() data: any) {
    return this.service.updateRoomUnit(id, data);
  }

  @Patch('house-cleaning/conditions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a condition multiplier (enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateCondition(@Param('id') id: string, @Body() data: any) {
    return this.service.updateConditionMultiplier(id, data);
  }

  @Patch('house-cleaning/add-ons/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update an add-on (pricing, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateAddOn(@Param('id') id: string, @Body() data: any) {
    return this.service.updateAddOn(id, data);
  }

  @Patch('house-cleaning/frequency-discounts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a frequency discount (%, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateFrequencyDiscount(@Param('id') id: string, @Body() data: any) {
    return this.service.updateFrequencyDiscount(id, data);
  }

  @Get('lawncare/config')
  @ApiOperation({ summary: 'Lawncare services, subscription packages, and property-detail fields. Public callers always get active-only; ?all=true (used by the admin Marketplace page) also includes disabled rows.' })
  getLawncareConfig(@Query('all') all?: string) {
    return this.service.getLawncareConfig(all === 'true');
  }

  @Get('lawncare/property-profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: fetch their saved Lawncare property profile (lot size, shrub count, etc.)' })
  getLawncarePropertyProfile(@Request() req) {
    return this.service.getLawncarePropertyProfile(req.user.id);
  }

  @Put('lawncare/property-profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: create/update their Lawncare property profile — captured once, reused for every package/service price' })
  upsertLawncarePropertyProfile(@Body() dto: UpsertLawncarePropertyProfileDto, @Request() req) {
    return this.service.upsertLawncarePropertyProfile(req.user.id, dto);
  }

  @Post('lawncare/quote')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: compute a Lawncare price before committing (package computed from composition + property profile, or a single service)' })
  quoteLawncare(@Body() dto: QuoteLawncareDto, @Request() req) {
    return this.service.quoteLawncare(req.user.id, dto);
  }

  @Post('lawncare/subscribe')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: subscribe to a Lawncare package (billing only, no auto-scheduled visits)' })
  subscribeLawncarePackage(@Body() dto: SubscribeLawncarePackageDto, @Request() req) {
    return this.service.subscribeLawncarePackage(req.user.id, dto);
  }

  @Post('lawncare/service-subscribe')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: subscribe to a standalone Lawncare service at a recurring frequency (e.g. Lawn Mowing Weekly/Biweekly) — billing only, no auto-scheduled visits' })
  subscribeLawncareService(@Body() dto: SubscribeLawncareServiceDto, @Request() req) {
    return this.service.subscribeLawncareService(req.user.id, dto);
  }

  @Post('lawncare/book')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: book a single on-demand Lawncare service' })
  bookLawncareService(@Body() dto: BookLawncareServiceDto, @Request() req) {
    return this.service.bookLawncareService(req.user.id, dto);
  }

  @Patch('lawncare/services/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a lawncare service (pricing, volume discount, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateLawncareService(@Param('id') id: string, @Body() data: any) {
    return this.service.updateLawncareService(id, data);
  }

  @Patch('lawncare/packages/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a lawncare subscription package (price, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateLawncarePackage(@Param('id') id: string, @Body() data: any) {
    return this.service.updateLawncarePackage(id, data);
  }

  @Post('lawncare/property-detail-fields')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a new Lawncare property-detail field' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  createLawncarePropertyDetailField(@Body() body: { label: string; unit: string }) {
    return this.service.createLawncarePropertyDetailField(body.label, body.unit);
  }

  @Patch('lawncare/property-detail-fields/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a Lawncare property-detail field (label/unit/enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateLawncarePropertyDetailField(@Param('id') id: string, @Body() data: any) {
    return this.service.updateLawncarePropertyDetailField(id, data);
  }

  @Delete('lawncare/property-detail-fields/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a Lawncare property-detail field' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  removeLawncarePropertyDetailField(@Param('id') id: string) {
    return this.service.removeLawncarePropertyDetailField(id);
  }

  @Get('pest/config')
  @ApiOperation({ summary: 'Pest Control services and subscription packages. Public callers always get active-only; ?all=true (used by the admin Marketplace page) also includes disabled rows.' })
  getPestConfig(@Query('all') all?: string) {
    return this.service.getPestConfig(all === 'true');
  }

  @Get('pest/property-profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: fetch their saved Pest Control property profile (home sq ft, acreage)' })
  getPestPropertyProfile(@Request() req) {
    return this.service.getPestPropertyProfile(req.user.id);
  }

  @Put('pest/property-profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: create/update their Pest Control property profile — captured once, reused for every package/service price' })
  upsertPestPropertyProfile(@Body() dto: UpsertPestPropertyProfileDto, @Request() req) {
    return this.service.upsertPestPropertyProfile(req.user.id, dto);
  }

  @Post('pest/quote')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: compute a Pest Control price before committing (package computed from composition + property profile, or a single service)' })
  quotePest(@Body() dto: QuotePestDto, @Request() req) {
    return this.service.quotePest(req.user.id, dto);
  }

  @Post('pest/subscribe')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: subscribe to a Pest Control package (billing only, no auto-scheduled visits)' })
  subscribePestPackage(@Body() dto: SubscribePestPackageDto, @Request() req) {
    return this.service.subscribePestPackage(req.user.id, dto);
  }

  @Post('pest/book')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Customer: book a single on-demand Pest Control service' })
  bookPestService(@Body() dto: BookPestServiceDto, @Request() req) {
    return this.service.bookPestService(req.user.id, dto);
  }

  @Patch('pest/services/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a Pest Control service (pricing, volume discount, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updatePestService(@Param('id') id: string, @Body() data: any) {
    return this.service.updatePestService(id, data);
  }

  @Patch('pest/packages/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a Pest Control subscription package (price, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updatePestPackage(@Param('id') id: string, @Body() data: any) {
    return this.service.updatePestPackage(id, data);
  }

  // ── Marketplace Offer Templates (self-service, admin-created verticals) ──

  @Get('templates')
  @ApiOperation({ summary: 'List Marketplace Offer Templates. Public callers get active-only; ?all=true (admin Marketplace page) also includes disabled ones.' })
  getOfferTemplates(@Query('all') all?: string) {
    return this.service.getOfferTemplates(all === 'true');
  }

  @Post('templates')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: create a new Marketplace Offer Template' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  createOfferTemplate(@Body() body: { name?: string }) {
    return this.service.createOfferTemplate(body?.name);
  }

  @Patch('templates/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a Marketplace Offer Template (name, description, capability, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateOfferTemplate(@Param('id') id: string, @Body() data: any) {
    return this.service.updateOfferTemplate(id, data);
  }

  @Delete('templates/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a Marketplace Offer Template and all its packages/property fields/factors/services/frequency discounts' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  removeOfferTemplate(@Param('id') id: string) {
    return this.service.removeOfferTemplate(id);
  }

  @Get('templates/:id/config')
  @ApiOperation({ summary: 'Full nested config for one Marketplace Offer Template (packages, property fields, factors, services, frequency discounts). ?all=true (admin Marketplace page) also includes disabled rows.' })
  getOfferTemplateConfig(@Param('id') id: string, @Query('all') all?: string) {
    return this.service.getOfferTemplateConfig(id, all === 'true');
  }

  @Post('templates/:id/quote')
  @ApiOperation({ summary: 'Compute a price for one service or package under a Marketplace Offer Template (property values, selected factors, active package/frequency)' })
  quoteTemplate(@Param('id') id: string, @Body() dto: any) {
    return this.service.quoteTemplate(id, dto);
  }

  @Post('templates/:templateId/packages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a new Subscription Package to a Marketplace Offer Template' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  createTemplatePackage(@Param('templateId') templateId: string) {
    return this.service.createTemplatePackage(templateId);
  }

  @Patch('templates/packages/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a template Subscription Package (name, description, monthly price, bundle discount %, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateTemplatePackage(@Param('id') id: string, @Body() data: any) {
    return this.service.updateTemplatePackage(id, data);
  }

  @Delete('templates/packages/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a template Subscription Package' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  removeTemplatePackage(@Param('id') id: string) {
    return this.service.removeTemplatePackage(id);
  }

  @Post('templates/:templateId/property-fields')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a new Service Property field to a Marketplace Offer Template' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  createTemplatePropertyField(@Param('templateId') templateId: string, @Body() body: { label?: string; unit?: string }) {
    return this.service.createTemplatePropertyField(templateId, body?.label, body?.unit);
  }

  @Patch('templates/property-fields/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a template Service Property field (label, unit, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateTemplatePropertyField(@Param('id') id: string, @Body() data: any) {
    return this.service.updateTemplatePropertyField(id, data);
  }

  @Delete('templates/property-fields/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a template Service Property field' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  removeTemplatePropertyField(@Param('id') id: string) {
    return this.service.removeTemplatePropertyField(id);
  }

  @Post('templates/:templateId/factors')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a new Service Factor to a Marketplace Offer Template' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  createTemplateFactor(@Param('templateId') templateId: string, @Body() body: { label?: string }) {
    return this.service.createTemplateFactor(templateId, body?.label);
  }

  @Patch('templates/factors/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a template Service Factor (label, multiplier, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateTemplateFactor(@Param('id') id: string, @Body() data: any) {
    return this.service.updateTemplateFactor(id, data);
  }

  @Delete('templates/factors/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a template Service Factor' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  removeTemplateFactor(@Param('id') id: string) {
    return this.service.removeTemplateFactor(id);
  }

  @Post('templates/:templateId/services')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a new Add-on Service to a Marketplace Offer Template' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  createTemplateService(@Param('templateId') templateId: string, @Body() body: { label?: string }) {
    return this.service.createTemplateService(templateId, body?.label);
  }

  @Patch('templates/services/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a template Add-on Service (pricing, property fields, factors, package visibility, volume discount, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateTemplateService(@Param('id') id: string, @Body() data: any) {
    return this.service.updateTemplateService(id, data);
  }

  @Delete('templates/services/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a template Add-on Service' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  removeTemplateService(@Param('id') id: string) {
    return this.service.removeTemplateService(id);
  }

  @Post('templates/:templateId/frequency-discounts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: add a new Frequency Discount to a Marketplace Offer Template' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  createTemplateFrequencyDiscount(@Param('templateId') templateId: string, @Body() body: { label?: string }) {
    return this.service.createTemplateFrequencyDiscount(templateId, body?.label);
  }

  @Patch('templates/frequency-discounts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a template Frequency Discount (label, discount %, enabled)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  updateTemplateFrequencyDiscount(@Param('id') id: string, @Body() data: any) {
    return this.service.updateTemplateFrequencyDiscount(id, data);
  }

  @Delete('templates/frequency-discounts/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: remove a template Frequency Discount' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  removeTemplateFrequencyDiscount(@Param('id') id: string) {
    return this.service.removeTemplateFrequencyDiscount(id);
  }
}
