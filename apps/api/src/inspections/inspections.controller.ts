import {
  Controller, Get, Post, Put, Body, Param, UseGuards, Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InspectionsService } from './inspections.service';

@ApiTags('Inspections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly service: InspectionsService) {}

  // ── Checklist definition ───────────────────────────────────────────────────

  @Get('checklist/:serviceRequestId')
  @ApiOperation({ summary: "Get this job's checklist — its frozen snapshot if already started, else the live config" })
  getChecklist(@Param('serviceRequestId') serviceRequestId: string) {
    return this.service.getChecklist(serviceRequestId);
  }

  // ── Legacy notes ───────────────────────────────────────────────────────────

  @Post('requests/:requestId/notes')
  addNote(@Request() req, @Param('requestId') requestId: string, @Body() body: any) {
    return this.service.addNote(requestId, req.user.id, body);
  }

  @Get('requests/:requestId/notes')
  getNotes(@Param('requestId') requestId: string) {
    return this.service.getNotes(requestId);
  }

  @Get('history')
  getHistory(@Request() req) {
    return this.service.getHistory(req.user.id);
  }

  // ── Task results ───────────────────────────────────────────────────────────

  @Put('requests/:requestId/tasks/:taskKey')
  @ApiOperation({ summary: 'Vendor: upsert a task result for a checklist item' })
  upsertTask(
    @Request() req,
    @Param('requestId') requestId: string,
    @Param('taskKey') taskKey: string,
    @Body() body: any,
  ) {
    return this.service.upsertTaskResult(requestId, req.user.id, taskKey, body);
  }

  @Get('requests/:requestId/tasks')
  @ApiOperation({ summary: 'Get all task results for a service request' })
  getTasks(@Param('requestId') requestId: string) {
    return this.service.getTaskResults(requestId);
  }

  @Get('requests/:requestId/property-ac-profile-prefill')
  @ApiOperation({ summary: "Vendor: fetch the customer's last-known AC unit/filter details to pre-fill a new inspection's AC Unit task" })
  getPropertyAcProfilePrefill(@Param('requestId') requestId: string) {
    return this.service.getPropertyAcProfilePrefill(requestId);
  }

  @Get('requests/:requestId/progress')
  @ApiOperation({ summary: 'Get checklist completion progress for a service request' })
  getProgress(@Param('requestId') requestId: string) {
    return this.service.getProgress(requestId);
  }

  @Get('customer/task-history')
  @ApiOperation({ summary: 'Customer: get their full task result history across all jobs' })
  getCustomerHistory(@Request() req) {
    return this.service.getTaskHistoryForCustomer(req.user.id);
  }
}
