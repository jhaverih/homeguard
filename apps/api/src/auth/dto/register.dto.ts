import {
  IsEmail, IsString, IsEnum, IsArray, IsOptional, IsNotEmpty, ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/role.enum';
import { IsStrongPassword } from '../../common/validators/password-policy';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, description: '8+ chars, uppercase, lowercase, number, special character' })
  @IsString()
  @IsStrongPassword()
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '+1-555-000-0000', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: UserRole, isArray: true, example: [UserRole.CUSTOMER] })
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];

  // Required for customer registrations, irrelevant (and left unvalidated) for
  // vendor-only registrations, which never send these — see companyAddress
  // etc. below for the vendor equivalent. @ValidateIf skips every other
  // decorator on the property entirely when the role condition is false, so
  // this doesn't need @IsOptional() alongside it.
  @ApiProperty({ example: '123 Main St', required: false })
  @ValidateIf((o) => o.roles?.includes(UserRole.CUSTOMER))
  @IsNotEmpty({ message: 'Address is required' })
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Miami', required: false })
  @ValidateIf((o) => o.roles?.includes(UserRole.CUSTOMER))
  @IsNotEmpty({ message: 'City is required' })
  @IsString()
  city?: string;

  @ApiProperty({ example: 'FL', required: false })
  @ValidateIf((o) => o.roles?.includes(UserRole.CUSTOMER))
  @IsNotEmpty({ message: 'State is required' })
  @IsString()
  state?: string;

  @ApiProperty({ example: '33101', required: false })
  @ValidateIf((o) => o.roles?.includes(UserRole.CUSTOMER))
  @IsNotEmpty({ message: 'Zip code is required' })
  @IsString()
  zipCode?: string;

  @ApiProperty({ example: 'Acme Home Services LLC', required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: '12-3456789', required: false, description: 'Vendor company EIN, collected at vendor registration' })
  @IsOptional()
  @IsString()
  ein?: string;

  // Vendor company address, collected at vendor registration — distinct from
  // address/city/state/zipCode above, which are the CustomerProfile fields.
  // Previously the mobile form sent these but nothing declared them here, so
  // the global whitelist ValidationPipe silently stripped them before this
  // DTO was even constructed. Required for vendor registrations, same
  // @ValidateIf pattern as the customer fields above.
  @ApiProperty({ example: '456 Business Ave', required: false })
  @ValidateIf((o) => o.roles?.includes(UserRole.VENDOR))
  @IsNotEmpty({ message: 'Company address is required' })
  @IsString()
  companyAddress?: string;

  @ApiProperty({ example: 'Nashville', required: false })
  @ValidateIf((o) => o.roles?.includes(UserRole.VENDOR))
  @IsNotEmpty({ message: 'Company city is required' })
  @IsString()
  companyCity?: string;

  @ApiProperty({ example: 'TN', required: false })
  @ValidateIf((o) => o.roles?.includes(UserRole.VENDOR))
  @IsNotEmpty({ message: 'Company state is required' })
  @IsString()
  companyState?: string;

  @ApiProperty({ example: '37201', required: false })
  @ValidateIf((o) => o.roles?.includes(UserRole.VENDOR))
  @IsNotEmpty({ message: 'Company zip code is required' })
  @IsString()
  companyZipCode?: string;
}
