import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Get('vendors')
  @ApiOperation({ summary: 'List all vendors' })
  getVendors() {
    return this.service.getVendors();
  }

  @Patch('vendors/:id/approve')
  @ApiOperation({ summary: 'Approve a vendor' })
  approveVendor(@Param('id') id: string) {
    return this.service.approveVendor(id);
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
}
