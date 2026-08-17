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

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('devices')
  @ApiOperation({ summary: "Monitoring tab: current customer's live sensor devices (temperature/leak only)" })
  getDevices(@Request() req: any) {
    return this.service.getDeviceStates(req.user.id);
  }

  // Admin / Vendor routes ─────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Post('link')
  @ApiOperation({ summary: "Connect a customer's own Yolink home monitoring — validates the credentials against Yolink before saving" })
  linkHome(@Body() body: { customerId: string; yolinkUAID: string; yolinkSecretKey: string; homeName: string; address?: string }) {
    return this.service.linkHomeToCustomer(body.customerId, body.yolinkUAID, body.yolinkSecretKey, body.homeName, body.address);
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

  // Test / debug (admin only) ────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('simulate')
  @ApiOperation({ summary: 'Simulate a sensor alert for a customer (admin, for testing)' })
  simulate(@Body() body: { customerId: string; eventType?: string }) {
    return this.service.simulateAlert(body.customerId, body.eventType ?? 'LeakSensor.Alert');
  }
}
