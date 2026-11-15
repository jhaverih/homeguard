import { ServiceAreaService } from './service-area.service';

// UsersService pulls in packages Jest can't load; notify() never touches it.
jest.mock('../users/users.service', () => ({ UsersService: class {} }));

// Waiting-list signups from the public site: homeowners (email + ZIP) and
// pros (plus company and services).
function setup(existing: any = null) {
  const waitlistRepo: any = {
    findOne: jest.fn().mockResolvedValue(existing),
    create: (x: any) => x,
    save: jest.fn(async (x) => x),
    update: jest.fn().mockResolvedValue({}),
  };
  const none: any = {};
  const service = new ServiceAreaService(none, none, none, none, none, waitlistRepo, none, none);
  return { service, waitlistRepo };
}

describe('ServiceAreaService.notify', () => {
  it('saves a homeowner signup with no pro details', async () => {
    const t = setup();
    await t.service.notify('a@b.com', '37064', null, { companyName: 'Ignored', services: ['HVAC'] });
    expect(t.waitlistRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      email: 'a@b.com', zipCode: '37064', audience: 'HOMEOWNER', companyName: null, services: null,
    }));
  });

  it('saves a pro signup with company and de-duplicated services', async () => {
    const t = setup();
    await t.service.notify('pro@b.com', '37064', null, { audience: 'PRO', companyName: ' Lopez Cooling ', services: ['HVAC', 'HVAC', ' Lawn care (Marketplace) ', ''] });
    expect(t.waitlistRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      audience: 'PRO', companyName: 'Lopez Cooling', services: ['HVAC', 'Lawn care (Marketplace)'],
    }));
  });

  it('does not duplicate a repeat homeowner signup', async () => {
    const t = setup({ id: 'w1' });
    await t.service.notify('a@b.com', '37064');
    expect(t.waitlistRepo.save).not.toHaveBeenCalled();
    expect(t.waitlistRepo.update).not.toHaveBeenCalled();
  });

  it('updates the services on a repeat pro signup', async () => {
    const t = setup({ id: 'w2', companyName: 'Lopez Cooling' });
    await t.service.notify('pro@b.com', '37064', null, { audience: 'PRO', services: ['Plumbing'] });
    expect(t.waitlistRepo.update).toHaveBeenCalledWith('w2', { companyName: 'Lopez Cooling', services: ['Plumbing'] });
  });
});
