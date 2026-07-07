import { Controller, Get, Patch, Post, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AlertsService } from './alerts.service';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  getMyAlerts(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getMyAlerts(req.user.id, Number(page) || 1, Number(limit) || 20);
  }

  @Patch('read-all')
  markAllRead(@Request() req: any) {
    return this.service.markAllRead(req.user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.service.markRead(id, req.user.id);
  }

  @Post(':id/dispatch')
  requestDispatch(@Param('id') id: string, @Request() req: any) {
    return this.service.requestDispatch(id, req.user.id);
  }
}
