import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { ServiceRequestStatus } from '../common/enums/role.enum';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private reviewsRepo: Repository<Review>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
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
    return this.reviewsRepo.save(review);
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
