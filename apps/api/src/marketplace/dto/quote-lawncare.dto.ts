import {
  IsIn, IsInt, IsOptional, IsString, IsDateString, Min,
} from 'class-validator';

export class QuoteLawncareDto {
  @IsIn(['package', 'service'])
  mode: 'package' | 'service';

  @IsOptional()
  @IsString()
  packageKey?: string;

  @IsOptional()
  @IsString()
  serviceKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
}

export class BookLawncareServiceDto {
  @IsString()
  serviceKey: string;

  @IsInt()
  @Min(1)
  qty: number;

  @IsDateString()
  preferredDate: string;
}

export class SubscribeLawncarePackageDto {
  @IsString()
  packageKey: string;
}
