import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { InspectionsModule } from './inspections/inspections.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { PricingModule } from './pricing/pricing.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { MaintenanceBotModule } from './maintenance-bot/maintenance-bot.module';
import { AlertsModule } from './alerts/alerts.module';
import { YolinkModule } from './yolink/yolink.module';
import { VendorModule } from './vendor/vendor.module';
import { CancellationFeedbackModule } from './cancellation-feedback/cancellation-feedback.module';
import { ServiceAreaModule } from './service-area/service-area.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'postgres'),
        port: parseInt(configService.get('DB_PORT', '5432')),
        username: configService.get('DB_USER', 'homeguard'),
        password: configService.get('DB_PASSWORD', 'changeme'),
        database: configService.get('DB_NAME', 'homeguard'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'redis'),
          port: parseInt(configService.get('REDIS_PORT', '6379')),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),

    ScheduleModule.forRoot(),

    // Only applied to the public service-area endpoints (ThrottlerGuard is
    // scoped there, not global) — everything else is unaffected.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),

    HealthModule,
    AdminModule,
    AuthModule,
    UsersModule,
    SubscriptionsModule,
    ServiceRequestsModule,
    InspectionsModule,
    ChatModule,
    NotificationsModule,
    PaymentsModule,
    PricingModule,
    ReviewsModule,
    UploadsModule,
    MaintenanceBotModule,
    AlertsModule,
    YolinkModule,
    VendorModule,
    CancellationFeedbackModule,
    ServiceAreaModule,
  ],
})
export class AppModule {}
