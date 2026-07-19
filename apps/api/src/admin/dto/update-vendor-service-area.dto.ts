import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateVendorServiceAreaDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  baseZipCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  serviceRadiusMiles?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceCounties?: string[];
}
