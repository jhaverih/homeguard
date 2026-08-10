import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailService } from '../common/email/email.service';
import { UserStatus } from '../common/enums/role.enum';
import { emailEquals } from '../common/utils/email.util';

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async register(dto: RegisterDto) {
    const created = await this.usersService.create(dto);
    const user = await this.usersService.findById(created.id);
    const token = this.jwtService.sign({ sub: user.id, email: user.email });

    // A flaky send shouldn't fail account creation — the account/password
    // are already valid regardless. emailSent lets the client tell the user
    // if the code genuinely didn't go out, instead of always claiming it did.
    let emailSent = true;
    try {
      await this.sendVerificationCode(user);
    } catch {
      emailSent = false;
    }

    return { accessToken: token, user, emailSent };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This account has been suspended');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('EMAIL_NOT_VERIFIED');
    }

    const fullUser = await this.usersService.findById(user.id);
    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { accessToken: token, user: fullUser };
  }

  // Lets a user fix a mistyped email while still on the registration wizard's
  // verify step, before they've ever successfully logged in with it — scoped
  // to unverified accounts only, not a general "change my email" endpoint.
  async updatePendingEmail(userId: string, newEmail: string): Promise<{ message: string }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('Email is already verified');

    const existing = await this.usersRepo.findOne({ where: { email: emailEquals(newEmail) } });
    if (existing && existing.id !== userId) throw new ConflictException('That email is already in use');

    await this.usersRepo.update(userId, { email: newEmail });
    const updated = await this.usersRepo.findOne({ where: { id: userId } });
    try {
      await this.sendVerificationCode(updated!);
    } catch {
      throw new BadRequestException('Email updated, but we could not send a code to it right now — please try Resend in a moment.');
    }
    return { message: 'Verification code sent to new email' };
  }

  async verifyEmail(email: string, code: string): Promise<{ message: string }> {
    // emailVerificationCode is select: false by default (see user.entity.ts) — opt
    // back in explicitly here, the one legitimate place that needs to compare it.
    const user = await this.usersRepo.findOne({
      where: { email: emailEquals(email) },
      select: ['id', 'email', 'isEmailVerified', 'emailVerificationCode', 'emailVerificationExpiry'],
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) return { message: 'Already verified' };

    if (
      !user.emailVerificationCode ||
      user.emailVerificationCode !== code ||
      !user.emailVerificationExpiry ||
      new Date() > user.emailVerificationExpiry
    ) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    await this.usersRepo.update(user.id, {
      isEmailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiry: null,
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.usersRepo.findOne({ where: { email: emailEquals(email) } });
    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) return { message: 'Already verified' };

    try {
      await this.sendVerificationCode(user);
    } catch {
      throw new BadRequestException('Could not send the verification email right now — please try again in a moment.');
    }
    return { message: 'Verification code sent' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    // Always return success to prevent email enumeration
    const user = await this.usersRepo.findOne({ where: { email: emailEquals(email) } });
    if (user) {
      const token = await this.issuePasswordResetToken(user.id);
      await this.emailService.sendPasswordReset(email, token);
    }
    return { message: 'If that email is registered, a reset code was sent.' };
  }

  async issuePasswordResetToken(userId: string): Promise<string> {
    const token = randomCode();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.usersRepo.update(userId, {
      passwordResetToken: token,
      passwordResetExpiry: expiry,
    });
    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.usersRepo.findOne({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpiry || new Date() > user.passwordResetExpiry) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.usersRepo.update(user.id, {
      password: hashed,
      passwordResetToken: null,
      passwordResetExpiry: null,
    });

    return { message: 'Password updated successfully' };
  }

  private async sendVerificationCode(user: User): Promise<void> {
    const code = randomCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await this.usersRepo.update(user.id, {
      emailVerificationCode: code,
      emailVerificationExpiry: expiry,
    });
    await this.emailService.sendVerificationCode(user.email, code);
  }
}
