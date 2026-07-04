import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { CustomerSubscription } from '../subscriptions/entities/customer-subscription.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { VendorSchedulerService } from './vendor-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, VendorProfile, CustomerSubscription, Payment, ServiceRequest]),
    NotificationsModule,
  ],
  providers: [AdminService, VendorSchedulerService],
  controllers: [AdminController],
})
export class AdminModule {}
