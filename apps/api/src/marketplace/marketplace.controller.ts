import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
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
import { IsDateString } from 'class-validator';

class BookOneTimeCleaningDto extends QuoteHouseCleaningDto {
  @IsDateString()
  preferredDate: string;
}

@ApiTags('Marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  @Get('house-cleaning/config')
  @ApiOperation({ summary: 'Cleaning plans, room units, condition multipliers, add-ons, and frequency discounts' })
  getConfig() {
    return this.service.getConfig();
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
  subscribe(@Body() dto: QuoteHouseCleaningDto, @Request() req) {
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
}
