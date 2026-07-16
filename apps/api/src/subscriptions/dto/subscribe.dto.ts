import { IsBoolean, IsOptional } from 'class-validator';

export class SubscribeDto {
  @IsBoolean()
  @IsOptional()
  acceptedTerms?: boolean;
}
