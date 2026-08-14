import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpsertPropertyCharacteristicsDto {
  @IsInt()
  @Min(1)
  squareFootage: number;

  @IsInt()
  @Min(0)
  hvacCount: number;

  @IsInt()
  @Min(0)
  waterHeaterCount: number;

  @IsInt()
  @Min(0)
  bathroomCount: number;

  @IsInt()
  @Min(0)
  kitchenCount: number;

  @IsBoolean()
  @IsOptional()
  hasDetachedGarage?: boolean;
}
