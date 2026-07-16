import { IsIn, IsOptional, IsDateString } from 'class-validator';

export class SetVendorPlanDto {
  @IsIn(['STANDARD', 'ELITE'])
  tier: 'STANDARD' | 'ELITE';

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
