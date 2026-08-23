import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Home } from './entities/home.entity';
import { Equipment } from './entities/equipment.entity';
import { DeviceRegistry } from './entities/device-registry.entity';
import { SensorAssignment } from './entities/sensor-assignment.entity';
import { SensorClassificationRule } from './entities/sensor-classification-rule.entity';
import { TelemetryEvent } from './entities/telemetry-event.entity';
import { AnalyticsFinding } from './entities/analytics-finding.entity';
import { AnalyticsThreshold } from './entities/analytics-threshold.entity';
import { AnalyticsMetricSample } from './entities/analytics-metric-sample.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { YolinkDevice } from '../yolink/entities/yolink-device.entity';
import { User } from '../users/entities/user.entity';
import { CustomerSubscription } from '../subscriptions/entities/customer-subscription.entity';
import { ClassificationService } from './classification.service';
import { DeviceRegistryService } from './device-registry.service';
import { TelemetryService } from './telemetry.service';
import { AnalyticsEngineService } from './analytics-engine.service';
import { ComponentHealthService } from './component-health.service';
import { ThresholdsService } from './thresholds.service';
import { BaselineService } from './baseline.service';
import { PerformanceEngineService } from './performance-engine.service';
import { IotAnalyticsService } from './iot-analytics.service';
import { IotAnalyticsMigrationService } from './iot-analytics-migration.service';
import { IotAnalyticsController } from './iot-analytics.controller';
import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    // YolinkHome/YolinkDevice/User/CustomerSubscription repos are registered
    // directly here (not via YolinkModule/UsersModule/SubscriptionsModule)
    // since YolinkModule needs to import THIS module (so YolinkService can
    // call the device-registry/telemetry/analytics-engine services in real
    // time as MQTT messages arrive) — importing those modules here would
    // close a cycle. Same duplication convention this codebase already used
    // for HvacAnalyticsModule's CustomerSubscription registration.
    TypeOrmModule.forFeature([
      Home, Equipment, DeviceRegistry, SensorAssignment, SensorClassificationRule, TelemetryEvent, AnalyticsFinding, AnalyticsThreshold, AnalyticsMetricSample,
      YolinkHome, YolinkDevice, User, CustomerSubscription,
    ]),
    AlertsModule,
    NotificationsModule,
  ],
  providers: [ClassificationService, DeviceRegistryService, TelemetryService, AnalyticsEngineService, ComponentHealthService, ThresholdsService, BaselineService, PerformanceEngineService, IotAnalyticsService, IotAnalyticsMigrationService],
  controllers: [IotAnalyticsController],
  exports: [DeviceRegistryService, TelemetryService, AnalyticsEngineService, ComponentHealthService, ThresholdsService, BaselineService, PerformanceEngineService, IotAnalyticsService, IotAnalyticsMigrationService],
})
export class IotAnalyticsModule {}
