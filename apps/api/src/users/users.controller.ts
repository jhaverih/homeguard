import { Controller, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UserRole } from '../common/enums/role.enum';

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
  updatePushToken(@Request() req, @Body() body: { token: string }) {
    return this.usersService.updatePushToken(req.user.id, body.token);
  }

  @Patch('me')
  updateProfile(@Request() req, @Body() body: any) {
    return this.usersService.updateProfile(req.user.id, body);
  }
}
