import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CancellationFeedback } from './entities/cancellation-feedback.entity';
import { CancellationFeedbackService } from './cancellation-feedback.service';
import { CancellationFeedbackController } from './cancellation-feedback.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CancellationFeedback])],
  controllers: [CancellationFeedbackController],
  providers: [CancellationFeedbackService],
  exports: [CancellationFeedbackService],
})
export class CancellationFeedbackModule {}
