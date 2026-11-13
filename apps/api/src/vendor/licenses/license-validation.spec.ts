import { CertificationType } from '../entities/vendor-capability.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { businessMatches, evaluateLicense, LicenseExtraction, personMatches, tradeFromText } from './license-validation';

const NOW = new Date('2026-11-12T12:00:00Z');

const good: LicenseExtraction = {
  licenseNumber: 'TACLA12345C',
  licenseType: 'Air Conditioning and Refrigeration Contractor',
  issuingState: 'TX',
  holderName: 'Maria J. Lopez',
  businessName: 'Lopez Cooling, LLC',
  issueDate: '2025-03-01',
  expirationDate: '2027-03-01',
  confidence: 'high',
};

const run = (x: Partial<LicenseExtraction>, chosenType = CertificationType.HVAC) => evaluateLicense({
  extraction: { ...good, ...x },
  chosenType,
  firstName: 'Maria',
  lastName: 'Lopez',
  companyName: 'Lopez Cooling LLC',
  now: NOW,
});

describe('evaluateLicense', () => {
  it('marks a clean, matching license pending verification', () => {
    expect(run({})).toEqual({ status: CertificationReviewStatus.PENDING_REVIEW, reasons: [] });
  });

  it('rejects a license that has already expired', () => {
    const d = run({ expirationDate: '2026-11-11' });
    expect(d.status).toBe(CertificationReviewStatus.REJECTED);
    expect(d.reasons[0]).toContain('2026-11-11');
  });

  it('accepts a license expiring today', () => {
    expect(run({ expirationDate: '2026-11-12' }).status).toBe(CertificationReviewStatus.PENDING_REVIEW);
  });

  it('needs review when confidence is low', () => {
    const d = run({ confidence: 'low' });
    expect(d.status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(d.reasons.join(' ')).toContain('low confidence');
  });

  it('needs review when either date is missing', () => {
    expect(run({ expirationDate: null }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(run({ issueDate: null }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
  });

  it('needs review when neither name matches', () => {
    const d = run({ holderName: 'John Smith', businessName: 'Smith Air Inc' });
    expect(d.status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(d.reasons.join(' ')).toContain('John Smith');
  });

  it('accepts a business-name match when the holder is someone else', () => {
    expect(run({ holderName: 'John Smith', businessName: 'LOPEZ COOLING' }).status).toBe(CertificationReviewStatus.PENDING_REVIEW);
  });

  it('needs review when the printed trade differs from the chosen one', () => {
    const d = run({ licenseType: 'Master Electrician' });
    expect(d.status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(d.reasons.join(' ')).toContain('electrical');
  });
});

describe('name and trade matching', () => {
  it('matches a person regardless of order, case and middle names', () => {
    expect(personMatches('LOPEZ, MARIA JOSEFINA', 'Maria', 'Lopez')).toBe(true);
    expect(personMatches('Maria Lopes', 'Maria', 'Lopez')).toBe(false);
    expect(personMatches(null, 'Maria', 'Lopez')).toBe(false);
  });

  it('matches a business ignoring suffixes and punctuation', () => {
    expect(businessMatches('Lopez Cooling, L.L.C.', 'Lopez Cooling LLC')).toBe(true);
    expect(businessMatches('A & B Plumbing Inc', 'A and B Plumbing')).toBe(true);
    expect(businessMatches('Other Co', 'Lopez Cooling LLC')).toBe(false);
  });

  it('reads the trade from the printed type, without guessing when ambiguous', () => {
    expect(tradeFromText('Journeyman Plumber')).toBe(CertificationType.PLUMBING);
    expect(tradeFromText('Class A HVAC')).toBe(CertificationType.HVAC);
    expect(tradeFromText('Electrical and Plumbing Contractor')).toBeNull();
    expect(tradeFromText(null)).toBeNull();
  });
});
