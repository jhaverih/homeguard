import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { VendorProfile } from './entities/vendor-profile.entity';
import { CustomerProfile } from './entities/customer-profile.entity';
import { PropertyCharacteristics } from './entities/property-characteristics.entity';
import { VendorCompany } from '../vendor/entities/vendor-company.entity';
import { PropertyCharacteristicsService } from './property-characteristics.service';
import { PropertyCharacteristicsController } from './property-characteristics.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, VendorProfile, CustomerProfile, VendorCompany, PropertyCharacteristics])],
  providers: [UsersService, PropertyCharacteristicsService],
  controllers: [UsersController, PropertyCharacteristicsController],
  exports: [UsersService, PropertyCharacteristicsService],
})
export class UsersModule {}
