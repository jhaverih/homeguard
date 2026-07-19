import { Type } from 'class-transformer';
import {
  IsEnum, IsObject, IsArray, IsString, IsOptional, IsInt, Min, ValidateNested,
} from 'class-validator';
import { CleaningType, VisitFrequency } from '../enums/marketplace.enum';

export class AddOnSelectionDto {
  @IsString()
  key: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
}

export class QuoteHouseCleaningDto {
  @IsEnum(CleaningType)
  cleaningType: CleaningType;

  @IsEnum(VisitFrequency)
  visitFrequency: VisitFrequency;

  // Keyed by MarketplaceRoomUnit.key, e.g. { bedroom: 3, bathroom_full: 2 }
  @IsObject()
  houseConfig: Record<string, number>;

  @IsArray()
  @IsString({ each: true })
  conditions: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddOnSelectionDto)
  @IsOptional()
  addOns?: AddOnSelectionDto[];
}
