import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Dispute } from './entities/dispute.entity';
import { ServiceRequest } from './entities/service-request.entity';
import { DisputeCategory, DisputeStatus } from '../common/enums/role.enum';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute)
    private disputesRepo: Repository<Dispute>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    private notificationsService: NotificationsService,
    private uploadsService: UploadsService,
    private usersService: UsersService,
  ) {}

  async openDispute(
    customerId: string,
    dto: {
      serviceRequestId: string;
      vendorId: string;
      stripePaymentIntentId?: string;
      category: DisputeCategory;
      description: string;
      photoKeys?: string[];
    },
  ): Promise<Dispute> {
    if (!dto.description || dto.description.trim().length < 20) {
      throw new BadRequestException('Description must be at least 20 characters');
    }

    // Any family member can dispute a shared household job — "same rights".
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    const request = await this.requestsRepo.findOne({ where: { id: dto.serviceRequestId } });
    if (!request || !relatedIds.includes(request.customerId)) {
      throw new ForbiddenException('That service request does not belong to your account');
    }

    const existing = await this.disputesRepo.findOne({
      where: { serviceRequestId: dto.serviceRequestId, customerId: In(relatedIds), status: DisputeStatus.OPEN },
    });
    if (existing) throw new BadRequestException('A dispute is already open for this job');

    const dispute = this.disputesRepo.create({
      serviceRequestId: dto.serviceRequestId,
      customerId,
      vendorId: dto.vendorId,
      stripePaymentIntentId: dto.stripePaymentIntentId,
      category: dto.category,
      description: dto.description,
      photoKeys: dto.photoKeys || [],
      status: DisputeStatus.OPEN,
    });
    const saved = await this.disputesRepo.save(dispute);

    await this.notificationsService.notifyUser(
      dto.vendorId,
      NotificationType.PAYMENT_PROCESSED,
      'Customer Dispute Opened',
      'A customer has raised a concern about a completed job. Payment is on hold pending HomeGuard review.',
      { serviceRequestId: dto.serviceRequestId, disputeId: saved.id },
    );

    return saved;
  }

  async getCustomerDisputes(customerId: string): Promise<any[]> {
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    const disputes = await this.disputesRepo.find({
      where: { customerId: In(relatedIds) },
      order: { createdAt: 'DESC' },
    });
    return this.resolvePhotos(disputes);
  }

  async getAll(): Promise<any[]> {
    const disputes = await this.disputesRepo.find({
      relations: ['serviceRequest'],
      order: { createdAt: 'DESC' },
    });
    return this.resolvePhotos(disputes);
  }

  async resolve(
    disputeId: string,
    resolution: DisputeStatus.RESOLVED_CUSTOMER | DisputeStatus.RESOLVED_VENDOR,
    note: string,
  ): Promise<Dispute> {
    const dispute = await this.disputesRepo.findOne({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.UNDER_REVIEW) {
      throw new BadRequestException('Dispute is already resolved');
    }

    dispute.status = resolution;
    dispute.resolution = note;
    dispute.resolvedAt = new Date();
    const saved = await this.disputesRepo.save(dispute);

    const customerMsg = resolution === DisputeStatus.RESOLVED_CUSTOMER
      ? 'Your dispute has been resolved in your favor. The charge has been voided.'
      : 'HomeGuard has reviewed your dispute. The payment has been released to your vendor.';
    const vendorMsg = resolution === DisputeStatus.RESOLVED_VENDOR
      ? 'The customer dispute has been resolved in your favor. Payment will be released shortly.'
      : 'HomeGuard has reviewed the dispute and voided the charge for this job.';

    await Promise.all([
      this.notificationsService.notifyUser(
        dispute.customerId, NotificationType.PAYMENT_PROCESSED,
        'Dispute Resolved', customerMsg, { disputeId },
      ),
      this.notificationsService.notifyUser(
        dispute.vendorId, NotificationType.PAYMENT_PROCESSED,
        'Dispute Resolved', vendorMsg, { disputeId },
      ),
    ]);

    return saved;
  }

  private async resolvePhotos(disputes: Dispute[]): Promise<any[]> {
    return Promise.all(
      disputes.map(async (d) => {
        const photoUrls = await Promise.all(
          (d.photoKeys || []).map((key) => this.uploadsService.getSignedUrl(key).catch(() => null)),
        );
        return { ...d, photoUrls: photoUrls.filter(Boolean) };
      }),
    );
  }
}
