import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminLevelGuard } from '../common/guards/admin-level.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MinAdminLevel } from '../common/decorators/min-admin-level.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminLevel } from '../common/enums/admin-level.enum';
import { JobEventsService } from './job-events.service';

// Admin read access to the job event log (see job-event.entity.ts).
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
@Roles(UserRole.ADMIN)
@MinAdminLevel(AdminLevel.ADMIN)
@Controller('admin/job-events')
export class JobEventsController {
  constructor(private readonly events: JobEventsService) {}

  private parse(q: { from?: string; to?: string; type?: string; vendorId?: string; includeTest?: string }) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) throw new BadRequestException('Invalid date');
    return { from, to, type: q.type || undefined, vendorId: q.vendorId || undefined, includeTest: q.includeTest === 'true' };
  }

  @Get()
  @ApiOperation({ summary: 'Admin: job events (from, to, type, vendorId, includeTest)' })
  list(@Query() q: any) {
    return this.events.list(this.parse(q));
  }

  @Get('csv')
  @ApiOperation({ summary: 'Admin: download job events as CSV' })
  async csv(@Query() q: any, @Res() res: Response) {
    const events = await this.events.list(this.parse(q), 50000);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="job-events-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(this.events.toCsv(events));
  }

  @Get('job/:serviceRequestId')
  @ApiOperation({ summary: 'Admin: one job\'s timeline' })
  forJob(@Param('serviceRequestId') id: string) {
    return this.events.forJob(id);
  }
}
