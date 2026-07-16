import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CancellationFeedbackService } from './cancellation-feedback.service';
import { CreateCancellationFeedbackDto } from './dto/create-cancellation-feedback.dto';

@ApiTags('Cancellation Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cancellation-feedback')
export class CancellationFeedbackController {
  constructor(private readonly service: CancellationFeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Record why a customer cancelled a subscription or service request' })
  create(@Request() req: any, @Body() dto: CreateCancellationFeedbackDto) {
    return this.service.create(req.user.id, dto);
  }
}
