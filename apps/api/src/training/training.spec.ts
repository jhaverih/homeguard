import {
  TrainingModule, answersAreCorrect, assignedModules, loadTrainingModules, requiredModuleKeys, validateModules,
} from './training-content';
import { buildTrainingAccess } from './training-access';
import { reminderFor, summarize } from './training.service';

const modules = loadTrainingModules();
const CORE = modules.filter((m) => m.core).map((m) => m.key);
const keys = (ms: TrainingModule[]) => ms.map((m) => m.key);
const doneAll = (ks: string[]) => ks.map((k) => ({ moduleKey: k, moduleVersion: modules.find((m) => m.key === k)!.version }));

describe('training content file', () => {
  it('loads and passes validation', () => {
    expect(() => validateModules(modules)).not.toThrow();
    expect(CORE).toEqual(['welcome', 'job-steps', 'in-the-home', 'prices-and-extra-work', 'cancellations-and-disputes', 'safety-and-compliance']);
  });

  it('only names capabilities that exist in the vendor capability seed', () => {
    // Mirrors CAPABILITY_SEED in vendor/vendor.service.ts — a typo here would
    // silently assign nobody.
    const seed = new Set([
      'Yolink Home Monitoring Setup', 'HVAC Contractor', 'Electrical Contractor', 'Plumbing Contractor', 'Carpenter',
      'Drywall work', 'Pressure wash', 'Install fans', 'Install home appliances', 'Replace a toilet', 'Water leak inspection',
      'HVAC Full inspection', 'Electrical Panel inspection', 'New water softener/filtering system installation',
      'Assembly new furniture', 'Move furniture', 'Roofing Contractor', 'Masonry', 'Renovation / General Contracting',
      'Solar Installation', 'Interior Repairs & Maintenance', 'Minor Electrical Adjustments', 'Minor Plumbing Fixes',
      'Mounting & Installations', 'Carpentry & Assembly', 'Exterior & Outdoor Services',
    ]);
    for (const m of modules) {
      const names = [...(m.appliesTo === 'ALL' ? [] : m.appliesTo), ...(m.jobs?.capabilities ?? [])];
      for (const n of names) expect(seed.has(n) ? n : `${m.key}: unknown capability "${n}"`).toBe(n);
    }
  });

  it('never says Houmi or mentions the materials markup', () => {
    const text = JSON.stringify(modules);
    expect(text).not.toMatch(/houmi/i);
    expect(text).not.toMatch(/markup|15%/i);
  });

  it('says "assessment", never "inspection", in anything a technician sees or hears', () => {
    // Keys, job categories and capability names are internal and must match the database.
    const seen = modules.map((m) => ({
      title: m.title,
      screens: m.screens.map((s) => [s.title, s.text]),
      questions: m.questions,
    }));
    expect(JSON.stringify(seen)).not.toMatch(/inspect/i);
  });
});

describe('assignedModules', () => {
  it('gives everyone, including a manager with no services, core plus inspections', () => {
    expect(keys(assignedModules(modules, []))).toEqual([...CORE, 'inspections']);
  });

  it('adds the module for each service offered, once', () => {
    const got = keys(assignedModules(modules, ['Minor Electrical Adjustments', 'Install fans', 'Replace a toilet']));
    expect(got).toEqual([...CORE, 'inspections', 'electrical', 'plumbing']);
  });

  it('gives roofing both exterior work and quotes', () => {
    expect(keys(assignedModules(modules, ['Roofing Contractor']))).toEqual([...CORE, 'inspections', 'exterior', 'quotes-and-projects']);
  });

  it('gives home monitoring only to YoLink installers', () => {
    expect(keys(assignedModules(modules, ['Yolink Home Monitoring Setup']))).toContain('home-monitoring');
    expect(keys(assignedModules(modules, ['Pressure wash']))).not.toContain('home-monitoring');
  });
});

describe('requiredModuleKeys', () => {
  it('needs core plus inspections for a plan assessment', () => {
    expect(requiredModuleKeys(modules, { assessment: true })).toEqual([...CORE, 'inspections']);
  });

  it('needs inspections, not repairs, for an Inspections-category service', () => {
    const got = requiredModuleKeys(modules, { assessment: false, category: 'INSPECTIONS', capabilityName: 'Interior Repairs & Maintenance' });
    expect(got).toEqual([...CORE, 'inspections']);
  });

  it('needs the trade module for a trade job', () => {
    expect(requiredModuleKeys(modules, { assessment: false, category: 'MINOR_PLUMBING_FIXES', capabilityName: 'Minor Plumbing Fixes' }))
      .toEqual([...CORE, 'plumbing']);
  });

  it('needs only core for a job with no capability', () => {
    expect(requiredModuleKeys(modules, { assessment: false, category: 'HOUSE_CLEANING', capabilityName: null })).toEqual(CORE);
  });
});

describe('buildTrainingAccess (the job gate)', () => {
  const plumbing = { assessment: false, category: 'MINOR_PLUMBING_FIXES', capabilityName: 'Minor Plumbing Fixes' };
  const now = new Date('2026-12-01T12:00:00Z');

  it('hides every job until core is done', () => {
    const a = buildTrainingAccess(modules, doneAll(['plumbing']), null, now);
    expect(a.allows(plumbing)).toBe(false);
    expect(a.allows({ assessment: true })).toBe(false);
  });

  it('shows a trade job once core and its module are done, but not assessments', () => {
    const a = buildTrainingAccess(modules, doneAll([...CORE, 'plumbing']), null, now);
    expect(a.allows(plumbing)).toBe(true);
    expect(a.allows({ assessment: true })).toBe(false);
    expect(a.missingFor({ assessment: true }).map((m) => m.key)).toEqual(['inspections']);
  });

  it('does not count a completion of an older version', () => {
    const old = doneAll([...CORE, 'plumbing']).map((c) => (c.moduleKey === 'plumbing' ? { ...c, moduleVersion: 0 } : c));
    expect(buildTrainingAccess(modules, old, null, now).allows(plumbing)).toBe(false);
  });

  it('lets everything through during the grace period, and stops after it', () => {
    expect(buildTrainingAccess(modules, [], new Date('2026-12-15'), now).allows(plumbing)).toBe(true);
    expect(buildTrainingAccess(modules, [], new Date('2026-11-30'), now).allows(plumbing)).toBe(false);
  });
});

describe('answersAreCorrect', () => {
  const m = modules[0];
  it('accepts only every correct answer in order', () => {
    const right = m.questions.map((q) => q.correct);
    expect(answersAreCorrect(m, right)).toBe(true);
    expect(answersAreCorrect(m, right.map((c, i) => (i === 0 ? (c + 1) % m.questions[0].choices.length : c)))).toBe(false);
    expect(answersAreCorrect(m, right.slice(1))).toBe(false);
    expect(answersAreCorrect(m, 'nope')).toBe(false);
  });
});

describe('summarize', () => {
  it('marks done, update-needed and not started, and finishes when all are done', () => {
    const t = new Date('2026-11-20T10:00:00Z');
    const comps = [
      ...doneAll(CORE).map((c) => ({ ...c, completedAt: t, confirmedName: 'Pat Lee' })),
      { moduleKey: 'inspections', moduleVersion: 0, completedAt: t, confirmedName: 'Pat Lee' },
    ];
    const s = summarize(modules, [], comps, null);
    expect(s.coreDone).toBe(true);
    expect(s.allDone).toBe(false);
    expect(s.modules.find((m) => m.key === 'inspections')!.status).toBe('UPDATE_NEEDED');

    const all = summarize(modules, [], [...comps, { ...doneAll(['inspections'])[0], completedAt: t, confirmedName: 'Pat Lee' }], null);
    expect(all.allDone).toBe(true);
    expect(all.completedAt).toEqual(t);
    expect(all.minutesLeft).toBe(0);
  });
});

describe('reminderFor', () => {
  const now = new Date('2026-12-01T14:30:00Z');
  const owed = (grace: Date | null) => summarize(modules, [], [], grace);

  it('sends once when training is first owed, then stays quiet', () => {
    const first = reminderFor(owed(null), null, now)!;
    expect(first.title).toBe('Your Attenteve training');
    expect(reminderFor(owed(null), first.key, now)).toBeUndefined();
  });

  it('counts down 7, 3 and 1 days before the grace period ends', () => {
    const grace = new Date('2026-12-08T14:00:00Z');
    const start = reminderFor(owed(grace), null, new Date('2026-11-20T14:30:00Z'))!;
    expect(start.title).toBe('Your Attenteve training');
    const d7 = reminderFor(owed(grace), start.key, now)!;
    expect(d7.title).toBe('Finish your training in 7 days');
    expect(reminderFor(owed(grace), d7.key, new Date('2026-12-02T14:30:00Z'))).toBeUndefined();
    const d3 = reminderFor(owed(grace), d7.key, new Date('2026-12-05T14:30:00Z'))!;
    expect(d3.title).toBe('Finish your training in 3 days');
    const d1 = reminderFor(owed(grace), d3.key, new Date('2026-12-07T15:00:00Z'))!;
    expect(d1.title).toBe('Finish your training tomorrow');
  });

  it('clears the stored key once nothing is owed', () => {
    const t = new Date();
    const done = summarize(modules, [], doneAll([...CORE, 'inspections']).map((c) => ({ ...c, completedAt: t, confirmedName: 'x' })), null);
    expect(reminderFor(done, 'something|assigned', now)).toBeNull();
    expect(reminderFor(done, null, now)).toBeUndefined();
  });
});
