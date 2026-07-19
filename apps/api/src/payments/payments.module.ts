import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment } from './entities/payment.entity';
import { AdditionalService } from '../service-requests/entities/additional-service.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { VendorMembershipPayment } from '../vendor/entities/vendor-membership-payment.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, AdditionalService, ServiceRequest, VendorMembershipPayment]),
    NotificationsModule,
    UsersModule,
    SubscriptionsModule,
    forwardRef(() => MarketplaceModule),
  ],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
