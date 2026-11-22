import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { ServicePrice } from '../pricing/entities/service-price.entity';
import { TrainingCompletion } from './entities/training-completion.entity';
import { JobTrainingInfo, TrainingModule, loadTrainingModules, requiredModuleKeys } from './training-content';

// Whether a vendor user's training lets them see or take a job: every core
// module, plus the module for that kind of work, finished at its current
// version. Vendors already working when training was introduced are let
// through until their grace date. Like vendor-access.ts, it takes a
// DataSource so service requests and the vendor portal can use it without
// importing TrainingModule.
export interface TrainingAccess {
  inGrace: boolean;
  doneKeys: Set<string>;
  allows(job: JobTrainingInfo): boolean;
  missingFor(job: JobTrainingInfo): TrainingModule[];
}

export async function getTrainingAccess(dataSource: DataSource, userId: string, now = new Date()): Promise<TrainingAccess> {
  const modules = loadTrainingModules();
  const [profile, completions] = await Promise.all([
    dataSource.getRepository(VendorProfile).findOne({ where: { userId } }),
    dataSource.getRepository(TrainingCompletion).find({ where: { userId } }),
  ]);
  return buildTrainingAccess(modules, completions, profile?.trainingGraceUntil ?? null, now);
}

export function buildTrainingAccess(
  modules: TrainingModule[],
  completions: Pick<TrainingCompletion, 'moduleKey' | 'moduleVersion'>[],
  graceUntil: Date | null,
  now = new Date(),
): TrainingAccess {
  const current = new Map(modules.map((m) => [m.key, m.version]));
  const doneKeys = new Set(completions.filter((c) => current.get(c.moduleKey) === c.moduleVersion).map((c) => c.moduleKey));
  const inGrace = !!graceUntil && new Date(graceUntil).getTime() > now.getTime();
  const missingFor = (job: JobTrainingInfo) => {
    const required = new Set(requiredModuleKeys(modules, job));
    return modules.filter((m) => required.has(m.key) && !doneKeys.has(m.key));
  };
  return {
    inGrace,
    doneKeys,
    missingFor,
    allows: (job) => inGrace || missingFor(job).length === 0,
  };
}

/** The training facts of a job, from its service price (none = plan assessment). */
export async function jobTrainingInfo(
  dataSource: DataSource,
  request: { servicePriceId?: string | null },
): Promise<JobTrainingInfo> {
  if (!request.servicePriceId) return { assessment: true };
  const price = await dataSource.getRepository(ServicePrice).findOne({ where: { id: request.servicePriceId } });
  const capability = price?.requiredCapabilityId
    ? await dataSource.getRepository(VendorCapability).findOne({ where: { id: price.requiredCapabilityId } })
    : null;
  return { assessment: false, category: price?.category ?? null, capabilityName: capability?.name ?? null };
}

// Lets the app and portal tell this 403 apart and open the training screen.
export const TRAINING_REQUIRED_CODE = 'TRAINING_REQUIRED';

/** Throws a 403 TRAINING_REQUIRED when the user's training doesn't cover this job. */
export async function assertTrainedForJob(
  dataSource: DataSource,
  userId: string,
  request: { servicePriceId?: string | null },
  who: 'self' | 'technician' = 'self',
): Promise<void> {
  const [access, job] = await Promise.all([getTrainingAccess(dataSource, userId), jobTrainingInfo(dataSource, request)]);
  if (access.allows(job)) return;
  const missing = access.missingFor(job).map((m) => m.title);
  const list = missing.join(', ');
  throw new ForbiddenException({
    statusCode: 403,
    code: TRAINING_REQUIRED_CODE,
    missingModules: missing,
    message: who === 'self'
      ? `Finish your training before taking this job: ${list}. Open My Training in the Attenteve app.`
      : `This technician hasn't finished the training this job needs: ${list}.`,
  });
}
