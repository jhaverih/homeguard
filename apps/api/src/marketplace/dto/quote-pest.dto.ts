import {
  IsIn, IsOptional, IsNumber, IsString, IsDateString, Min,
} from 'class-validator';

export class QuotePestDto {
  @IsIn(['package', 'service'])
  mode: 'package' | 'service';

  @IsOptional()
  @IsString()
  packageKey?: string;

  @IsOptional()
  @IsString()
  serviceKey?: string;

  // Home sqft / acreage / manual counts can all be non-integer — unlike
  // Lawncare's mostly-integer qty fields, this is @IsNumber() not @IsInt().
  @IsOptional()
  @IsNumber()
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsString()
  frequency?: string;
}

export class BookPestServiceDto {
  @IsString()
  serviceKey: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsDateString()
  preferredDate: string;
}

export class SubscribePestPackageDto {
  @IsString()
  packageKey: string;
}

export class UpsertPestPropertyProfileDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  homeSqFt?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  propertyAcreage?: number;
}
