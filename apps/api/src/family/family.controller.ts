import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsStrongPassword } from '../common/validators/password-policy';
import { FamilyInvitesService, PublicInvite } from './family-invites.service';
import { renderInvitePage } from './invite-page';

class CreateFamilyInviteDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() @MaxLength(60) firstName?: string;
}

class InviteCodeDto {
  @IsString() @IsNotEmpty() @MaxLength(20) code: string;
}

class RegisterInvitedDto {
  @IsString() @IsNotEmpty() @MaxLength(20) code: string;
  @IsString() @IsNotEmpty() @MaxLength(60) firstName: string;
  @IsString() @IsNotEmpty() @MaxLength(60) lastName: string;
  @IsString() @IsStrongPassword() password: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

// Family invitations, for the signed-in account holder and invitee.
@ApiTags('Family')
@UseGuards(JwtAuthGuard)
@Controller('users/me/family-invites')
export class FamilyController {
  constructor(private readonly service: FamilyInvitesService) {}

  @Get()
  @ApiOperation({ summary: 'Invitations I sent that are still open' })
  listSent(@Request() req) {
    return this.service.listSent(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Invite someone by email to join my home' })
  invite(@Request() req, @Body() dto: CreateFamilyInviteDto) {
    return this.service.invite(req.user.id, dto.email, dto.firstName).then((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt }));
  }

  @Post(':id/resend')
  @HttpCode(200)
  resend(@Request() req, @Param('id') id: string) {
    return this.service.resend(req.user.id, id).then((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt }));
  }

  @Delete(':id')
  cancel(@Request() req, @Param('id') id: string) {
    return this.service.cancel(req.user.id, id);
  }

  @Get('received')
  @ApiOperation({ summary: 'Open invitations sent to my email' })
  received(@Request() req): Promise<PublicInvite[]> {
    return this.service.received(req.user.id);
  }

  @Post('accept')
  @HttpCode(200)
  accept(@Request() req, @Body() dto: InviteCodeDto) {
    return this.service.accept(req.user.id, dto.code);
  }

  @Post('decline')
  @HttpCode(200)
  decline(@Request() req, @Body() dto: InviteCodeDto) {
    return this.service.decline(req.user.id, dto.code);
  }
}

// Reachable without signing in: the Join link in the email, the code lookup
// the app does before sign-up, and the sign-up itself. Throttled like the
// other public routes so codes can't be guessed in bulk.
@ApiTags('Family (public)')
@Controller()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { ttl: 60000, limit: 20 } })
export class FamilyPublicController {
  constructor(private readonly service: FamilyInvitesService) {}

  @Get('invite/:code')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async page(@Param('code') code: string): Promise<string> {
    const info = await this.service.publicInfo(code).catch(() => null);
    return renderInvitePage(info, code);
  }

  @Get('public/family-invites/:code')
  @ApiOperation({ summary: 'Who sent this invitation, and is it still open?' })
  info(@Param('code') code: string) {
    return this.service.publicInfo(code);
  }

  @Post('auth/register-invited')
  @ApiOperation({ summary: 'Create an account from a family invitation and join the home' })
  registerInvited(@Body() dto: RegisterInvitedDto) {
    return this.service.registerInvited(dto);
  }
}
