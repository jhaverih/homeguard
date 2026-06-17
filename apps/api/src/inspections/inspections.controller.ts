import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InspectionsService } from './inspections.service';

@ApiTags('Inspections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly service: InspectionsService) {}

  @Post('requests/:requestId/notes')
  addNote(@Request() req, @Param('requestId') requestId: string, @Body() body: any) {
    return this.service.addNote(requestId, req.user.id, body);
  }

  @Get('requests/:requestId/notes')
  getNotes(@Param('requestId') requestId: string) {
    return this.service.getNotes(requestId);
  }

  @Get('history')
  getHistory(@Request() req) {
    return this.service.getHistory(req.user.id);
  }
}
