import {
  Controller, Post, Get, Patch, Body, Param, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminLevelGuard } from '../common/guards/admin-level.guard';
import { MinAdminLevel } from '../common/decorators/min-admin-level.decorator';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { DisputesService } from './disputes.service';
import { DisputeCategory, DisputeStatus } from '../common/enums/role.enum';

@ApiTags('Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly service: DisputesService) {}

  @Post()
  @ApiOperation({ summary: 'Customer: open a dispute on a completed job' })
  openDispute(
    @Request() req,
    @Body() body: {
      serviceRequestId: string;
      vendorId: string;
      stripePaymentIntentId?: string;
      category: DisputeCategory;
      description: string;
      photoKeys?: string[];
    },
  ) {
    return this.service.openDispute(req.user.id, body);
  }

  @Get('my')
  @ApiOperation({ summary: 'Customer: get my disputes' })
  getMyDisputes(@Request() req) {
    return this.service.getCustomerDisputes(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Admin: get all disputes' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  getAll() {
    return this.service.getAll();
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Admin: resolve a dispute (voids or releases a real Stripe charge)' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  resolve(
    @Param('id') id: string,
    @Body() body: { resolution: DisputeStatus.RESOLVED_CUSTOMER | DisputeStatus.RESOLVED_VENDOR; note: string },
  ) {
    return this.service.resolve(id, body.resolution, body.note);
  }
}
