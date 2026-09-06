import { formatRelativeAge } from './datetime';

const NOW = new Date('2026-01-15T12:00:00.000Z');

describe('formatRelativeAge', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "updated just now" for a timestamp under a minute old', () => {
    // 10s, not 30s: ageMin = Math.round(ms/60000) rounds 30s up to 1 (banker's-
    // unfriendly .5 rounding), which would wrongly hit the "1m ago" branch.
    const tenSecondsAgo = new Date(NOW.getTime() - 10_000).toISOString();
    expect(formatRelativeAge(tenSecondsAgo)).toBe('updated just now');
  });

  it('returns minutes-ago text for a timestamp a few minutes old', () => {
    const fifteenMinutesAgo = new Date(NOW.getTime() - 15 * 60_000).toISOString();
    expect(formatRelativeAge(fifteenMinutesAgo)).toBe('updated 15m ago');
  });

  it('still shows minutes-ago text right at the 60-minute cutoff', () => {
    const sixtyMinutesAgo = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    expect(formatRelativeAge(sixtyMinutesAgo)).toBe('updated 60m ago');
  });

  it('returns an empty string just past the 60-minute cutoff, instead of an absurd "99h ago"', () => {
    const sixtyOneMinutesAgo = new Date(NOW.getTime() - 61 * 60_000).toISOString();
    expect(formatRelativeAge(sixtyOneMinutesAgo)).toBe('');
  });

  it('returns an empty string for a timestamp from days ago', () => {
    const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeAge(threeDaysAgo)).toBe('');
  });

  it('accepts a Date object as well as a string', () => {
    const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000);
    expect(formatRelativeAge(fiveMinutesAgo)).toBe('updated 5m ago');
  });

  it('returns an empty string for null', () => {
    expect(formatRelativeAge(null)).toBe('');
  });

  it('returns an empty string for undefined', () => {
    expect(formatRelativeAge(undefined)).toBe('');
  });
});
