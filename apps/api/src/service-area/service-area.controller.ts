import { Controller, Get, Post, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ServiceAreaService } from './service-area.service';
import { NotifyWaitlistDto } from './dto/notify-waitlist.dto';

// Fully public — no auth — deliberately kept as its own narrow module so
// only these two routes are ever exposed past the public nginx/Cloudflare
// gateway, not the rest of the API. ThrottlerGuard is scoped to just this
// controller, not applied globally.
@ApiTags('Service Area (public)')
@Controller('public/service-area')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { ttl: 60000, limit: 10 } })
export class ServiceAreaController {
  constructor(private readonly service: ServiceAreaService) {}

  @Get('check')
  @ApiOperation({ summary: 'Public: is a ZIP code within any approved vendor company\'s service radius?' })
  check(@Query('zip') zip?: string) {
    if (!zip || zip.trim().length !== 5) {
      throw new BadRequestException('A 5-digit zip query param is required.');
    }
    return this.service.checkAvailability(zip.trim());
  }

  @Post('notify')
  @ApiOperation({ summary: 'Public: capture an email to notify when service becomes available in a ZIP' })
  notify(@Body() dto: NotifyWaitlistDto) {
    return this.service.notify(dto.email, dto.zip);
  }
}
