import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { MoreThan, Repository } from 'typeorm';
import { FamilyInvite, FamilyInviteStatus } from './family-invite.entity';
import { User } from '../users/entities/user.entity';
import { CustomerProfile } from '../users/entities/customer-profile.entity';
import { CustomerSubscription, SubscriptionStatus } from '../subscriptions/entities/customer-subscription.entity';
import { PlanTier, UserRole, UserStatus } from '../common/enums/role.enum';
import { emailEquals, normalizeEmail } from '../common/utils/email.util';
import { EmailService } from '../common/email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification-type.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { CURRENT_CUSTOMER_TOS_VERSION } from '../common/constants/tos';

export const INVITE_DAYS = 14;
// No 0/O, 1/I/L, so a code read off an email can be typed without guessing.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Codes are shown in groups and typed loosely: "abcd-efgh" → "ABCDEFGH". */
export function normalizeInviteCode(code: string): string {
  return (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** "jordanexample@example.com" → "j•••••••••••e@example.com" (for a page anyone with the code can open). */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain || name.length <= 2) return email;
  return `${name[0]}${'•'.repeat(Math.min(name.length - 2, 12))}${name[name.length - 1]}@${domain}`;
}

export interface PublicInvite {
  code: string;
  inviterName: string;
  inviteeFirstName: string | null;
  maskedEmail: string;
  /** Lets the app tell "sign up" from "sign in" without exposing the address. */
  hasAccount: boolean;
  status: 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
}

// Family invitations: the home's account holder invites someone by email;
// nothing is linked until that person accepts (in the app if they already
// have an account, or by creating one from the invite). Replaces the old
// "add by email", which attached an existing account without asking it.
@Injectable()
export class FamilyInvitesService {
  private readonly logger = new Logger(FamilyInvitesService.name);

  constructor(
    @InjectRepository(FamilyInvite) private invites: Repository<FamilyInvite>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(CustomerProfile) private profiles: Repository<CustomerProfile>,
    @InjectRepository(CustomerSubscription) private subscriptions: Repository<CustomerSubscription>,
    private usersService: UsersService,
    private authService: AuthService,
    private emailService: EmailService,
    private notifications: NotificationsService,
    private config: ConfigService,
  ) {}

  private joinUrl(code: string): string {
    const base = this.config.get<string>('PUBLIC_API_URL', 'https://api.attenteve.com/api').replace(/\/$/, '');
    return `${base}/invite/${code}`;
  }

  private isOpen(i: FamilyInvite, now = new Date()): boolean {
    return i.status === FamilyInviteStatus.PENDING && i.expiresAt > now;
  }

  private async findByCode(code: string): Promise<FamilyInvite> {
    const invite = await this.invites.findOne({ where: { code: normalizeInviteCode(code) } });
    if (!invite) throw new NotFoundException('That invitation code was not found. Check the code in the email.');
    return invite;
  }

  private async findOpenByCode(code: string): Promise<FamilyInvite> {
    const invite = await this.findByCode(code);
    if (invite.status === FamilyInviteStatus.ACCEPTED) throw new BadRequestException('This invitation was already accepted.');
    if (invite.status !== FamilyInviteStatus.PENDING) throw new BadRequestException('This invitation is no longer active. Ask for a new one.');
    if (invite.expiresAt <= new Date()) throw new BadRequestException('This invitation has expired. Ask for a new one.');
    return invite;
  }

  // ── Account holder ────────────────────────────────────────────────────────

  async invite(ownerId: string, rawEmail: string, firstName?: string | null): Promise<FamilyInvite> {
    const owner = await this.usersService.findById(ownerId);
    if (!owner.roles.includes(UserRole.CUSTOMER)) throw new ForbiddenException('Only homeowners can invite family members.');
    if (owner.parentUserId) throw new ForbiddenException("Only the home's account holder can invite family members.");

    const email = normalizeEmail(rawEmail ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address.');
    if (email === normalizeEmail(owner.email)) throw new BadRequestException("You can't invite yourself.");

    const existing = await this.users.findOne({ where: { email: emailEquals(email) } });
    if (existing?.parentUserId === ownerId) throw new ConflictException('This person is already a family member.');
    if (existing?.parentUserId) throw new ConflictException('This person already belongs to another home.');

    // Inviting the same person again refreshes and resends the open invite.
    let invite = await this.invites.findOne({ where: { ownerId, email, status: FamilyInviteStatus.PENDING } });
    if (invite) {
      invite.expiresAt = new Date(Date.now() + INVITE_DAYS * 864e5);
      if (firstName?.trim()) invite.firstName = firstName.trim();
    } else {
      invite = this.invites.create({
        ownerId, email, firstName: firstName?.trim() || null, code: await this.uniqueCode(),
        status: FamilyInviteStatus.PENDING, expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
      });
    }
    invite = await this.invites.save(invite);
    await this.send(invite, owner, existing);
    return invite;
  }

  async resend(ownerId: string, inviteId: string): Promise<FamilyInvite> {
    const invite = await this.invites.findOne({ where: { id: inviteId, ownerId } });
    if (!invite || invite.status !== FamilyInviteStatus.PENDING) throw new NotFoundException('Invitation not found.');
    invite.expiresAt = new Date(Date.now() + INVITE_DAYS * 864e5);
    await this.invites.save(invite);
    const [owner, existing] = await Promise.all([
      this.usersService.findById(ownerId),
      this.users.findOne({ where: { email: emailEquals(invite.email) } }),
    ]);
    await this.send(invite, owner, existing);
    return invite;
  }

  async cancel(ownerId: string, inviteId: string): Promise<{ ok: true }> {
    const invite = await this.invites.findOne({ where: { id: inviteId, ownerId } });
    if (!invite || invite.status !== FamilyInviteStatus.PENDING) throw new NotFoundException('Invitation not found.');
    invite.status = FamilyInviteStatus.CANCELLED;
    invite.respondedAt = new Date();
    await this.invites.save(invite);
    return { ok: true };
  }

  /** Invitations still waiting for an answer (expired ones show so they can be resent). */
  async listSent(ownerId: string) {
    const rows = await this.invites.find({ where: { ownerId, status: FamilyInviteStatus.PENDING }, order: { createdAt: 'DESC' } });
    const now = new Date();
    return rows.map((i) => ({
      id: i.id, email: i.email, firstName: i.firstName, createdAt: i.createdAt, expiresAt: i.expiresAt,
      expired: i.expiresAt <= now,
    }));
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = newInviteCode();
      if (!(await this.invites.exist({ where: { code } }))) return code;
    }
    throw new Error('Could not generate a unique invite code');
  }

  private async send(invite: FamilyInvite, owner: User, existing: User | null) {
    const inviterName = `${owner.firstName} ${owner.lastName}`.trim() || 'A family member';
    try {
      await this.emailService.sendFamilyInvite(invite.email, invite.firstName, inviterName, invite.code, this.joinUrl(invite.code));
    } catch (e) {
      this.logger.warn(`Family invite email to invite ${invite.id} failed: ${(e as Error).message}`);
      throw new BadRequestException("The invitation was saved, but the email couldn't be sent right now. Try Resend in a moment.");
    }
    // Someone who already has an account also gets an in-app notice.
    if (existing) {
      await this.notifications.notifyUser(
        existing.id, NotificationType.FAMILY_INVITE,
        `${owner.firstName} invited you to join their home`,
        'Open the invitation to accept or decline.',
        { screen: 'family-invite', code: invite.code },
      ).catch(() => {});
    }
  }

  // ── Invitee ───────────────────────────────────────────────────────────────

  /** What the Join page and the app show for a code. */
  async publicInfo(code: string): Promise<PublicInvite> {
    const invite = await this.findByCode(code);
    const [owner, account] = await Promise.all([
      this.users.findOne({ where: { id: invite.ownerId } }),
      this.users.findOne({ where: { email: emailEquals(invite.email) }, select: ['id'] }),
    ]);
    const status = invite.status === FamilyInviteStatus.PENDING && invite.expiresAt <= new Date() ? 'EXPIRED' : invite.status;
    return {
      code: invite.code,
      inviterName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : 'Someone',
      inviteeFirstName: invite.firstName,
      maskedEmail: maskEmail(invite.email),
      hasAccount: !!account,
      status,
    };
  }

  /** Open invitations for the signed-in user's email (the app shows a banner). */
  async received(userId: string): Promise<PublicInvite[]> {
    const user = await this.usersService.findById(userId);
    if (user.parentUserId) return [];
    const rows = await this.invites.find({
      where: { email: normalizeEmail(user.email), status: FamilyInviteStatus.PENDING, expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((r) => this.publicInfo(r.code)));
  }

  async accept(userId: string, code: string): Promise<User> {
    const invite = await this.findOpenByCode(code);
    const user = await this.usersService.findById(userId);
    if (normalizeEmail(user.email) !== invite.email) {
      throw new ForbiddenException(`This invitation was sent to ${maskEmail(invite.email)}. Sign in with that email to accept it.`);
    }
    if (user.parentUserId) throw new ConflictException('You already belong to a home. Leave it first.');
    if (await this.users.exist({ where: { parentUserId: userId } })) {
      throw new ConflictException('You have family members on your own home, so you can’t join another one.');
    }
    const paid = await this.subscriptions.find({ where: { customerId: userId, status: SubscriptionStatus.ACTIVE } });
    if (paid.some((s) => s.plan && s.plan.tier !== PlanTier.FREE)) {
      throw new ConflictException('You have your own paid plan. Cancel it first, then accept the invitation.');
    }
    await this.link(invite, user);
    return this.usersService.findById(userId);
  }

  async decline(userId: string, code: string): Promise<{ ok: true }> {
    const invite = await this.findOpenByCode(code);
    const user = await this.usersService.findById(userId);
    if (normalizeEmail(user.email) !== invite.email) throw new ForbiddenException('This invitation was sent to someone else.');
    invite.status = FamilyInviteStatus.DECLINED;
    invite.respondedAt = new Date();
    await this.invites.save(invite);
    return { ok: true };
  }

  /**
   * Creates the invitee's account from the invite: email from the invite
   * (opening it proves the address, so no verification code), home address
   * from the account holder, no plan of their own.
   */
  async registerInvited(dto: { code: string; firstName: string; lastName: string; password: string; phone?: string }) {
    const invite = await this.findOpenByCode(dto.code);
    if (await this.users.exist({ where: { email: emailEquals(invite.email) } })) {
      throw new ConflictException('An account with this email already exists. Sign in to accept the invitation.');
    }
    const owner = await this.users.findOne({ where: { id: invite.ownerId } });
    if (!owner) throw new BadRequestException('This invitation is no longer active.');

    const user = await this.users.save(this.users.create({
      email: invite.email,
      password: await bcrypt.hash(dto.password, 12),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: dto.phone?.trim() || null,
      roles: [UserRole.CUSTOMER],
      activeRole: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
    } as Partial<User>));
    await this.usersService.acceptCustomerTerms(user.id, CURRENT_CUSTOMER_TOS_VERSION);
    await this.link(invite, user);

    const full = await this.usersService.findById(user.id);
    return { accessToken: this.authService.issueToken(full), user: full };
  }

  /** Joins the user to the owner's home: shared household, the home's address, the owner's test flag. */
  private async link(invite: FamilyInvite, user: User) {
    const owner = await this.users.findOne({ where: { id: invite.ownerId } });
    if (!owner || owner.parentUserId) throw new BadRequestException('This invitation is no longer active.');
    const ownerHome = await this.profiles.findOne({ where: { userId: owner.id } });

    const roles = user.roles.includes(UserRole.CUSTOMER) ? user.roles : [...user.roles, UserRole.CUSTOMER];
    await this.users.update(user.id, { parentUserId: owner.id, isTestAccount: !!owner.isTestAccount, roles });

    if (ownerHome) {
      const home = {
        address: ownerHome.address, city: ownerHome.city, state: ownerHome.state, zipCode: ownerHome.zipCode,
        latitude: (ownerHome as any).latitude ?? null, longitude: (ownerHome as any).longitude ?? null,
      };
      const mine = await this.profiles.findOne({ where: { userId: user.id } });
      if (mine) await this.profiles.update(mine.id, home);
      else await this.profiles.save(this.profiles.create({ userId: user.id, ...home }));
    }

    invite.status = FamilyInviteStatus.ACCEPTED;
    invite.respondedAt = new Date();
    invite.acceptedUserId = user.id;
    await this.invites.save(invite);
    // Any other open invitations to this email are now moot.
    await this.invites.update(
      { email: invite.email, status: FamilyInviteStatus.PENDING },
      { status: FamilyInviteStatus.CANCELLED, respondedAt: new Date() },
    );

    await this.notifications.notifyUser(
      owner.id, NotificationType.FAMILY_INVITE_ACCEPTED,
      `${user.firstName} joined your home`,
      `${user.firstName} ${user.lastName} accepted your invitation and can now see your home on Attenteve.`,
      { screen: 'profile' },
    ).catch(() => {});
  }
}
