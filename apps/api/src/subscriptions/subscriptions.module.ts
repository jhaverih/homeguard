import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { CustomerSubscription } from './entities/customer-subscription.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { YolinkModule } from '../yolink/yolink.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    // ServiceRequest is registered here (not via ServiceRequestsModule) to avoid
    // a circular import — ServiceRequestsModule already imports SubscriptionsModule.
    TypeOrmModule.forFeature([SubscriptionPlan, CustomerSubscription, ServiceRequest]),
    ConfigModule,
    UsersModule,
    NotificationsModule,
    YolinkModule,
    PricingModule,
  ],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
