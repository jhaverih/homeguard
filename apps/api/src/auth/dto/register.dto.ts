import { IsEmail, IsString, IsEnum, IsArray, IsOptional } from 'class-validator';
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

  @ApiProperty({ example: '123 Main St', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Miami', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'FL', required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ example: '33101', required: false })
  @IsOptional()
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
}
