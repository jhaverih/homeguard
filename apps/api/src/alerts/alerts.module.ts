import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from './entities/alert.entity';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Alert]), NotificationsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  // Also exports TypeOrmModule so YolinkService can inject the Alert repo
  // directly for its one-time severity backfill (see YolinkService.onModuleInit)
  // — that reclassification logic is Yolink-specific and doesn't belong in
  // AlertsService itself.
  exports: [AlertsService, TypeOrmModule],
})
export class AlertsModule {}
