import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequest } from './entities/service-request.entity';
import { AdditionalService } from './entities/additional-service.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceRequest, AdditionalService]),
    SubscriptionsModule,
    UsersModule,
    NotificationsModule,
  ],
  providers: [ServiceRequestsService],
  controllers: [ServiceRequestsController],
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
