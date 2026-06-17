import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';
import { InspectionNote } from './entities/inspection.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InspectionNote])],
  providers: [InspectionsService],
  controllers: [InspectionsController],
  exports: [InspectionsService],
})
export class InspectionsModule {}
