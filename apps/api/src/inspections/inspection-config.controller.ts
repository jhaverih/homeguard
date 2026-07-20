import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminLevelGuard } from '../common/guards/admin-level.guard';
import { MinAdminLevel } from '../common/decorators/min-admin-level.decorator';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { InspectionConfigService } from './inspection-config.service';

@ApiTags('Inspection Configurator')
@Controller('inspection-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
@Roles(UserRole.ADMIN)
@MinAdminLevel(AdminLevel.ADMIN)
export class InspectionConfigController {
  constructor(private readonly service: InspectionConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: full checklist tree (Group -> Subgroup -> Section -> Task)' })
  getTree() {
    return this.service.getTree();
  }

  @Patch('sections/:id')
  @ApiOperation({ summary: 'Admin: update a checklist section (label/description/enabled)' })
  updateSection(@Param('id') id: string, @Body() body: any) {
    return this.service.updateSection(id, body);
  }

  @Post('subgroups/:subgroupId/sections')
  @ApiOperation({ summary: 'Admin: create a new checklist under a subgroup' })
  createSection(@Param('subgroupId') subgroupId: string, @Body() body: { label: string }) {
    return this.service.createSection(subgroupId, body.label);
  }

  @Delete('sections/:id')
  @ApiOperation({ summary: 'Admin: remove a whole checklist (and its tasks)' })
  removeSection(@Param('id') id: string) {
    return this.service.removeSection(id);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Admin: update a checklist task (label/description/enabled)' })
  updateTask(@Param('id') id: string, @Body() body: any) {
    return this.service.updateTask(id, body);
  }

  @Post('sections/:sectionId/tasks')
  @ApiOperation({ summary: 'Admin: add a new task to a checklist' })
  createTask(@Param('sectionId') sectionId: string, @Body() body: { label: string }) {
    return this.service.createTask(sectionId, body.label);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Admin: remove a task from a checklist' })
  removeTask(@Param('id') id: string) {
    return this.service.removeTask(id);
  }
}
