import { Controller, Get, Put, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertyCharacteristicsService } from './property-characteristics.service';
import { UpsertPropertyCharacteristicsDto } from './dto/upsert-property-characteristics.dto';
import {
  calcCarePlusSurcharge, calcAssessmentCustomerSurcharge, calcAssessmentVendorCost,
} from '../common/utils/property-surcharge.utils';

@ApiTags('Property Characteristics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('property-characteristics')
export class PropertyCharacteristicsController {
  constructor(private readonly service: PropertyCharacteristicsService) {}

  @Get('me')
  getMine(@Request() req) {
    return this.service.get(req.user.id);
  }

  @Put('me')
  upsertMine(@Request() req, @Body() body: UpsertPropertyCharacteristicsDto) {
    return this.service.upsert(req.user.id, body);
  }

  // Pure computation, no persistence — lets the client show a live surcharge
  // breakdown as the customer fills in the form, before saving.
  @Post('quote')
  quote(@Body() body: UpsertPropertyCharacteristicsDto) {
    const c = { ...body, hasDetachedGarage: !!body.hasDetachedGarage };
    return {
      carePlusSurcharge: calcCarePlusSurcharge(c),
      assessmentCustomerSurcharge: calcAssessmentCustomerSurcharge(c),
      assessmentVendorCost: calcAssessmentVendorCost(c),
    };
  }
}
