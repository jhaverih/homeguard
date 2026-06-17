import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { VendorProfile } from './entities/vendor-profile.entity';
import { CustomerProfile } from './entities/customer-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, VendorProfile, CustomerProfile])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
