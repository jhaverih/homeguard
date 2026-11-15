import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

// Body of the public waiting-list signup. Homeowners send email + zip; the
// coming-soon "For pros" page also sends audience 'PRO', the company name and
// the services the pro offers.
export class NotifyWaitlistDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(5, 5)
  zip: string;

  @IsOptional()
  @IsIn(['HOMEOWNER', 'PRO'])
  audience?: 'HOMEOWNER' | 'PRO';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  services?: string[];
}
