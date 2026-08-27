import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, Request, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UserRole } from '../common/enums/role.enum';
import { IsStrongPassword } from '../common/validators/password-policy';

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @IsStrongPassword() newPassword: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Request() req) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me/role')
  switchRole(@Request() req, @Body() body: { role: UserRole }) {
    return this.usersService.updateActiveRole(req.user.id, body.role);
  }

  @Patch('me/push-token')
  updatePushToken(@Request() req, @Body() body: { token: string; fcmDeviceToken?: string }) {
    return this.usersService.updatePushToken(req.user.id, body.token, body.fcmDeviceToken);
  }

  @Delete('me/push-token')
  @HttpCode(204)
  clearPushToken(@Request() req) {
    return this.usersService.clearPushToken(req.user.id);
  }

  @Patch('me/profile')
  updateProfile(@Request() req, @Body() body: any) {
    return this.usersService.updateProfile(req.user.id, body);
  }

  @Patch('me/password')
  changePassword(@Request() req, @Body() body: ChangePasswordDto) {
    return this.usersService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  @Patch('me/accept-terms')
  acceptTerms(@Request() req, @Body() body: { termsType: 'CUSTOMER' | 'VENDOR' }) {
    return this.usersService.acceptTerms(req.user.id, body.termsType);
  }

  @Get('me/team')
  getTeam(@Request() req) {
    return this.usersService.getTeamMembers(req.user.id);
  }

  @Post('me/team')
  addTeamMember(@Request() req, @Body() body: { email: string }) {
    return this.usersService.addTeamMember(req.user.id, body.email);
  }

  @Delete('me/team/:memberId')
  @HttpCode(204)
  removeTeamMember(@Request() req, @Param('memberId') memberId: string) {
    return this.usersService.removeTeamMember(req.user.id, memberId);
  }
}
