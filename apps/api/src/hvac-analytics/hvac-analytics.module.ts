import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsFinding } from './entities/analytics-finding.entity';
import { HvacAnalyticsService } from './hvac-analytics.service';
import { HvacAnalyticsController } from './hvac-analytics.controller';
import { YolinkDevice } from '../yolink/entities/yolink-device.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { YolinkNameTaggingRule } from '../yolink/entities/yolink-name-tagging-rule.entity';
import { SensorReading } from '../yolink/entities/sensor-reading.entity';
import { User } from '../users/entities/user.entity';
import { CustomerSubscription } from '../subscriptions/entities/customer-subscription.entity';
import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    // CustomerSubscription's own repo is registered directly here (not via
    // SubscriptionsModule) since SubscriptionsModule already imports
    // YolinkModule, and YolinkModule needs to import this module (so
    // YolinkService can call into HvacAnalyticsService in real time as MQTT
    // messages arrive) — importing SubscriptionsModule here would close that
    // into a 3-module cycle. Same duplication convention this codebase
    // already uses for other small cross-module lookups (e.g. calcTieredCost).
    TypeOrmModule.forFeature([AnalyticsFinding, YolinkDevice, YolinkHome, YolinkNameTaggingRule, SensorReading, User, CustomerSubscription]),
    AlertsModule,
    NotificationsModule,
  ],
  providers: [HvacAnalyticsService],
  controllers: [HvacAnalyticsController],
  exports: [HvacAnalyticsService],
})
export class HvacAnalyticsModule {}
