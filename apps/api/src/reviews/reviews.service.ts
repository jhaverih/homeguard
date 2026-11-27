import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { ServiceRequestStatus } from '../common/enums/role.enum';
import { JobEventsService, minutesBetween } from '../job-events/job-events.service';
import { JobEventType } from '../job-events/job-event.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private reviewsRepo: Repository<Review>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    private events: JobEventsService,
  ) {}

  async create(customerId: string, dto: {
    serviceRequestId: string;
    rating: number;
    comment?: string;
  }): Promise<Review> {
    const req = await this.requestsRepo.findOne({ where: { id: dto.serviceRequestId } });
    if (!req) throw new BadRequestException('Service request not found');
    if (req.customerId !== customerId) throw new BadRequestException('Not your request');
    if (req.status !== ServiceRequestStatus.COMPLETED) throw new BadRequestException('Job not completed yet');
    if (dto.rating < 1 || dto.rating > 5) throw new BadRequestException('Rating must be 1–5');

    const existing = await this.reviewsRepo.findOne({ where: { serviceRequestId: dto.serviceRequestId } });
    if (existing) throw new BadRequestException('Already reviewed');

    const review = this.reviewsRepo.create({
      serviceRequestId: dto.serviceRequestId,
      customerId,
      vendorId: req.vendorId,
      rating: dto.rating,
      comment: dto.comment,
    });
    const saved = await this.reviewsRepo.save(review);
    await this.events.record(JobEventType.REVIEW_SUBMITTED, req, { role: 'CUSTOMER', id: customerId }, {
      rating: dto.rating, hasComment: !!dto.comment?.trim(),
      hoursAfterCompletion: req.completedAt ? Math.round((minutesBetween(req.completedAt, new Date())! / 60) * 10) / 10 : undefined,
    });
    return saved;
  }

  async getForVendor(vendorId: string): Promise<{ reviews: Review[]; averageRating: number; totalCount: number }> {
    const reviews = await this.reviewsRepo.find({
      where: { vendorId },
      order: { createdAt: 'DESC' },
    });
    const totalCount = reviews.length;
    const averageRating = totalCount > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / totalCount) * 10) / 10
      : 0;
    return { reviews, averageRating, totalCount };
  }

  async getMyReview(customerId: string, serviceRequestId: string): Promise<Review | null> {
    return this.reviewsRepo.findOne({ where: { serviceRequestId, customerId } });
  }
}
