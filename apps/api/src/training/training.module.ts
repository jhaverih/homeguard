import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany } from '../vendor/entities/vendor-company.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { VendorCapabilitySelection } from '../vendor/entities/vendor-capability-selection.entity';
import { VendorCapabilityAcknowledgment } from '../vendor/entities/vendor-capability-acknowledgment.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrainingCompletion } from './entities/training-completion.entity';
import { TrainingService } from './training.service';
import { AdminTrainingController, TrainingAssetsController, TrainingController } from './training.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrainingCompletion, User, VendorProfile, VendorCompany, VendorCapability, VendorCapabilitySelection, VendorCapabilityAcknowledgment,
    ]),
    NotificationsModule,
  ],
  providers: [TrainingService],
  controllers: [TrainingController, TrainingAssetsController, AdminTrainingController],
  exports: [TrainingService],
})
export class TrainingModule {}
