import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobEvent } from './job-event.entity';
import { JobEventsService } from './job-events.service';
import { JobEventsController } from './job-events.controller';

// Global so every module that changes a job can record what happened
// without each one importing this module.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([JobEvent])],
  providers: [JobEventsService],
  controllers: [JobEventsController],
  exports: [JobEventsService],
})
export class JobEventsModule {}
