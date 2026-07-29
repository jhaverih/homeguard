import { Injectable, NotFoundException, BadRequestException, ForbiddenException, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Dispute } from './entities/dispute.entity';
import { ServiceRequest } from './entities/service-request.entity';
import { DisputeCategory, DisputeStatus } from '../common/enums/role.enum';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';

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
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
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

    // Payment is charged immediately at completion now (see
    // PaymentsService.chargeForCompletedService) — disputeWindowExpiresAt is
    // the hard 48-hour deadline to report an issue, not a capture delay.
    // Previously unenforced: filing a dispute after this window had already
    // passed was silently accepted with no effect on the (already-released)
    // payment.
    if (dto.stripePaymentIntentId) {
      const payment = await this.paymentsService.findByStripePaymentIntentId(dto.stripePaymentIntentId);
      if (payment?.disputeWindowExpiresAt && payment.disputeWindowExpiresAt < new Date()) {
        throw new BadRequestException('The 48-hour window to dispute this charge has passed');
      }
    }

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

    // Strip the raw Stripe Payment Intent ID before returning to the customer
    // — internal-only, even though they supplied it in the request that
    // created this row.
    const { stripePaymentIntentId, ...customerSafe } = saved;
    return customerSafe as Dispute;
  }

  async getCustomerDisputes(customerId: string): Promise<any[]> {
    const relatedIds = await this.usersService.getRelatedCustomerIds(customerId);
    const disputes = await this.disputesRepo.find({
      where: { customerId: In(relatedIds) },
      order: { createdAt: 'DESC' },
    });
    return this.resolvePhotos(disputes, { includePaymentIntentId: false });
  }

  async getAll(): Promise<any[]> {
    const disputes = await this.disputesRepo.find({
      relations: ['serviceRequest'],
      order: { createdAt: 'DESC' },
    });
    return this.resolvePhotos(disputes, { includePaymentIntentId: true });
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

    // The job was charged immediately at completion, so resolving in the
    // customer's favor means actually reversing money already paid to the
    // vendor — not voiding a hold that was never captured. Previously this
    // only sent notification text ("the charge has been voided") without
    // ever calling Stripe, which was harmless under the old delayed-capture
    // model but would just be false under this one.
    if (resolution === DisputeStatus.RESOLVED_CUSTOMER && dispute.stripePaymentIntentId) {
      await this.paymentsService.refundForDispute(dispute.stripePaymentIntentId);
    }

    dispute.status = resolution;
    dispute.resolution = note;
    dispute.resolvedAt = new Date();
    const saved = await this.disputesRepo.save(dispute);

    const customerMsg = resolution === DisputeStatus.RESOLVED_CUSTOMER
      ? 'Your dispute has been resolved in your favor. You have been refunded.'
      : 'HomeGuard has reviewed your dispute and found the charge was correct. No refund will be issued.';
    const vendorMsg = resolution === DisputeStatus.RESOLVED_VENDOR
      ? 'The customer dispute has been resolved in your favor. Your payment for this job stands — no action needed.'
      : 'HomeGuard has reviewed the dispute in the customer\'s favor. Your payout for this job has been reversed.';

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

  // includePaymentIntentId: only the admin-facing getAll() sets this true —
  // the raw Stripe Payment Intent ID never goes to a customer response,
  // even though the field itself lives on every row.
  private async resolvePhotos(disputes: Dispute[], options: { includePaymentIntentId: boolean }): Promise<any[]> {
    return Promise.all(
      disputes.map(async (d) => {
        const photoUrls = await Promise.all(
          (d.photoKeys || []).map((key) => this.uploadsService.getSignedUrl(key).catch(() => null)),
        );
        if (options.includePaymentIntentId) {
          return { ...d, photoUrls: photoUrls.filter(Boolean) };
        }
        const { stripePaymentIntentId, ...rest } = d;
        return { ...rest, photoUrls: photoUrls.filter(Boolean) };
      }),
    );
  }
}
