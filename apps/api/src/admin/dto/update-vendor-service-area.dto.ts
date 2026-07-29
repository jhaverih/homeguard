import { IsArray, IsOptional, IsString } from 'class-validator';

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
  @IsArray()
  @IsString({ each: true })
  serviceCounties?: string[];
}
