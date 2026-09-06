import { needsReacceptance } from './legal';

describe('needsReacceptance', () => {
  it('returns true when the user has never accepted (null)', () => {
    expect(needsReacceptance(null, '2026-09-06')).toBe(true);
  });

  it('returns true when the user has never accepted (undefined)', () => {
    expect(needsReacceptance(undefined, '2026-09-06')).toBe(true);
  });

  it('returns true when the accepted version is older than the current one', () => {
    expect(needsReacceptance('2026-07-15', '2026-09-06')).toBe(true);
  });

  it('returns false when the accepted version matches the current one exactly', () => {
    expect(needsReacceptance('2026-09-06', '2026-09-06')).toBe(false);
  });

  it('does not gate while the current version is still unknown (not yet fetched)', () => {
    // Distinguishes "haven't loaded /legal/versions yet" from "never
    // accepted" — the app shouldn't flash the gate modal before it even
    // knows whether one is needed.
    expect(needsReacceptance(null, undefined)).toBe(false);
    expect(needsReacceptance('2026-07-15', undefined)).toBe(false);
  });
});
