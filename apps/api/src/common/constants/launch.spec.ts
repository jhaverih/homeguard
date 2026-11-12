import { PlanTier } from '../enums/role.enum';
import { isLaunchedTier, isPreviewTester } from './launch';

describe('launch scope', () => {
  const saved = process.env.PREVIEW_TESTER_EMAILS;
  afterEach(() => {
    if (saved === undefined) delete process.env.PREVIEW_TESTER_EMAILS;
    else process.env.PREVIEW_TESTER_EMAILS = saved;
  });

  it('launches only Care Plan and CarePlus', () => {
    expect(isLaunchedTier(PlanTier.FREE)).toBe(true);
    expect(isLaunchedTier(PlanTier.BASIC)).toBe(true);
    expect(isLaunchedTier(PlanTier.STANDARD)).toBe(false);
    expect(isLaunchedTier(PlanTier.PREMIUM)).toBe(false);
  });

  it('recognises the default preview tester case-insensitively', () => {
    delete process.env.PREVIEW_TESTER_EMAILS;
    expect(isPreviewTester(' HJhaveri@BlueSkyLegacyRoofing.com ')).toBe(true);
    expect(isPreviewTester('someone@example.com')).toBe(false);
    expect(isPreviewTester(undefined)).toBe(false);
  });

  it('lets PREVIEW_TESTER_EMAILS replace the list', () => {
    process.env.PREVIEW_TESTER_EMAILS = 'a@x.com, b@y.com';
    expect(isPreviewTester('b@y.com')).toBe(true);
    expect(isPreviewTester('hjhaveri@blueskylegacyroofing.com')).toBe(false);
    process.env.PREVIEW_TESTER_EMAILS = '';
    expect(isPreviewTester('a@x.com')).toBe(false);
  });
});
