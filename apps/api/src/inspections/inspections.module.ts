import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';
import { InspectionNote } from './entities/inspection.entity';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [TypeOrmModule.forFeature([InspectionNote]), UploadsModule],
  providers: [InspectionsService],
  controllers: [InspectionsController],
  exports: [InspectionsService],
})
export class InspectionsModule {}
