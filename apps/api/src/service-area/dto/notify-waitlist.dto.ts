import { IsEmail, IsString, Length } from 'class-validator';

export class NotifyWaitlistDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(5, 5)
  zip: string;
}
