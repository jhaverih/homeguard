import { fmtUSD } from './currency';

describe('fmtUSD', () => {
  it('formats a whole number with two decimal places and a thousands separator', () => {
    expect(fmtUSD(1234)).toBe('$1,234.00');
  });

  it('formats a value that already has cents, rounding to two decimals', () => {
    expect(fmtUSD(19.999)).toBe('$20.00');
  });

  it('accepts a numeric string, matching what the API returns for money fields', () => {
    expect(fmtUSD('49.5')).toBe('$49.50');
  });

  it('formats zero as $0.00, not blank', () => {
    expect(fmtUSD(0)).toBe('$0.00');
  });

  it('formats negative amounts (e.g. a refund) with a leading minus sign', () => {
    expect(fmtUSD(-12.3)).toBe('$-12.30');
  });

  it('falls back to $0.00 for null', () => {
    expect(fmtUSD(null)).toBe('$0.00');
  });

  it('falls back to $0.00 for undefined', () => {
    expect(fmtUSD(undefined)).toBe('$0.00');
  });

  it('falls back to $0.00 for a non-numeric string instead of showing "$NaN"', () => {
    expect(fmtUSD('not-a-price')).toBe('$0.00');
  });

  it('treats an empty string as zero (Number("") is 0, not NaN)', () => {
    expect(fmtUSD('')).toBe('$0.00');
  });
});
