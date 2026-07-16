import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionNote } from '../inspections/entities/inspection.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { AiRecommendation } from './entities/ai-recommendation.entity';
import { MaintenanceBotService } from './maintenance-bot.service';
import { MaintenanceBotController } from './maintenance-bot.controller';
import { PricingModule } from '../pricing/pricing.module';
import { InspectionsModule } from '../inspections/inspections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InspectionNote, ServiceRequest, ChatSession, ChatMessage, AiRecommendation]),
    PricingModule,
    InspectionsModule,
  ],
  providers: [MaintenanceBotService],
  controllers: [MaintenanceBotController],
})
export class MaintenanceBotModule {}
