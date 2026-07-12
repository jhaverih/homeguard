import { IsEmail, IsString, IsEnum } from 'class-validator';
import { AdminLevel } from '../../common/enums/admin-level.enum';

export class CreateTeamUserDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEnum(AdminLevel)
  adminLevel: AdminLevel;
}
