import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';
import { ServicePrice } from './entities/service-price.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServicePrice, VendorCapability])],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService],
})
export class PricingModule {}
