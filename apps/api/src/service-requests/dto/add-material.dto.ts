import { IsString, IsNumber, Min, MinLength } from 'class-validator';

export class AddMaterialDto {
  @IsString()
  @MinLength(1)
  description: string;

  @IsNumber()
  @Min(0.01)
  cost: number;
}
