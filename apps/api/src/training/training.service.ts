import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { VendorCompany, VendorApplicationStatus } from '../vendor/entities/vendor-company.entity';
import { VendorCapability } from '../vendor/entities/vendor-capability.entity';
import { VendorCapabilitySelection } from '../vendor/entities/vendor-capability-selection.entity';
import { VendorCapabilityAcknowledgment } from '../vendor/entities/vendor-capability-acknowledgment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification-type.enum';
import { TrainingCompletion } from './entities/training-completion.entity';
import { TrainingModule, answersAreCorrect, assetPath, assignedModules, loadTrainingModules } from './training-content';

/** Days that vendors already working when training was introduced keep seeing jobs. */
export const TRAINING_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TrainingStatus = 'NOT_STARTED' | 'DONE' | 'UPDATE_NEEDED';

export interface TrainingModuleSummary {
  key: string;
  title: string;
  minutes: number;
  core: boolean;
  version: number;
  status: TrainingStatus;
  completedAt: Date | null;
  confirmedName: string | null;
}

export interface TrainingSummary {
  modules: TrainingModuleSummary[];
  requiredCount: number;
  doneCount: number;
  minutesLeft: number;
  coreDone: boolean;
  allDone: boolean;
  /** When the last required module was finished, once everything is done. */
  completedAt: Date | null;
  /** Jobs keep showing until this date for vendors who were already working. */
  graceUntil: Date | null;
}

export interface CompleteTrainingDto {
  version: number;
  answers: number[];
  attempts?: number;
  answersCorrectFirstTry?: number;
  confirmedName: string;
}

const formatDate = (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

@Injectable()
export class TrainingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TrainingService.name);

  constructor(
    @InjectRepository(TrainingCompletion) private completionRepo: Repository<TrainingCompletion>,
    @InjectRepository(VendorProfile) private profileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorCompany) private companyRepo: Repository<VendorCompany>,
    @InjectRepository(VendorCapability) private capabilityRepo: Repository<VendorCapability>,
    @InjectRepository(VendorCapabilitySelection) private selectionRepo: Repository<VendorCapabilitySelection>,
    @InjectRepository(VendorCapabilityAcknowledgment) private acknowledgmentRepo: Repository<VendorCapabilityAcknowledgment>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private notificationsService: NotificationsService,
  ) {}

  // ── Summaries ─────────────────────────────────────────────────────────────

  /** Training status for several vendor users at once. */
  async summariesFor(userIds: string[]): Promise<Map<string, TrainingSummary>> {
    const result = new Map<string, TrainingSummary>();
    if (!userIds.length) return result;
    const modules = loadTrainingModules();
    const [profiles, selections, completions] = await Promise.all([
      this.profileRepo.find({ where: { userId: In(userIds) } }),
      this.selectionRepo.find({ where: { userId: In(userIds) }, relations: ['capability'] }),
      this.completionRepo.find({ where: { userId: In(userIds) }, order: { completedAt: 'ASC' } }),
    ]);
    const graceOf = new Map(profiles.map((p) => [p.userId, p.trainingGraceUntil ?? null]));
    for (const userId of userIds) {
      const names = selections.filter((s) => s.userId === userId && s.capability).map((s) => s.capability.name);
      const mine = completions.filter((c) => c.userId === userId);
      result.set(userId, summarize(modules, names, mine, graceOf.get(userId) ?? null));
    }
    return result;
  }

  async getSummary(userId: string): Promise<TrainingSummary> {
    return (await this.summariesFor([userId])).get(userId)!;
  }

  // ── One module ────────────────────────────────────────────────────────────

  // Any module can be opened, not only assigned ones: a service whose
  // capability needs training first (home monitoring) is taken before the
  // capability is selected.
  async getModule(userId: string, key: string) {
    const m = this.findModule(key);
    const summary = await this.getSummary(userId);
    const mine = summary.modules.find((s) => s.key === key);
    return {
      key: m.key,
      version: m.version,
      title: m.title,
      minutes: m.minutes,
      core: !!m.core,
      status: mine?.status ?? 'NOT_STARTED',
      assigned: !!mine,
      screens: m.screens.map((s, i) => ({
        title: s.title,
        text: s.text,
        imageUrl: assetPath(m.key, i + 1, 'webp'),
        audioUrl: assetPath(m.key, i + 1, 'mp3'),
      })),
      // The answers go to the app so a wrong pick can be explained straight
      // away; completion is still checked here on the server.
      questions: m.questions,
    };
  }

  async complete(userId: string, key: string, dto: CompleteTrainingDto): Promise<TrainingSummary> {
    const m = this.findModule(key);
    if (Number(dto.version) !== m.version) {
      throw new ConflictException('This training was updated. Please go through it again.');
    }
    if (!answersAreCorrect(m, dto.answers)) {
      throw new BadRequestException('Some answers are not right yet. Go back to the questions and try again.');
    }
    const confirmedName = (dto.confirmedName ?? '').trim().replace(/\s+/g, ' ');
    if (confirmedName.length < 2 || confirmedName.length > 100) {
      throw new BadRequestException('Type your full name to confirm.');
    }

    const before = await this.getSummary(userId);
    const existing = await this.completionRepo.findOne({ where: { userId, moduleKey: m.key, moduleVersion: m.version } });
    if (!existing) {
      const profile = await this.profileRepo.findOne({ where: { userId } });
      const attempts = Math.max(m.questions.length, Math.min(1000, Math.floor(Number(dto.attempts) || m.questions.length)));
      const firstTry = Math.max(0, Math.min(m.questions.length, Math.floor(Number(dto.answersCorrectFirstTry ?? m.questions.length) || 0)));
      await this.completionRepo.save(this.completionRepo.create({
        userId,
        companyId: profile?.companyId ?? null,
        moduleKey: m.key,
        moduleVersion: m.version,
        attempts,
        answersCorrectFirstTry: firstTry,
        confirmedName,
      }));
      await this.acknowledgeCapabilities(userId, m);
    }

    const after = await this.getSummary(userId);
    if (!before.allDone && after.allDone) await this.sendCompletion(userId, after).catch((err) =>
      this.logger.warn(`Training completion notice for ${userId} failed: ${(err as Error).message}`));
    return after;
  }

  // Finishing a module also records the older "I've read the training"
  // acknowledgement for any capability it covers that requires one (YoLink
  // home monitoring), so the capability can then be selected.
  private async acknowledgeCapabilities(userId: string, m: TrainingModule) {
    if (m.appliesTo === 'ALL') return;
    const caps = await this.capabilityRepo.find({ where: { name: In(m.appliesTo), requiresAcknowledgment: true } });
    for (const cap of caps) {
      const has = await this.acknowledgmentRepo.findOne({ where: { userId, capabilityId: cap.id } });
      if (!has) await this.acknowledgmentRepo.save(this.acknowledgmentRepo.create({ userId, capabilityId: cap.id }));
    }
  }

  private async sendCompletion(userId: string, summary: TrainingSummary) {
    const [user, profile] = await Promise.all([
      this.usersRepo.findOne({ where: { id: userId } }),
      this.profileRepo.findOne({ where: { userId } }),
    ]);
    const lines = summary.modules.map((s) => `${s.title} (${formatDate(s.completedAt!)})`).join('; ');
    await this.notificationsService.notifyUserWithEmail(
      userId, NotificationType.TRAINING_COMPLETE,
      'Training complete',
      `You finished all ${summary.requiredCount} of your Attenteve training modules: ${lines}. Thank you. Jobs for your services now show in the app.`,
      { screen: 'vendor-training' },
    );

    if (!profile?.companyId) return;
    const admins = await this.profileRepo.find({ where: { companyId: profile.companyId, isCompanyAdmin: true } });
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'A team member';
    for (const a of admins) {
      if (a.userId === userId) continue;
      await this.notificationsService.notifyUserWithEmail(
        a.userId, NotificationType.TRAINING_COMPLETE,
        `${name} finished their training`,
        `${name} completed all ${summary.requiredCount} assigned Attenteve training modules: ${lines}.`,
        { screen: 'vendor-team', technicianId: userId },
      ).catch(() => {});
    }
  }

  // ── Team and admin views ──────────────────────────────────────────────────

  async getTeam(userId: string) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile?.companyId || !profile.isCompanyAdmin) {
      throw new ForbiddenException('Only your company admin can see the team\'s training.');
    }
    return this.companyTraining(profile.companyId);
  }

  async companyTraining(companyId: string) {
    const profiles = await this.profileRepo.find({ where: { companyId } });
    const userIds = profiles.map((p) => p.userId);
    const [users, summaries] = await Promise.all([
      userIds.length ? this.usersRepo.find({ where: { id: In(userIds) } }) : Promise.resolve([] as User[]),
      this.summariesFor(userIds),
    ]);
    const userOf = new Map(users.map((u) => [u.id, u]));
    return profiles.map((p) => {
      const u = userOf.get(p.userId);
      return {
        userId: p.userId,
        name: u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '',
        email: u?.email ?? null,
        isCompanyAdmin: p.isCompanyAdmin,
        ...summaries.get(p.userId)!,
      };
    });
  }

  async adminTrainingForUser(userId: string) {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Vendor not found');
    if (profile.companyId) return this.companyTraining(profile.companyId);
    const u = await this.usersRepo.findOne({ where: { id: userId } });
    return [{
      userId, name: u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '', email: u?.email ?? null,
      isCompanyAdmin: profile.isCompanyAdmin, ...(await this.getSummary(userId)),
    }];
  }

  private findModule(key: string): TrainingModule {
    const m = loadTrainingModules().find((x) => x.key === key);
    if (!m) throw new NotFoundException('Training module not found');
    return m;
  }

  // ── Grace period for vendors already working ──────────────────────────────

  // Runs at every startup but acts once: the first time training exists
  // (no completions and no grace dates yet), everyone in an approved company
  // gets TRAINING_GRACE_DAYS to finish before their jobs are hidden. Vendors
  // who join later have no grace — their jobs show once training is done.
  async onApplicationBootstrap() {
    try {
      await this.backfillGrace(new Date());
    } catch (err) {
      this.logger.error(`Training grace backfill failed: ${(err as Error).message}`);
    }
  }

  async backfillGrace(now: Date): Promise<number> {
    const started = (await this.completionRepo.count()) > 0
      || (await this.profileRepo.count({ where: { trainingGraceUntil: Not(IsNull()) } })) > 0;
    if (started) return 0;
    const approved = await this.companyRepo.find({ where: { applicationStatus: VendorApplicationStatus.APPROVED } });
    if (!approved.length) return 0;
    const res = await this.profileRepo.update(
      { companyId: In(approved.map((c) => c.id)) },
      { trainingGraceUntil: new Date(now.getTime() + TRAINING_GRACE_DAYS * DAY_MS) },
    );
    this.logger.log(`Gave ${res.affected ?? 0} existing vendor user(s) ${TRAINING_GRACE_DAYS} days to finish training`);
    return res.affected ?? 0;
  }

  // ── Reminders ─────────────────────────────────────────────────────────────

  // 9:30 every morning, server time. Tells each vendor user in an approved
  // company about training they still owe: once when it is first assigned
  // (or a module is updated), then 7, 3 and 1 days before their grace ends.
  // trainingReminderKey remembers the last notice, so nothing repeats.
  @Cron('0 30 9 * * *')
  async remind(now = new Date()): Promise<{ sent: number }> {
    let sent = 0;
    try {
      const approved = await this.companyRepo.find({ where: { applicationStatus: VendorApplicationStatus.APPROVED } });
      if (!approved.length) return { sent };
      const profiles = await this.profileRepo.find({ where: { companyId: In(approved.map((c) => c.id)) } });
      const summaries = await this.summariesFor(profiles.map((p) => p.userId));
      for (const p of profiles) {
        const notice = reminderFor(summaries.get(p.userId)!, p.trainingReminderKey, now);
        if (notice === undefined) continue;
        if (notice) {
          await this.notificationsService.notifyUserWithEmail(
            p.userId, NotificationType.TRAINING_REMINDER, notice.title, notice.body, { screen: 'vendor-training' },
          ).catch((err) => this.logger.warn(`Training reminder for ${p.userId} failed: ${(err as Error).message}`));
          sent++;
        }
        await this.profileRepo.update(p.id, { trainingReminderKey: notice?.key ?? null });
      }
    } catch (err) {
      this.logger.error(`Training reminder run failed: ${(err as Error).message}`);
    }
    if (sent) this.logger.log(`Sent ${sent} training reminder(s)`);
    return { sent };
  }
}

/** Builds one user's training summary from their capability names and completions. */
export function summarize(
  modules: TrainingModule[],
  capabilityNames: string[],
  completions: Pick<TrainingCompletion, 'moduleKey' | 'moduleVersion' | 'completedAt' | 'confirmedName'>[],
  graceUntil: Date | null,
): TrainingSummary {
  const assigned = assignedModules(modules, capabilityNames);
  const items: TrainingModuleSummary[] = assigned.map((m) => {
    const forKey = completions.filter((c) => c.moduleKey === m.key);
    const current = forKey.find((c) => c.moduleVersion === m.version);
    const latest = current ?? forKey[forKey.length - 1];
    return {
      key: m.key,
      title: m.title,
      minutes: m.minutes,
      core: !!m.core,
      version: m.version,
      status: current ? 'DONE' : latest ? 'UPDATE_NEEDED' : 'NOT_STARTED',
      completedAt: latest?.completedAt ?? null,
      confirmedName: latest?.confirmedName ?? null,
    };
  });
  const done = items.filter((i) => i.status === 'DONE');
  const allDone = done.length === items.length;
  return {
    modules: items,
    requiredCount: items.length,
    doneCount: done.length,
    minutesLeft: items.filter((i) => i.status !== 'DONE').reduce((n, i) => n + i.minutes, 0),
    coreDone: items.filter((i) => i.core).every((i) => i.status === 'DONE'),
    allDone,
    completedAt: allDone && done.length
      ? new Date(Math.max(...done.map((i) => new Date(i.completedAt!).getTime())))
      : null,
    graceUntil,
  };
}

/**
 * The reminder to send now, null to clear the stored key (nothing owed), or
 * undefined when nothing changed since the last one.
 */
export function reminderFor(
  summary: TrainingSummary,
  lastKey: string | null,
  now: Date,
): { key: string; title: string; body: string } | null | undefined {
  const owed = summary.modules.filter((m) => m.status !== 'DONE');
  if (!owed.length) return lastKey ? null : undefined;

  const set = owed.map((m) => `${m.key}@${m.version}`).join(',');
  const grace = summary.graceUntil && new Date(summary.graceUntil).getTime() > now.getTime() ? new Date(summary.graceUntil) : null;
  const daysLeft = grace ? Math.ceil((grace.getTime() - now.getTime()) / DAY_MS) : null;
  const stage = daysLeft === null ? 'assigned' : daysLeft <= 1 ? 'd1' : daysLeft <= 3 ? 'd3' : daysLeft <= 7 ? 'd7' : 'assigned';

  const lastSet = lastKey?.split('|')[0];
  const lastStage = lastKey?.split('|')[1];
  // Same modules owed: only a later countdown stage is worth a new notice.
  if (lastSet === set && (stage === 'assigned' || stage === lastStage)) return undefined;

  const titles = owed.map((m) => m.title).join(', ');
  const minutes = owed.reduce((n, m) => n + m.minutes, 0);
  const onlyUpdates = owed.every((m) => m.status === 'UPDATE_NEEDED');
  const key = `${set}|${stage}`;
  const plural = owed.length === 1 ? 'module' : 'modules';

  if (stage !== 'assigned' && grace) {
    const when = daysLeft! <= 1 ? 'tomorrow' : `in ${daysLeft} days`;
    return {
      key,
      title: `Finish your training ${when}`,
      body: `New jobs stop showing on ${formatDate(grace)} until you finish your Attenteve training: ${titles} (about ${minutes} minutes). Open My Training in the Attenteve app.`,
    };
  }
  return {
    key,
    title: onlyUpdates ? 'Your training was updated' : 'Your Attenteve training',
    body: `${onlyUpdates ? `We updated ${owed.length === 1 ? 'a training module' : 'some training modules'} you took` : `You have ${owed.length} training ${plural} to take`}: ${titles} (about ${minutes} minutes). ${
      grace ? `Finish by ${formatDate(grace)} to keep seeing new jobs.` : 'Jobs for these services show once you finish.'
    } Open My Training in the Attenteve app.`,
  };
}
