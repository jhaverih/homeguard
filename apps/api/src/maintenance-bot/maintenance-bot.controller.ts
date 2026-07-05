import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MaintenanceBotService } from './maintenance-bot.service';

@ApiTags('Maintenance Bot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('maintenance-bot')
export class MaintenanceBotController {
  constructor(private readonly service: MaintenanceBotService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the AI maintenance assistant' })
  chat(
    @Request() req,
    @Body() body: {
      message: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      sessionId?: string;
    },
  ) {
    return this.service.chat(req.user.id, body.message, body.history ?? [], body.sessionId);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List AI chat sessions for the current user' })
  getSessions(@Request() req) {
    return this.service.getSessions(req.user.id);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get messages for a specific chat session' })
  getSession(@Request() req, @Param('id') id: string) {
    return this.service.getSession(req.user.id, id);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Delete a chat session' })
  deleteSession(@Request() req, @Param('id') id: string) {
    return this.service.deleteSession(req.user.id, id);
  }
}
