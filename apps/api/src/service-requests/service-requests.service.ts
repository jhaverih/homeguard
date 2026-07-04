import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, forwardRef, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, FindOptionsWhere } from 'typeorm';
import { ServiceRequest, ServiceType } from './entities/service-request.entity';
import { AdditionalService } from './entities/additional-service.entity';
import { ServiceRequestStatus, UserRole, PaymentType } from '../common/enums/role.enum';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { PaymentsService } from '../payments/payments.service';

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
    private uploadsService: UploadsService,
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
  ) {}

  async create(customerId: string, dto: {
    preferredDate: string;
    customerNotes?: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    isPaidAddon?: boolean;
  }): Promise<ServiceRequest> {
    // Family members use the parent's subscription
    const subscriptionOwnerId = await this.usersService.getEffectiveSubscriptionOwnerId(customerId);
    const subscription = await this.subscriptionsService.getActiveSubscription(subscriptionOwnerId);
    if (!subscription) throw new BadRequestException('No active subscription found');

    const pendingCount = await this.requestsRepo.count({
      where: {
        subscriptionId: subscription.id,
        status: Not(In([ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED])),
      },
    });
    const limitReached = subscription.inspectionsUsed + pendingCount >= subscription.plan.inspectionsPerYear;
    if (limitReached && !dto.isPaidAddon) {
      throw new BadRequestException('No inspections remaining on your subscription');
    }

    const addonPrice = limitReached && dto.isPaidAddon
      ? Number(subscription.plan.addonInspectionPrice)
      : null;

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
      isPaidAddon: !!addonPrice,
      addonPrice,
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

  async updateStatus(
    requestId: string,
    vendorId: string,
    status: ServiceRequestStatus,
    completionPhotoKeys?: string[],
  ): Promise<ServiceRequest> {
    const request = await this.findById(requestId);
    if (request.vendorId !== vendorId) throw new ForbiddenException();

    if (status === ServiceRequestStatus.COMPLETED) {
      if (!completionPhotoKeys || completionPhotoKeys.length === 0) {
        throw new BadRequestException('At least one completion photo is required to mark a job complete');
      }
      request.completionPhotoKeys = completionPhotoKeys;
      request.completedAt = new Date();
      await this.subscriptionsService.incrementInspectionsUsed(request.subscriptionId, request.isPaidAddon);

      // Create auth holds for any approved additional services
      const approvedServices = await this.additionalRepo.find({
        where: { serviceRequestId: requestId, approved: true },
      });
      for (const svc of approvedServices) {
        try {
          await this.paymentsService.createAuthHold(
            requestId,
            request.customerId,
            vendorId,
            Number(svc.price),
            svc.name,
            PaymentType.ADDITIONAL_SERVICE,
          );
        } catch (err) {
          // Don't block job completion if payment hold fails
        }
      }
    }

    request.status = status;
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
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    return this.requestsRepo.find({
      where: { customerId: In(relatedIds) } as FindOptionsWhere<ServiceRequest>,
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

  async getPendingAdditionalServices(customerId: string): Promise<AdditionalService[]> {
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    const requests = await this.requestsRepo.find({
      where: { customerId: In(relatedIds) } as FindOptionsWhere<ServiceRequest>,
      select: ['id'],
    });
    if (requests.length === 0) return [];
    const requestIds = requests.map((r) => r.id);
    return this.additionalRepo.find({
      where: { serviceRequestId: In(requestIds), approved: false },
      relations: ['serviceRequest', 'serviceRequest.vendor'],
      order: { createdAt: 'DESC' },
    });
  }

  async cancelRequest(requestId: string, customerId: string): Promise<ServiceRequest> {
    const req = await this.findById(requestId);
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    if (!relatedIds.includes(req.customerId)) throw new ForbiddenException();
    if (req.status === ServiceRequestStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed inspection');
    }
    if (req.status === ServiceRequestStatus.CANCELLED) {
      throw new BadRequestException('Request is already cancelled');
    }
    req.status = ServiceRequestStatus.CANCELLED;
    const saved = await this.requestsRepo.save(req);
    if (req.vendorId) {
      await this.notificationsService.notifyUser(
        req.vendorId,
        NotificationType.JOB_COMPLETED,
        'Inspection Cancelled',
        'The customer has cancelled this inspection request.',
        { serviceRequestId: saved.id },
      );
    }
    return saved;
  }

  async findById(id: string): Promise<ServiceRequest> {
    const req = await this.requestsRepo.findOne({
      where: { id },
      relations: ['additionalServices', 'vendor', 'vendor.vendorProfile', 'customer'],
    });
    if (!req) throw new NotFoundException('Service request not found');
    return req;
  }

  async findByIdWithPhotos(id: string): Promise<any> {
    const req = await this.findById(id);
    const completionPhotoUrls = await Promise.all(
      (req.completionPhotoKeys || []).map((key) =>
        this.uploadsService.getSignedUrl(key).catch(() => null),
      ),
    );
    return { ...req, completionPhotoUrls: completionPhotoUrls.filter(Boolean) };
  }

  async findByIdForUser(id: string, userId: string): Promise<ServiceRequest> {
    const req = await this.findById(id);
    if (req.vendorId === userId) return req;
    if (req.status === ServiceRequestStatus.PENDING) return req;

    // Allow family members and parent to view each other's requests
    const relatedIds = await this.usersService.getRelatedCustomerIds(userId);
    if (relatedIds.includes(req.customerId)) return req;

    throw new ForbiddenException();
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
