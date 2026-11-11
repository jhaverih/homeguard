import { CertificationType } from '../entities/vendor-capability.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { daysUntil, dueNotice, expiredLicenses, EXPIRED_NOTICE, isExpired } from './credential-expiry';

const now = new Date('2026-11-10T12:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

describe('credential expiry', () => {
  it('counts whole days left, rounding up', () => {
    expect(daysUntil(inDays(30), now)).toBe(30);
    expect(daysUntil(inDays(29.5), now)).toBe(30);
    expect(isExpired(inDays(-0.01), now)).toBe(true);
    expect(isExpired(inDays(0.01), now)).toBe(false);
    expect(isExpired(null, now)).toBe(false);
  });

  it('sends nothing more than 60 days out', () => {
    expect(dueNotice(inDays(61), null, now)).toBeNull();
  });

  it('sends 60, then 30, then 7, each once', () => {
    expect(dueNotice(inDays(60), null, now)).toBe(60);
    expect(dueNotice(inDays(45), 60, now)).toBeNull();
    expect(dueNotice(inDays(30), 60, now)).toBe(30);
    expect(dueNotice(inDays(29), 30, now)).toBeNull();
    expect(dueNotice(inDays(7), 30, now)).toBe(7);
    expect(dueNotice(inDays(3), 7, now)).toBeNull();
  });

  it('sends only the nearest notice when the first run is already inside a window', () => {
    expect(dueNotice(inDays(20), null, now)).toBe(30);
    expect(dueNotice(inDays(5), null, now)).toBe(7);
  });

  it('sends the expired notice once', () => {
    expect(dueNotice(inDays(-1), 7, now)).toBe(EXPIRED_NOTICE);
    expect(dueNotice(inDays(-1), null, now)).toBe(EXPIRED_NOTICE);
    expect(dueNotice(inDays(-5), EXPIRED_NOTICE, now)).toBeNull();
  });

  describe('expiredLicenses', () => {
    const lic = (id: string, type: CertificationType, days: number, status = CertificationReviewStatus.APPROVED) =>
      ({ id, certificationType: type, status, expirationDate: inDays(days) });

    it('flags a license type with no current license', () => {
      expect(expiredLicenses([lic('a', CertificationType.HVAC, -1)], now).map((l) => l.id)).toEqual(['a']);
    });

    it('does not flag a type that has a newer current license', () => {
      expect(expiredLicenses([lic('a', CertificationType.HVAC, -10), lic('b', CertificationType.HVAC, 200)], now)).toEqual([]);
    });

    it('ignores rejected licenses', () => {
      expect(expiredLicenses([lic('a', CertificationType.HVAC, -1, CertificationReviewStatus.REJECTED)], now)).toEqual([]);
    });

    it('returns the newest expired row per type', () => {
      const out = expiredLicenses([
        lic('old', CertificationType.PLUMBING, -100), lic('new', CertificationType.PLUMBING, -2), lic('ok', CertificationType.HVAC, 90),
      ], now);
      expect(out.map((l) => l.id)).toEqual(['new']);
    });
  });
});
