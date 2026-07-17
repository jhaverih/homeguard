import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaitlistSignup } from './entities/waitlist-signup.entity';
import { VendorCompany } from '../vendor/entities/vendor-company.entity';
import { ServiceAreaService } from './service-area.service';
import { ServiceAreaController } from './service-area.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WaitlistSignup, VendorCompany])],
  controllers: [ServiceAreaController],
  providers: [ServiceAreaService],
  exports: [ServiceAreaService],
})
export class ServiceAreaModule {}
