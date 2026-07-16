import {
  IsEnum, IsOptional, IsString,
} from 'class-validator';
import { CancellationReasonCode, CancellationType } from '../entities/cancellation-feedback.entity';

export class CreateCancellationFeedbackDto {
  @IsEnum(CancellationType)
  type: CancellationType;

  @IsString()
  @IsOptional()
  subscriptionId?: string;

  @IsString()
  @IsOptional()
  serviceRequestId?: string;

  @IsEnum(CancellationReasonCode)
  reasonCode: CancellationReasonCode;

  @IsString()
  @IsOptional()
  comment?: string;
}
