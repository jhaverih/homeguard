import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Dispute } from '../service-requests/entities/dispute.entity';
import { InspectionNote } from '../inspections/entities/inspection.entity';
import { InspectionTaskResult } from '../inspections/entities/inspection-task-result.entity';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VendorCompany } from './entities/vendor-company.entity';
import { VendorCapability } from './entities/vendor-capability.entity';
import { VendorCapabilitySelection } from './entities/vendor-capability-selection.entity';
import { VendorCapabilityAcknowledgment } from './entities/vendor-capability-acknowledgment.entity';
import { VendorCertification } from './entities/vendor-certification.entity';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, VendorProfile, VendorCompany, VendorCapability, VendorCapabilitySelection, VendorCapabilityAcknowledgment, VendorCertification,
      ServiceRequest, Payment, Dispute, InspectionNote, InspectionTaskResult,
    ]),
    UsersModule,
    AuthModule,
    UploadsModule,
    NotificationsModule,
  ],
  providers: [VendorService],
  controllers: [VendorController],
  exports: [VendorService],
})
export class VendorModule {}
