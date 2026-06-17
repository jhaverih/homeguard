import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  getMyNotifications(@Request() req) {
    return this.service.getMyNotifications(req.user.id);
  }

  @Patch(':id/read')
  markRead(@Request() req, @Param('id') id: string) {
    return this.service.markRead(id, req.user.id);
  }
}
