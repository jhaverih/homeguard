import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';
import { InspectionNote } from './entities/inspection.entity';
import { InspectionTaskResult } from './entities/inspection-task-result.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [TypeOrmModule.forFeature([InspectionNote, InspectionTaskResult, ServiceRequest]), UploadsModule],
  providers: [InspectionsService],
  controllers: [InspectionsController],
  exports: [InspectionsService],
})
export class InspectionsModule {}
