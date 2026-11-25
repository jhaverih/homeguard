import { FamilyInvitesService, maskEmail, newInviteCode, normalizeInviteCode } from './family-invites.service';
import { FamilyInvite, FamilyInviteStatus } from './family-invite.entity';
import { renderInvitePage } from './invite-page';
import { UserRole } from '../common/enums/role.enum';

describe('invite codes', () => {
  it('makes 8-character codes without look-alike letters', () => {
    for (let i = 0; i < 200; i++) {
      const c = newInviteCode();
      expect(c).toMatch(/^[A-Z2-9]{8}$/);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });

  it('accepts codes typed loosely', () => {
    expect(normalizeInviteCode('abcd-efgh ')).toBe('ABCDEFGH');
  });

  it('masks the email on the public page', () => {
    expect(maskEmail('jordanexample@example.com')).toBe('j' + '•'.repeat(11) + 'e@example.com');
    expect(maskEmail('ab@x.com')).toBe('ab@x.com');
  });
});

describe('invite page', () => {
  it('escapes the inviter name and links to the app', () => {
    const html = renderInvitePage({
      code: 'ABCDEFGH', inviterName: '<script>x</script>', inviteeFirstName: null,
      maskedEmail: 'a•••b@x.com', hasAccount: false, status: 'PENDING',
    }, 'ABCDEFGH');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('homeguard://family-invite?code=ABCDEFGH');
    expect(html).toContain('ABCD-EFGH');
  });

  it('does not try to open the app for an expired invitation', () => {
    const html = renderInvitePage({
      code: 'ABCDEFGH', inviterName: 'Haresh', inviteeFirstName: null,
      maskedEmail: 'a•••b@x.com', hasAccount: true, status: 'EXPIRED',
    }, 'ABCDEFGH');
    expect(html).toContain('expired');
    expect(html).not.toContain('<script>');
  });
});

// Minimal in-memory repositories for the service's accept/sign-up rules.
function repo<T extends { id?: string }>(rows: T[]) {
  const matches = (r: any, where: any) => Object.entries(where ?? {}).every(([k, v]) => {
    if (v && typeof v === 'object' && '_type' in (v as any)) return true; // Raw/MoreThan: not needed here
    return r[k] === v;
  });
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    find: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where))),
    exist: jest.fn(async ({ where }: any) => rows.some((r) => matches(r, where))),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => { if (!x.id) x.id = `id-${rows.length + 1}`; const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
    update: jest.fn(async (where: any, patch: any) => {
      const crit = typeof where === 'string' ? { id: where } : where;
      rows.filter((r) => matches(r, crit)).forEach((r) => Object.assign(r, patch));
    }),
  };
}

function setup(opts: { ownerTest?: boolean; inviteeExists?: boolean } = {}) {
  const owner: any = { id: 'owner', email: 'owner@x.com', firstName: 'Haresh', lastName: 'J', roles: [UserRole.CUSTOMER], parentUserId: null, isTestAccount: !!opts.ownerTest };
  const invitee: any = { id: 'inv', email: 'ivy@x.com', firstName: 'Ivy', lastName: 'J', roles: [UserRole.CUSTOMER], parentUserId: null, isTestAccount: false };
  const users = repo<any>(opts.inviteeExists ? [owner, invitee] : [owner]);
  // emailEquals() is a Raw matcher; resolve email lookups by hand.
  users.findOne.mockImplementation(async ({ where }: any) => {
    if (where.id) return users.rows.find((u) => u.id === where.id) ?? null;
    if (where.email) return users.rows.find((u) => u.email === 'ivy@x.com') ?? null;
    return null;
  });
  users.exist.mockImplementation(async ({ where }: any) => {
    if (where.parentUserId) return users.rows.some((u) => u.parentUserId === where.parentUserId);
    return users.rows.some((u) => u.email === 'ivy@x.com');
  });
  const invite: FamilyInvite = {
    id: 'i1', ownerId: 'owner', email: 'ivy@x.com', firstName: 'Ivy', code: 'ABCDEFGH', status: FamilyInviteStatus.PENDING,
    expiresAt: new Date(Date.now() + 864e5), respondedAt: null, acceptedUserId: null, createdAt: new Date(),
  };
  const invites = repo<any>([invite]);
  const profiles = repo<any>([{ id: 'p-owner', userId: 'owner', address: '1 Main', city: 'Naperville', state: 'IL', zipCode: '60540', latitude: 1, longitude: 2 }]);
  const subs = repo<any>([]);
  const usersService: any = {
    findById: jest.fn(async (id: string) => users.rows.find((u) => u.id === id)),
    acceptCustomerTerms: jest.fn(async () => {}),
  };
  const notifications: any = { notifyUser: jest.fn(async () => {}) };
  const service = new FamilyInvitesService(
    invites as any, users as any, profiles as any, subs as any, usersService,
    { issueToken: () => 'token' } as any, { sendFamilyInvite: jest.fn() } as any, notifications, { get: (_k: string, d: string) => d } as any,
  );
  return { service, users, invites, profiles, notifications, invite };
}

describe('FamilyInvitesService', () => {
  it('signs up from an invitation: verified, in the home, home address, test flag from the owner', async () => {
    const { service, users, profiles, invite, notifications } = setup({ ownerTest: true });
    const res = await service.registerInvited({ code: 'abcd-efgh', firstName: 'Ivy', lastName: 'J', password: 'Secret#123' });
    const created = users.rows.find((u) => u.email === 'ivy@x.com');
    expect(res.accessToken).toBe('token');
    expect(created.isEmailVerified).toBe(true);
    expect(created.parentUserId).toBe('owner');
    expect(created.isTestAccount).toBe(true);
    expect(profiles.rows.find((p) => p.userId === created.id)?.zipCode).toBe('60540');
    expect(invite.status).toBe(FamilyInviteStatus.ACCEPTED);
    expect(notifications.notifyUser).toHaveBeenCalledWith('owner', expect.anything(), 'Ivy joined your home', expect.any(String), expect.anything());
  });

  it('lets an existing account accept only with the invited email', async () => {
    const { service, users } = setup({ inviteeExists: true });
    users.rows.push({ id: 'other', email: 'other@x.com', roles: [UserRole.CUSTOMER], parentUserId: null });
    await expect(service.accept('other', 'ABCDEFGH')).rejects.toThrow(/sent to/);
    await service.accept('inv', 'ABCDEFGH');
    expect(users.rows.find((u) => u.id === 'inv').parentUserId).toBe('owner');
  });

  it('refuses an expired invitation', async () => {
    const { service, invite } = setup({ inviteeExists: true });
    invite.expiresAt = new Date(Date.now() - 1000);
    await expect(service.accept('inv', 'ABCDEFGH')).rejects.toThrow(/expired/);
  });

  it('refuses sign-up when the email already has an account', async () => {
    const { service } = setup({ inviteeExists: true });
    await expect(service.registerInvited({ code: 'ABCDEFGH', firstName: 'I', lastName: 'J', password: 'Secret#123' })).rejects.toThrow(/already exists/);
  });
});
