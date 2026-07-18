import {
  IsString, IsNumber, IsBoolean, IsOptional, IsEnum, IsArray, Min,
} from 'class-validator';
import { PricingMethod } from '../../common/enums/pricing-method.enum';
import { ServiceCategory } from '../../common/enums/service-category.enum';
import { ServiceGroup } from '../../common/enums/service-group.enum';

export class CreatePricingDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsNumber()
  @IsOptional()
  markupPercent?: number | null;

  @IsEnum(PricingMethod)
  @IsOptional()
  pricingMethod?: PricingMethod;

  @IsBoolean()
  @IsOptional()
  requiresQuote?: boolean;

  @IsString()
  @IsOptional()
  quantityLabel?: string | null;

  @IsNumber()
  @IsOptional()
  minimumQuantity?: number | null;

  @IsNumber()
  @IsOptional()
  includeQty?: number | null;

  @IsNumber()
  @IsOptional()
  baseRateUnit?: number | null;

  @IsNumber()
  @IsOptional()
  volumeDiscountThreshold?: number | null;

  @IsNumber()
  @IsOptional()
  volumeDiscountRate?: number | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  requiredCapabilityId?: string | null;

  @IsEnum(ServiceCategory)
  @IsOptional()
  category?: ServiceCategory | null;

  @IsArray()
  @IsEnum(ServiceGroup, { each: true })
  @IsOptional()
  serviceGroups?: ServiceGroup[] | null;

  @IsBoolean()
  @IsOptional()
  customerRequestable?: boolean;
}
