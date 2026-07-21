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

  // Every service's qty defaults from the customer's saved
  // MarketplaceLawncarePropertyProfile, but the mobile add-on UI lets the
  // customer override it for this specific booking — so qty is always
  // accepted here, not just for the 3 manual-quantity project services.
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  // Only applies to services with a non-empty frequencyDiscounts array
  // (e.g. Lawn Mowing's "WEEKLY"/"BIWEEKLY") — ignored otherwise.
  @IsOptional()
  @IsString()
  frequency?: string;
}

export class BookLawncareServiceDto {
  @IsString()
  serviceKey: string;

  // Required for the 3 manual-quantity project services; for every other
  // service this overrides the property-profile-resolved qty if provided
  // (the mobile UI pre-fills it from the profile but lets the customer
  // adjust it for this specific booking), or falls back to the profile if
  // omitted. Enforced at runtime in MarketplaceService, not here, since the
  // requirement depends on which serviceKey was chosen.
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  // Only applies to services with a non-empty frequencyDiscounts array.
  @IsOptional()
  @IsString()
  frequency?: string;

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
