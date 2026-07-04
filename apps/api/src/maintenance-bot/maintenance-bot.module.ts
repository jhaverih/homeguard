import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionNote } from '../inspections/entities/inspection.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { MaintenanceBotService } from './maintenance-bot.service';
import { MaintenanceBotController } from './maintenance-bot.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InspectionNote, ServiceRequest])],
  providers: [MaintenanceBotService],
  controllers: [MaintenanceBotController],
})
export class MaintenanceBotModule {}
