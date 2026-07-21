import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceVisitSchedulerService } from './marketplace-visit-scheduler.service';
import { MarketplaceCleaningPlan } from './entities/marketplace-cleaning-plan.entity';
import { MarketplaceRoomUnit } from './entities/marketplace-room-unit.entity';
import { MarketplaceConditionMultiplier } from './entities/marketplace-condition-multiplier.entity';
import { MarketplaceAddOn } from './entities/marketplace-add-on.entity';
import { MarketplaceFrequencyDiscount } from './entities/marketplace-frequency-discount.entity';
import { MarketplaceSubscription } from './entities/marketplace-subscription.entity';
import { MarketplaceSubscriptionEvent } from './entities/marketplace-subscription-event.entity';
import { MarketplaceLawncareService } from './entities/marketplace-lawncare-service.entity';
import { MarketplaceLawncarePackage } from './entities/marketplace-lawncare-package.entity';
import { MarketplaceLawncarePackageSubscription } from './entities/marketplace-lawncare-package-subscription.entity';
import { MarketplaceLawncarePropertyProfile } from './entities/marketplace-lawncare-property-profile.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { ServicePrice } from '../pricing/entities/service-price.entity';
import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServiceRequestsModule } from '../service-requests/service-requests.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketplaceCleaningPlan, MarketplaceRoomUnit, MarketplaceConditionMultiplier,
      MarketplaceAddOn, MarketplaceFrequencyDiscount, MarketplaceSubscription,
      MarketplaceSubscriptionEvent, MarketplaceLawncareService, MarketplaceLawncarePackage,
      MarketplaceLawncarePackageSubscription, MarketplaceLawncarePropertyProfile, VendorCapability, ServicePrice,
    ]),
    UsersModule,
    SubscriptionsModule,
    NotificationsModule,
    forwardRef(() => ServiceRequestsModule),
  ],
  providers: [MarketplaceService, MarketplaceVisitSchedulerService],
  controllers: [MarketplaceController],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
