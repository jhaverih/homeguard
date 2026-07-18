import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestStatus } from '../common/enums/role.enum';

@ApiTags('Service Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly service: ServiceRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Customer: create a new inspection request' })
  create(@Request() req, @Body() body: any) {
    return this.service.create(req.user.id, body);
  }

  @Post('standalone')
  @ApiOperation({ summary: 'Customer: request a standalone paid service from the catalog' })
  createStandalone(@Request() req, @Body() body: any) {
    return this.service.createStandaloneService(req.user.id, body);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my service requests (customer view)' })
  async getMyRequests(@Request() req) {
    const requests = await this.service.getCustomerRequests(req.user.id);
    // Getters on the TypeORM entity don't survive JSON serialization — attach
    // explicitly, same as the single-request endpoints. Needed here because
    // the dashboard's "next appointment" card reads etaMinutes from this list.
    return requests.map((r) => ({ ...r, isMonitoringSetupJob: r.isMonitoringSetupJob, etaMinutes: r.etaMinutes }));
  }

  @Get('vendor/my')
  @ApiOperation({ summary: 'Get my assigned jobs (vendor view)' })
  getMyVendorJobs(@Request() req) {
    return this.service.getVendorRequests(req.user.id);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Vendor: get all open requests to accept, filtered by capability/certification/plan tier' })
  getPending(@Request() req) {
    return this.service.getPendingRequests(req.user.id);
  }

  @Get('rejected')
  @ApiOperation({ summary: 'Vendor: get requests this vendor rejected that are still available' })
  getRejected(@Request() req) {
    return this.service.getRejectedRequests(req.user.id);
  }

  @Get('additional-services/pending')
  @ApiOperation({ summary: 'Customer: get all unapproved additional service recommendations' })
  getPendingAdditionalServices(@Request() req) {
    return this.service.getPendingAdditionalServices(req.user.id);
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    const request = await this.service.findByIdForUser(id, req.user.id);
    // Getters on the TypeORM entity don't survive JSON serialization —
    // attach explicitly so the vendor app can scope the Yolink connect card,
    // and the customer app can show a real vendor-en-route ETA.
    return { ...request, isMonitoringSetupJob: request.isMonitoringSetupJob, etaMinutes: request.etaMinutes };
  }

  @Get(':id/with-photos')
  findOneWithPhotos(@Request() req, @Param('id') id: string) {
    return this.service.findByIdWithPhotos(id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Vendor: accept a request and set scheduled date' })
  accept(@Request() req, @Param('id') id: string, @Body() body: { scheduledDate: string; notes?: string }) {
    return this.service.accept(id, req.user.id, body.scheduledDate, body.notes);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Vendor: reject an open request (hides it from Open Requests, trackable, re-acceptable while still PENDING)' })
  reject(@Request() req, @Param('id') id: string) {
    return this.service.rejectRequest(id, req.user.id);
  }

  @Post('group/:bookingGroupId/accept')
  @ApiOperation({ summary: 'Vendor: claim every eligible, still-PENDING request in a multi-service booking group in one action' })
  acceptGroup(@Request() req, @Param('bookingGroupId') bookingGroupId: string, @Body() body: { scheduledDate: string; notes?: string }) {
    return this.service.acceptGroup(bookingGroupId, req.user.id, body.scheduledDate, body.notes);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Vendor: update request status (en-route, in-progress, completed)' })
  updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: ServiceRequestStatus; completionPhotoKeys?: string[]; finalQuantities?: Record<string, number> },
  ) {
    return this.service.updateStatus(id, req.user.id, body.status, body.completionPhotoKeys, body.finalQuantities);
  }

  @Patch(':id/notes')
  @ApiOperation({ summary: 'Vendor: add inspection notes' })
  addNotes(@Request() req, @Param('id') id: string, @Body() body: { notes: string }) {
    return this.service.addVendorNotes(id, req.user.id, body.notes);
  }

  @Post(':id/additional-services')
  @ApiOperation({ summary: 'Vendor: recommend an additional service' })
  recommendService(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.service.recommendAdditionalService(id, req.user.id, body);
  }

  @Post('additional-services/:serviceId/approve')
  @ApiOperation({ summary: 'Customer: approve a recommended additional service' })
  approveService(@Request() req, @Param('serviceId') serviceId: string) {
    return this.service.approveAdditionalService(serviceId, req.user.id);
  }

  @Delete('additional-services/:serviceId/decline')
  @HttpCode(204)
  @ApiOperation({ summary: 'Customer: decline a recommended additional service' })
  declineService(@Request() req, @Param('serviceId') serviceId: string) {
    return this.service.declineAdditionalService(serviceId, req.user.id);
  }

  @Patch(':id/confirm-schedule')
  @ApiOperation({ summary: 'Customer: accept the vendor-proposed scheduled time' })
  confirmSchedule(@Request() req, @Param('id') id: string) {
    return this.service.confirmSchedule(id, req.user.id);
  }

  @Patch(':id/decline-schedule')
  @ApiOperation({ summary: 'Customer: decline the vendor-proposed time (request goes back to PENDING)' })
  declineSchedule(@Request() req, @Param('id') id: string) {
    return this.service.declineSchedule(id, req.user.id);
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule an inspection (customer or vendor)' })
  reschedule(@Request() req, @Param('id') id: string, @Body() body: { newDate: string }) {
    return this.service.reschedule(id, req.user.id, body.newDate);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Customer: cancel an inspection request' })
  cancel(@Request() req, @Param('id') id: string) {
    return this.service.cancelRequest(id, req.user.id);
  }

  @Patch(':id/location')
  @ApiOperation({ summary: 'Vendor: update GPS location while en route' })
  updateLocation(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { latitude: number; longitude: number },
  ) {
    return this.service.updateVendorLocation(id, req.user.id, body.latitude, body.longitude);
  }

  @Patch(':id/vendor-release')
  @ApiOperation({ summary: "Vendor: release a job they can no longer make (breakdown, emergency, etc.) — returns it to the open pool" })
  vendorRelease(@Request() req, @Param('id') id: string) {
    return this.service.vendorReleaseJob(id, req.user.id);
  }

  @Get(':id/solar-quote')
  getSolarQuote(@Param('id') id: string) {
    return this.service.getSolarQuote(id);
  }

  @Post(':id/solar-quote')
  submitSolarQuote(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.service.submitSolarQuote(id, req.user.id, body);
  }

  @Get(':id/solar-consultation')
  getSolarConsultation(@Param('id') id: string) {
    return this.service.getSolarConsultation(id);
  }

  @Post(':id/solar-consultation')
  requestConsultation(@Request() req, @Param('id') id: string, @Body() body: { preferredDate: string }) {
    return this.service.requestConsultation(id, req.user.id, new Date(body.preferredDate));
  }

  @Patch(':id/solar-consultation')
  updateConsultation(@Request() req, @Param('id') id: string, @Body() body: { action: string; proposedDate?: string }) {
    return this.service.updateConsultation(id, req.user.id, {
      action: body.action as any,
      proposedDate: body.proposedDate ? new Date(body.proposedDate) : undefined,
    });
  }
}
