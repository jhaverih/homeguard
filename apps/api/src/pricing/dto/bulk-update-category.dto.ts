import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { ServiceCategory } from '../../common/enums/service-category.enum';

export class BulkUpdateCategoryDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @IsEnum(ServiceCategory)
  @IsOptional()
  category: ServiceCategory | null;
}
