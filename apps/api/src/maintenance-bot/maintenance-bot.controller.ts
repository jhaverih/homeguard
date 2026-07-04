import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
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
    },
  ) {
    return this.service.chat(req.user.id, body.message, body.history ?? []).then((reply) => ({ reply }));
  }
}
