import { IsNumber, IsString, Max, Min } from 'class-validator';

export class RequestExtraTimeDto {
  // The booked hourly line the extra time is for.
  @IsString()
  additionalServiceId: string;

  @IsNumber()
  @Min(0.5)
  @Max(12)
  hours: number;
}
