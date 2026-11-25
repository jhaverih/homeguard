import { IsBoolean } from 'class-validator';

export class SetTestAccountDto {
  @IsBoolean()
  isTestAccount: boolean;
}
