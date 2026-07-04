import {
  Controller, Get, Post, Patch, Body, Param, UseGuards, Request,
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
  @ApiOperation({ summary: 'Customer: create a new service request' })
  create(@Request() req, @Body() body: any) {
    return this.service.create(req.user.id, body);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my service requests (customer view)' })
  getMyRequests(@Request() req) {
    return this.service.getCustomerRequests(req.user.id);
  }

  @Get('vendor/my')
  @ApiOperation({ summary: 'Get my assigned jobs (vendor view)' })
  getMyVendorJobs(@Request() req) {
    return this.service.getVendorRequests(req.user.id);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Vendor: get all open requests to accept' })
  getPending() {
    return this.service.getPendingRequests();
  }

  @Get('additional-services/pending')
  @ApiOperation({ summary: 'Customer: get all unapproved additional service recommendations' })
  getPendingAdditionalServices(@Request() req) {
    return this.service.getPendingAdditionalServices(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.service.findByIdForUser(id, req.user.id);
  }

  @Get(':id/with-photos')
  findOneWithPhotos(@Request() req, @Param('id') id: string) {
    return this.service.findByIdWithPhotos(id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Vendor: accept a request and set scheduled date' })
  accept(@Request() req, @Param('id') id: string, @Body() body: { scheduledDate: string }) {
    return this.service.accept(id, req.user.id, body.scheduledDate);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Vendor: update request status (en-route, in-progress, completed)' })
  updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: ServiceRequestStatus; completionPhotoKeys?: string[] },
  ) {
    return this.service.updateStatus(id, req.user.id, body.status, body.completionPhotoKeys);
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
}
