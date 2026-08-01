import { IsString, MinLength } from 'class-validator';

export class CreateUnitLabelDto {
  @IsString()
  @MinLength(1)
  label: string;
}
