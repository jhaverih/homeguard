import { CertificationReviewStatus } from '../entities/vendor-certification.entity';
import { CoiExtraction, evaluateCoi, evaluateRegistration, RegistrationExtraction } from './document-validation';

const NOW = new Date('2026-11-14T12:00:00Z');

describe('evaluateRegistration', () => {
  const good: RegistrationExtraction = {
    businessName: 'Lopez Cooling, LLC', entityNumber: '001234567', state: 'TN', status: 'active',
    formationDate: '2019-04-12', documentDate: '2026-10-01', confidence: 'high',
  };
  const run = (x: Partial<RegistrationExtraction>, expectedState = 'TN') =>
    evaluateRegistration({ extraction: { ...good, ...x }, expectedState, companyName: 'Lopez Cooling LLC' });

  it('passes an active registration for the right state and company', () => {
    expect(run({})).toEqual({ status: CertificationReviewStatus.PENDING_REVIEW, reasons: [] });
  });

  it('rejects a dissolved, revoked or inactive business', () => {
    for (const status of ['dissolved', 'revoked', 'inactive'] as const) {
      const d = run({ status });
      expect(d.status).toBe(CertificationReviewStatus.REJECTED);
      expect(d.reasons[0]).toMatch(status);
    }
  });

  it('sends a registration for a different state to review', () => {
    const d = run({ state: 'KY' });
    expect(d.status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(d.reasons[0]).toMatch(/KY registration, but it was uploaded for TN/);
  });

  it('sends a different business name to review', () => {
    const d = run({ businessName: 'Smith Air Inc' });
    expect(d.status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(d.reasons.join(' ')).toMatch(/Smith Air Inc/);
  });

  it('sends a missing status or low confidence to review', () => {
    expect(run({ status: null }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(run({ confidence: 'low' }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
  });
});

describe('evaluateCoi', () => {
  const good: CoiExtraction = {
    insuredName: 'Lopez Cooling, LLC', insurerName: 'Middle Tennessee Mutual', policyNumber: 'GL-1',
    effectiveDate: '2026-03-01', expirationDate: '2027-03-01', generalLiabilityPerOccurrence: 1_000_000,
    certificateHolder: 'Attenteve LLC, Nashville TN', additionalInsured: true, additionalInsuredName: 'Attenteve LLC',
    confidence: 'high',
  };
  const run = (x: Partial<CoiExtraction>) =>
    evaluateCoi({ extraction: { ...good, ...x }, companyName: 'Lopez Cooling LLC', now: NOW });

  it('passes a current COI naming Attenteve LLC with $1M general liability', () => {
    expect(run({})).toEqual({ status: CertificationReviewStatus.PENDING_REVIEW, reasons: [] });
  });

  it('accepts "certificate holder" wording when the holder is Attenteve', () => {
    expect(run({ additionalInsuredName: null }).status).toBe(CertificationReviewStatus.PENDING_REVIEW);
  });

  it('rejects an expired COI', () => {
    const d = run({ expirationDate: '2026-03-01' });
    expect(d.status).toBe(CertificationReviewStatus.REJECTED);
    expect(d.reasons[0]).toMatch(/expired on 2026-03-01/);
  });

  it('sends a COI without Attenteve LLC as additional insured to review, telling the vendor what to do', () => {
    for (const x of [{ additionalInsured: false }, { additionalInsured: null }, { additionalInsuredName: 'Some Bank', certificateHolder: 'Some Bank' }]) {
      const d = run(x);
      expect(d.status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
      expect(d.reasons.join(' ')).toMatch(/Ask your insurance agent to add Attenteve LLC/);
    }
  });

  it('sends general liability under $1M (or not shown) to review', () => {
    expect(run({ generalLiabilityPerOccurrence: 500_000 }).reasons.join(' ')).toMatch(/\$500,000 per occurrence/);
    expect(run({ generalLiabilityPerOccurrence: null }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
  });

  it('sends a different insured, a missing date or low confidence to review', () => {
    expect(run({ insuredName: 'Smith Air Inc' }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(run({ effectiveDate: null }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(run({ expirationDate: null }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
    expect(run({ confidence: 'low' }).status).toBe(CertificationReviewStatus.NEEDS_REVIEW);
  });
});
