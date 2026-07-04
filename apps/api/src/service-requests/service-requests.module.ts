import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequest } from './entities/service-request.entity';
import { AdditionalService } from './entities/additional-service.entity';
import { Dispute } from './entities/dispute.entity';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceRequest, AdditionalService, Dispute]),
    SubscriptionsModule,
    UsersModule,
    NotificationsModule,
    UploadsModule,
    forwardRef(() => PaymentsModule),
  ],
  providers: [ServiceRequestsService, DisputesService],
  controllers: [ServiceRequestsController, DisputesController],
  exports: [ServiceRequestsService, DisputesService],
})
export class ServiceRequestsModule {}
