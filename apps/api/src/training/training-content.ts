import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Vendor training content lives in apps/api/training/modules.json (copied
// into the image by the Dockerfile, like legal/). Pictures and narration sit
// beside it in training/assets/<module key>/<screen number>.webp|.mp3.
//
// Everything in this file is pure (no database) so the assignment and job
// rules can be unit-tested directly.
export const TRAINING_DIR = join(process.cwd(), 'training');
export const TRAINING_ASSETS_DIR = join(TRAINING_DIR, 'assets');

export interface TrainingScreen {
  title: string;
  text: string;
  image: string; // what the picture shows (for whoever makes it); not sent to the app
}

export interface TrainingQuestion {
  question: string;
  choices: string[];
  correct: number;
  explanation: string;
}

export interface TrainingJobRule {
  /** Care Plan / CarePlus assessments (requests with no service price). */
  assessments?: boolean;
  /** ServicePrice.category values this module unlocks. */
  categories?: string[];
  /** VendorCapability names this module unlocks. */
  capabilities?: string[];
}

export interface TrainingModule {
  key: string;
  version: number;
  title: string;
  minutes: number;
  /** Required before any job shows. */
  core?: boolean;
  /** Who is assigned it: everyone, or anyone who offers one of these capabilities. */
  appliesTo: 'ALL' | string[];
  /** Which jobs it unlocks; defaults to the appliesTo capabilities. */
  jobs?: TrainingJobRule;
  screens: TrainingScreen[];
  questions: TrainingQuestion[];
}

let cached: TrainingModule[] | null = null;

export function loadTrainingModules(): TrainingModule[] {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(join(TRAINING_DIR, 'modules.json'), 'utf-8'));
  const modules: TrainingModule[] = raw.modules;
  validateModules(modules);
  cached = modules;
  return modules;
}

export function validateModules(modules: TrainingModule[]): void {
  const keys = new Set<string>();
  for (const m of modules) {
    if (!/^[a-z0-9-]+$/.test(m.key)) throw new Error(`Training module key "${m.key}" must be lowercase letters, digits and dashes`);
    if (keys.has(m.key)) throw new Error(`Duplicate training module key "${m.key}"`);
    keys.add(m.key);
    if (!Number.isInteger(m.version) || m.version < 1) throw new Error(`Training module "${m.key}" needs a whole-number version`);
    if (!m.screens?.length) throw new Error(`Training module "${m.key}" has no screens`);
    if (!m.questions?.length) throw new Error(`Training module "${m.key}" has no questions`);
    for (const q of m.questions) {
      if (!(q.correct >= 0 && q.correct < q.choices.length)) {
        throw new Error(`Training module "${m.key}": question "${q.question}" has no valid correct answer`);
      }
    }
  }
}

/** Modules a vendor user must take, given the names of the capabilities they selected. */
export function assignedModules(modules: TrainingModule[], selectedCapabilityNames: Iterable<string>): TrainingModule[] {
  const selected = new Set(selectedCapabilityNames);
  return modules.filter((m) => m.core || m.appliesTo === 'ALL' || m.appliesTo.some((c) => selected.has(c)));
}

/** What a job is, as far as training is concerned. */
export interface JobTrainingInfo {
  /** A plan assessment: no service price attached. */
  assessment: boolean;
  category?: string | null;
  capabilityName?: string | null;
}

/**
 * Keys of the modules a technician must have finished to see or take this job:
 * every core module, plus the module(s) for its kind of work. An inspection
 * (plan assessment or an Inspections-category service) needs the inspections
 * module; any other job needs the module(s) covering its capability.
 */
export function requiredModuleKeys(modules: TrainingModule[], job: JobTrainingInfo): string[] {
  const keys = modules.filter((m) => m.core).map((m) => m.key);
  const isInspection = job.assessment || (job.category ? isInspectionCategory(modules, job.category) : false);
  for (const m of modules) {
    if (m.core) continue;
    const rule = jobRule(m);
    if (isInspection) {
      if ((job.assessment && rule.assessments) || (job.category && rule.categories?.includes(job.category))) keys.push(m.key);
    } else if (job.capabilityName && rule.capabilities?.includes(job.capabilityName)) {
      keys.push(m.key);
    }
  }
  return keys;
}

function isInspectionCategory(modules: TrainingModule[], category: string): boolean {
  return modules.some((m) => !m.core && jobRule(m).categories?.includes(category));
}

function jobRule(m: TrainingModule): TrainingJobRule {
  if (m.jobs) return m.jobs;
  return { capabilities: m.appliesTo === 'ALL' ? [] : m.appliesTo };
}

/** True when every answer is the correct choice (one answer per question, in order). */
export function answersAreCorrect(m: TrainingModule, answers: unknown): boolean {
  if (!Array.isArray(answers) || answers.length !== m.questions.length) return false;
  return m.questions.every((q, i) => answers[i] === q.correct);
}

/** Public asset path (under /api) for a screen's picture or narration, or null when it hasn't been made yet. */
export function assetPath(key: string, screenNumber: number, ext: 'webp' | 'mp3'): string | null {
  const file = `${screenNumber}.${ext}`;
  return existsSync(join(TRAINING_ASSETS_DIR, key, file)) ? `training/assets/${key}/${file}` : null;
}
