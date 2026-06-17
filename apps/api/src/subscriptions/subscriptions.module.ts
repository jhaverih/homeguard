import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { CustomerSubscription } from './entities/customer-subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionPlan, CustomerSubscription])],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
