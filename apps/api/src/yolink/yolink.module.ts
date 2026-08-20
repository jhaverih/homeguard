import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YolinkHome } from './entities/yolink-home.entity';
import { YolinkDevice } from './entities/yolink-device.entity';
import { YolinkService } from './yolink.service';
import { YolinkController } from './yolink.controller';
import { AlertsModule } from '../alerts/alerts.module';
import { HvacAnalyticsModule } from '../hvac-analytics/hvac-analytics.module';

@Module({
  imports: [TypeOrmModule.forFeature([YolinkHome, YolinkDevice]), AlertsModule, HvacAnalyticsModule],
  controllers: [YolinkController],
  providers: [YolinkService],
  exports: [YolinkService],
})
export class YolinkModule {}
