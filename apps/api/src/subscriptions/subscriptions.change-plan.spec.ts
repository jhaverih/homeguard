import { PlanTier } from '../common/enums/role.enum';
import { SubscriptionsService } from './subscriptions.service';

// changePlan's Stripe handling: a missing Stripe subscription, a free → paid
// switch, and a paid → free downgrade.
function setup(opts: { stripeSubId?: string | null; retrieve?: () => Promise<any>; targetPrice?: string | null }) {
  const sub: any = { id: 's1', customerId: 'owner', planId: 'old', plan: { tier: PlanTier.FREE }, stripeSubscriptionId: opts.stripeSubId ?? null };
  const target: any = { id: 'new', tier: opts.targetPrice ? PlanTier.STANDARD : PlanTier.FREE, name: 'Target', stripePriceId: opts.targetPrice ?? null };
  const subscriptionsRepo: any = {
    findOne: jest.fn().mockResolvedValue(sub),
    save: jest.fn(async (x) => x),
    remove: jest.fn(async (x) => x),
  };
  const plansRepo: any = { findOne: jest.fn().mockResolvedValue(target) };
  const usersService: any = { getEffectiveSubscriptionOwnerId: jest.fn().mockResolvedValue('owner') };
  const pricingService: any = { findByName: jest.fn().mockResolvedValue(null) };
  const config: any = { get: () => 'sk_test_x' };
  const service = new SubscriptionsService(plansRepo, subscriptionsRepo, {} as any, config, usersService, {} as any, pricingService, {} as any, {} as any);
  const stripe: any = {
    subscriptions: {
      retrieve: jest.fn(opts.retrieve ?? (async () => null)),
      update: jest.fn(),
      cancel: jest.fn(),
    },
  };
  (service as any).stripe = stripe;
  const subscribeViaStripe = jest.spyOn(service as any, 'subscribeViaStripe').mockResolvedValue({ clientSecret: 'cs', subscriptionId: 'sub_new' });
  return { service, sub, stripe, subscriptionsRepo, subscribeViaStripe };
}

const missing = async () => { throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' }); };
const TESTER = 'hjhaveri@blueskylegacyroofing.com';

describe('SubscriptionsService.changePlan', () => {
  it('starts a fresh paid subscription when the Stripe subscription no longer exists', async () => {
    const t = setup({ stripeSubId: 'sub_gone', retrieve: missing, targetPrice: 'price_1' });
    const res = await t.service.changePlan('owner', 'new', TESTER);
    expect(res).toEqual({ clientSecret: 'cs', subscriptionId: 'sub_new' });
    expect(t.subscriptionsRepo.remove).toHaveBeenCalledWith(t.sub);
    expect(t.subscribeViaStripe).toHaveBeenCalledWith('owner', expect.objectContaining({ id: 'new' }), 'price_1');
    expect(t.stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('charges for a paid plan when switching from a free plan with no Stripe subscription', async () => {
    const t = setup({ stripeSubId: null, targetPrice: 'price_1' });
    const res = await t.service.changePlan('owner', 'new', TESTER);
    expect(res.clientSecret).toBe('cs');
    expect(t.stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('updates the price on a billing Stripe subscription', async () => {
    const t = setup({ stripeSubId: 'sub_live', retrieve: async () => ({ id: 'sub_live', status: 'active', items: { data: [{ id: 'si_1' }] } }), targetPrice: 'price_1' });
    const res = await t.service.changePlan('owner', 'new', TESTER);
    expect(res).toEqual({});
    expect(t.stripe.subscriptions.update).toHaveBeenCalledWith('sub_live', expect.objectContaining({ items: [{ id: 'si_1', price: 'price_1' }] }));
    expect(t.sub.planId).toBe('new');
  });

  it('cancels the Stripe subscription when downgrading to the free plan', async () => {
    const t = setup({ stripeSubId: 'sub_live', retrieve: async () => ({ id: 'sub_live', status: 'active', items: { data: [] } }), targetPrice: null });
    await t.service.changePlan('owner', 'new');
    expect(t.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_live');
    expect(t.sub.stripeSubscriptionId).toBeNull();
    expect(t.sub.planId).toBe('new');
  });

  it('downgrades to the free plan even when the Stripe subscription is gone', async () => {
    const t = setup({ stripeSubId: 'sub_gone', retrieve: missing, targetPrice: null });
    await t.service.changePlan('owner', 'new');
    expect(t.stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(t.sub.stripeSubscriptionId).toBeNull();
  });
});
