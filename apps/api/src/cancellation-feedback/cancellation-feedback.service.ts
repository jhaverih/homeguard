import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CancellationFeedback } from './entities/cancellation-feedback.entity';
import { CreateCancellationFeedbackDto } from './dto/create-cancellation-feedback.dto';

@Injectable()
export class CancellationFeedbackService {
  constructor(
    @InjectRepository(CancellationFeedback)
    private repo: Repository<CancellationFeedback>,
  ) {}

  async create(customerId: string, dto: CreateCancellationFeedbackDto): Promise<CancellationFeedback> {
    const feedback = this.repo.create({
      customerId,
      type: dto.type,
      subscriptionId: dto.subscriptionId ?? null,
      serviceRequestId: dto.serviceRequestId ?? null,
      reasonCode: dto.reasonCode,
      comment: dto.comment ?? null,
    });
    return this.repo.save(feedback);
  }
}
