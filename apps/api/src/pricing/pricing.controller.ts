import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res, UseGuards, HttpCode } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminLevelGuard } from '../common/guards/admin-level.guard';
import { MinAdminLevel } from '../common/decorators/min-admin-level.decorator';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { PricingService } from './pricing.service';
import { CreatePricingDto } from './dto/create-pricing.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { BulkUpdateCategoryDto } from './dto/bulk-update-category.dto';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly service: PricingService) {}

  @Get()
  @ApiOperation({ summary: 'List the additional service catalog (public)' })
  getAll(@Query('all') all?: string) {
    return this.service.getAll(all === 'true');
  }

  @Get('backups')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list recent full-catalog backup snapshots' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  listBackups() {
    return this.service.listBackups();
  }

  @Get('backups/:id/csv')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: download a backup snapshot as CSV' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  async downloadBackupCsv(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.service.getBackupCsv(id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="pricing-backup-${id}.csv"`);
    res.send(csv);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super User: create a catalog item' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.SUPER_USER)
  create(@Body() dto: CreatePricingDto) {
    return this.service.create(dto);
  }

  @Patch('bulk/category')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: bulk-assign a category to multiple catalog items' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  bulkUpdateCategory(@Body() dto: BulkUpdateCategoryDto) {
    return this.service.bulkUpdateCategory(dto.ids, dto.category);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: update a catalog item' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePricingDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Super User: delete a catalog item' })
  @UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
  @Roles(UserRole.ADMIN)
  @MinAdminLevel(AdminLevel.SUPER_USER)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
