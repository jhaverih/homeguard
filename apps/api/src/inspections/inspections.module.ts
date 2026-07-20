import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';
import { InspectionConfigService } from './inspection-config.service';
import { InspectionConfigController } from './inspection-config.controller';
import { InspectionChecklistSeedService } from './inspection-checklist-seed.service';
import { InspectionNote } from './entities/inspection.entity';
import { InspectionTaskResult } from './entities/inspection-task-result.entity';
import { InspectionChecklistGroup } from './entities/inspection-checklist-group.entity';
import { InspectionChecklistSubgroup } from './entities/inspection-checklist-subgroup.entity';
import { InspectionChecklistSection } from './entities/inspection-checklist-section.entity';
import { InspectionChecklistTask } from './entities/inspection-checklist-task.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InspectionNote, InspectionTaskResult, ServiceRequest,
      InspectionChecklistGroup, InspectionChecklistSubgroup, InspectionChecklistSection, InspectionChecklistTask,
    ]),
    UploadsModule,
  ],
  providers: [InspectionsService, InspectionConfigService, InspectionChecklistSeedService],
  controllers: [InspectionsController, InspectionConfigController],
  exports: [InspectionsService],
})
export class InspectionsModule {}
