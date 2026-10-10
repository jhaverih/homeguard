import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NestAccount } from './entities/nest-account.entity';
import { NestThermostat } from './entities/nest-thermostat.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { NestService } from './nest.service';
import { NestController } from './nest.controller';
import { IotAnalyticsModule } from '../iot-analytics/iot-analytics.module';

// Google Nest thermostats via the Smart Device Management API — a second
// provider adapter alongside YolinkModule, feeding the same provider-agnostic
// device registry, telemetry and analytics engines.
@Module({
  imports: [TypeOrmModule.forFeature([NestAccount, NestThermostat, YolinkHome]), IotAnalyticsModule],
  controllers: [NestController],
  providers: [NestService],
})
export class GoogleNestModule {}
