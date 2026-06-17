import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceRequest, ServiceType } from './entities/service-request.entity';
import { AdditionalService } from './entities/additional-service.entity';
import { ServiceRequestStatus, UserRole } from '../common/enums/role.enum';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.service';

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    @InjectRepository(AdditionalService)
    private additionalRepo: Repository<AdditionalService>,
    private subscriptionsService: SubscriptionsService,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
  ) {}

  async create(customerId: string, dto: {
    preferredDate: string;
    customerNotes?: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  }): Promise<ServiceRequest> {
    const subscription = await this.subscriptionsService.getActiveSubscription(customerId);
    if (!subscription) throw new BadRequestException('No active subscription found');
    if (subscription.inspectionsRemaining <= 0) {
      throw new BadRequestException('No inspections remaining on your subscription');
    }

    const request = this.requestsRepo.create({
      customerId,
      subscriptionId: subscription.id,
      type: ServiceType.SCHEDULED_INSPECTION,
      status: ServiceRequestStatus.PENDING,
      preferredDate: new Date(dto.preferredDate),
      customerNotes: dto.customerNotes,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      zipCode: dto.zipCode,
    });

    const saved = await this.requestsRepo.save(request);

    const vendors = await this.usersService.findAvailableVendors();
    if (vendors.length > 0) {
      await this.notificationsService.notifyVendors(
        vendors,
        NotificationType.NEW_REQUEST,
        'New Inspection Request',
        `A customer in ${dto.city}, ${dto.state} needs an inspection.`,
        { serviceRequestId: saved.id },
      );
    }

    return saved;
  }

  async accept(requestId: string, vendorId: string, scheduledDate: string): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.status !== ServiceRequestStatus.PENDING) {
      throw new BadRequestException('Request is no longer available');
    }

    request.vendorId = vendorId;
    request.scheduledDate = new Date(scheduledDate);
    request.status = ServiceRequestStatus.ACCEPTED;
    const saved = await this.requestsRepo.save(request);

    await this.notificationsService.notifyUser(
      request.customerId,
      NotificationType.REQUEST_ACCEPTED,
      'Vendor Accepted Your Request',
      `Your inspection has been scheduled for ${new Date(scheduledDate).toLocaleDateString()}.`,
      { serviceRequestId: saved.id },
    );

    return saved;
  }

  async updateStatus(requestId: string, vendorId: string, status: ServiceRequestStatus): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();

    request.status = status;
    if (status === ServiceRequestStatus.COMPLETED) {
      request.completedAt = new Date();
      await this.subscriptionsService.incrementInspectionsUsed(request.subscriptionId);
    }
    const saved = await this.requestsRepo.save(request);

    const notifMap: Partial<Record<ServiceRequestStatus, { type: NotificationType; title: string; body: string }>> = {
      [ServiceRequestStatus.VENDOR_EN_ROUTE]: {
        type: NotificationType.VENDOR_EN_ROUTE,
        title: 'Vendor On The Way',
        body: 'Your vendor is heading to your home.',
      },
      [ServiceRequestStatus.IN_PROGRESS]: {
        type: NotificationType.VENDOR_ARRIVED,
        title: 'Vendor Has Arrived',
        body: 'Your vendor has arrived and started the inspection.',
      },
      [ServiceRequestStatus.COMPLETED]: {
        type: NotificationType.JOB_COMPLETED,
        title: 'Inspection Complete',
        body: 'Your inspection has been completed. Check the notes in the app.',
      },
    };

    const notif = notifMap[status];
    if (notif) {
      await this.notificationsService.notifyUser(
        request.customerId,
        notif.type,
        notif.title,
        notif.body,
        { serviceRequestId: saved.id },
      );
    }

    return saved;
  }

  async addVendorNotes(requestId: string, vendorId: string, notes: string): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();
    request.vendorNotes = notes;
    return this.requestsRepo.save(request);
  }

  async recommendAdditionalService(
    requestId: string, vendorId: string,
    dto: { name: string; description: string; price: number },
  ): Promise<AdditionalService> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();

    const service = this.additionalRepo.create({ ...dto, serviceRequestId: requestId });
    const saved = await this.additionalRepo.save(service);

    await this.notificationsService.notifyUser(
      request.customerId,
      NotificationType.ADDITIONAL_SERVICE_RECOMMENDED,
      'Additional Service Recommended',
      `Your vendor recommends: ${dto.name} ($${dto.price})`,
      { serviceRequestId: requestId, additionalServiceId: saved.id },
    );

    return saved;
  }

  async approveAdditionalService(serviceId: string, customerId: string): Promise<AdditionalService> {
    const service = await this.additionalRepo.findOne({
      where: { id: serviceId },
      relations: ['serviceRequest'],
    });
    if (!service) throw new NotFoundException();
    if (service.serviceRequest.customerId !== customerId) throw new ForbiddenException();

    service.approved = true;
    service.approvedAt = new Date();
    const saved = await this.additionalRepo.save(service);

    await this.notificationsService.notifyUser(
      service.serviceRequest.vendorId,
      NotificationType.ADDITIONAL_SERVICE_APPROVED,
      'Additional Service Approved',
      `Customer approved: ${service.name}`,
      { serviceRequestId: service.serviceRequestId },
    );

    return saved;
  }

  async getCustomerRequests(customerId: string): Promise<ServiceRequest[]> {
    return this.requestsRepo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async getVendorRequests(vendorId: string): Promise<ServiceRequest[]> {
    return this.requestsRepo.find({
      where: { vendorId },
      order: { scheduledDate: 'ASC' },
    });
  }

  async getPendingRequests(): Promise<ServiceRequest[]> {
    return this.requestsRepo.find({
      where: { status: ServiceRequestStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string): Promise<ServiceRequest> {
    const req = await this.requestsRepo.findOne({ where: { id } });
    if (!req) throw new NotFoundException('Service request not found');
    return req;
  }

  async reschedule(
    requestId: string,
    userId: string,
    newDate: string,
  ): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.customerId !== userId && request.vendorId !== userId) throw new ForbiddenException();

    request.scheduledDate = new Date(newDate);
    const saved = await this.requestsRepo.save(request);

    const otherPartyId = request.customerId === userId ? request.vendorId : request.customerId;
    if (otherPartyId) {
      await this.notificationsService.notifyUser(
        otherPartyId,
        NotificationType.SCHEDULE_CHANGED,
        'Schedule Updated',
        `The inspection has been rescheduled to ${new Date(newDate).toLocaleDateString()}.`,
        { serviceRequestId: saved.id },
      );
    }

    return saved;
  }
}
