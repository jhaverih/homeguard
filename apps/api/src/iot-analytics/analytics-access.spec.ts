import { canNotifyRule, hasFullAnalytics } from './analytics-access.service';
import { PlanTier } from '../common/enums/role.enum';

describe('analytics access', () => {
  const saved = process.env.PREVIEW_TESTER_EMAILS;
  beforeEach(() => { delete process.env.PREVIEW_TESTER_EMAILS; });
  afterAll(() => { if (saved === undefined) delete process.env.PREVIEW_TESTER_EMAILS; else process.env.PREVIEW_TESTER_EMAILS = saved; });

  it('gives full analytics to Proactive and above, and to a preview tester on any plan', () => {
    expect(hasFullAnalytics(PlanTier.STANDARD, 'someone@example.com')).toBe(true);
    expect(hasFullAnalytics(PlanTier.BASIC, 'someone@example.com')).toBe(false);
    expect(hasFullAnalytics(null, 'someone@example.com')).toBe(false);
    expect(hasFullAnalytics(PlanTier.BASIC, 'hjhaveri@blueskylegacyroofing.com')).toBe(true);
  });

  it('only lets CarePlus-eligible rules alert a customer without full analytics', () => {
    expect(canNotifyRule('HVAC-WATER-001', false)).toBe(true);
    expect(canNotifyRule('INDOOR-TEMP-001', false)).toBe(true);
    expect(canNotifyRule('HVAC-COMBINED-002', false)).toBe(false);
    expect(canNotifyRule('HVAC-COMBINED-002', true)).toBe(true);
    expect(canNotifyRule('NO-SUCH-RULE', true)).toBe(false);
  });
});
