import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { CustomerSubscription } from '../subscriptions/entities/customer-subscription.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { Dispute } from '../service-requests/entities/dispute.entity';
import { Review } from '../reviews/entities/review.entity';
import { Alert } from '../alerts/entities/alert.entity';
import { CustomerProfile } from '../users/entities/customer-profile.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ServiceRequestsModule } from '../service-requests/service-requests.module';
import { PricingModule } from '../pricing/pricing.module';
import { VendorCompany } from '../vendor/entities/vendor-company.entity';
import { VendorCertification } from '../vendor/entities/vendor-certification.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { VendorMembershipPayment } from '../vendor/entities/vendor-membership-payment.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { WaitlistSignup } from '../service-area/entities/waitlist-signup.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { VendorSchedulerService } from './vendor-scheduler.service';
import { EmailService } from '../common/email/email.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, VendorProfile, CustomerSubscription, Payment, ServiceRequest, Dispute, Review, Alert, CustomerProfile,
      VendorCompany, VendorCertification, VendorCapability, VendorMembershipPayment, YolinkHome, WaitlistSignup,
    ]),
    NotificationsModule,
    UsersModule,
    AuthModule,
    UploadsModule,
    ServiceRequestsModule,
    PricingModule,
    PaymentsModule,
  ],
  providers: [AdminService, VendorSchedulerService, EmailService],
  controllers: [AdminController],
})
export class AdminModule {}
