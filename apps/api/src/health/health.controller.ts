import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class HealthController {
  @Get('health')
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
