import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { YolinkService } from './yolink.service';

@ApiTags('Yolink')
@Controller('yolink')
export class YolinkController {
  constructor(private readonly service: YolinkService) {}

  // Public — called by Yolink cloud (no auth)
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Yolink webhook receiver (called by Yolink cloud)' })
  async handleWebhook(@Body() payload: any) {
    await this.service.handleWebhook(payload);
    return { ok: true };
  }

  // Authenticated routes ──────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('my-homes')
  @ApiOperation({ summary: 'Get Yolink homes linked to current customer' })
  getMyHomes(@Request() req: any) {
    return this.service.getLinkedHomes(req.user.id);
  }

  // Admin / Vendor routes ─────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Get('available-homes')
  @ApiOperation({ summary: 'Fetch homes from Yolink account (admin/vendor)' })
  getAvailableHomes() {
    return this.service.getYolinkHomes();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Get('available-homes/:yolinkHomeId/devices')
  @ApiOperation({ summary: 'List devices in a Yolink home' })
  getDevices(@Param('yolinkHomeId') yolinkHomeId: string) {
    return this.service.getDevicesForHome(yolinkHomeId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Post('link')
  @ApiOperation({ summary: 'Link a Yolink home to a customer' })
  linkHome(@Body() body: { customerId: string; yolinkUAID: string; homeName: string; address?: string }) {
    return this.service.linkHomeToCustomer(body.customerId, body.yolinkUAID, body.homeName, body.address);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('homes')
  @ApiOperation({ summary: 'List all linked Yolink homes (admin)' })
  getAllHomes(@Query('customerId') customerId?: string) {
    return this.service.getLinkedHomes(customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('homes/:id')
  unlinkHome(@Param('id') id: string) {
    return this.service.unlinkHome(id);
  }

  // Webhook management (admin only) ──────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('register-webhook')
  @ApiOperation({ summary: 'Register Houmi webhook URL with Yolink (admin)' })
  registerWebhook(@Body() body: { webhookUrl: string }) {
    return this.service.registerWebhook(body.webhookUrl);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('webhook-status')
  getWebhookStatus() {
    return this.service.getWebhookStatus();
  }
}
