import {
  IsIn, IsInt, IsOptional, IsNumber, IsString, IsDateString, Min,
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

  // Only used for the 3 manual-quantity project services (Sod/Plant/
  // Gravel-Rock Installation) — every other service resolves its qty from
  // the customer's saved MarketplaceLawncarePropertyProfile automatically,
  // and this field is ignored if provided.
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
}

export class BookLawncareServiceDto {
  @IsString()
  serviceKey: string;

  // Required only for the 3 manual-quantity project services — enforced at
  // runtime in MarketplaceService, not here, since the requirement depends
  // on which serviceKey was chosen.
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @IsDateString()
  preferredDate: string;
}

export class SubscribeLawncarePackageDto {
  @IsString()
  packageKey: string;
}

export class UpsertLawncarePropertyProfileDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  propertySizeSqFt?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  shrubPlantCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bedSqFt?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gutterLinearFt?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  irrigationZones?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  treeCountSmall?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  treeCountMedium?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  treeCountLarge?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lightingFixtureCount?: number;
}
