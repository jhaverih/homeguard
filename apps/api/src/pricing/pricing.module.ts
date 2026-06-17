import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { ServicePrice } from './entities/service-price.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServicePrice])],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService],
})
export class PricingModule {}
