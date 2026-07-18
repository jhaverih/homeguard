import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaitlistSignup } from './entities/waitlist-signup.entity';
import { VendorCompany } from '../vendor/entities/vendor-company.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { VendorCapabilitySelection } from '../vendor/entities/vendor-capability-selection.entity';
import { VendorCertification } from '../vendor/entities/vendor-certification.entity';
import { ServiceAreaService } from './service-area.service';
import { ServiceAreaController } from './service-area.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WaitlistSignup, VendorCompany, VendorProfile, VendorCapability, VendorCapabilitySelection, VendorCertification,
    ]),
    UsersModule,
  ],
  controllers: [ServiceAreaController],
  providers: [ServiceAreaService],
  exports: [ServiceAreaService],
})
export class ServiceAreaModule {}
