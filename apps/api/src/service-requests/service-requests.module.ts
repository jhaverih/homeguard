import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequest } from './entities/service-request.entity';
import { AdditionalService } from './entities/additional-service.entity';
import { Dispute } from './entities/dispute.entity';
import { SolarQuote } from './entities/solar-quote.entity';
import { SolarConsultation } from './entities/solar-consultation.entity';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PaymentsModule } from '../payments/payments.module';
import { PricingModule } from '../pricing/pricing.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany } from '../vendor/entities/vendor-company.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { VendorCapabilitySelection } from '../vendor/entities/vendor-capability-selection.entity';
import { VendorCertification } from '../vendor/entities/vendor-certification.entity';
import { ServicePrice } from '../pricing/entities/service-price.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceRequest, AdditionalService, Dispute, SolarQuote, SolarConsultation,
      VendorProfile, VendorCompany, VendorCapability, VendorCapabilitySelection, VendorCertification, ServicePrice,
    ]),
    SubscriptionsModule,
    UsersModule,
    NotificationsModule,
    UploadsModule,
    forwardRef(() => PaymentsModule),
    PricingModule,
    forwardRef(() => InspectionsModule),
  ],
  providers: [ServiceRequestsService, DisputesService],
  controllers: [ServiceRequestsController, DisputesController],
  exports: [ServiceRequestsService, DisputesService],
})
export class ServiceRequestsModule {}
