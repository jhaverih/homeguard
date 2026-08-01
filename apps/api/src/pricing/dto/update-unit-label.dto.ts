import { IsString, MinLength } from 'class-validator';

export class UpdateUnitLabelDto {
  @IsString()
  @MinLength(1)
  label: string;
}
