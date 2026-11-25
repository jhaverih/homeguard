import { sameTestWorld } from './test-accounts';

describe('sameTestWorld', () => {
  it('lets a test customer\'s job go only to a test vendor', () => {
    expect(sameTestWorld(true, true)).toBe(true);
    expect(sameTestWorld(true, false)).toBe(false);
  });

  it('keeps a real customer\'s job away from test vendors', () => {
    expect(sameTestWorld(false, false)).toBe(true);
    expect(sameTestWorld(false, true)).toBe(false);
  });

  it('treats a missing flag as a real account', () => {
    expect(sameTestWorld(undefined, null)).toBe(true);
    expect(sameTestWorld(null, true)).toBe(false);
  });
});
