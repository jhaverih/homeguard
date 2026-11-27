import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { JobEvent, JobEventActor, JobEventType } from './job-event.entity';

// The job fields an event copies (a ServiceRequest, or enough of one).
export type JobRef = {
  id: string;
  ticketNumber?: string | null;
  bookingGroupId?: string | null;
  customerId?: string | null;
  vendorId?: string | null;
  status?: string | null;
  scheduledDate?: Date | string | null;
};

export type Actor = { role: JobEventActor; id?: string | null };

// Minutes from `a` to `b` (positive when b is later), rounded.
export function minutesBetween(a: Date | string | null | undefined, b: Date | string | null | undefined): number | null {
  if (!a || !b) return null;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(diff) ? Math.round(diff / 60000) : null;
}

// Hours of notice before the scheduled time (negative once it has passed).
export function noticeHours(scheduled: Date | string | null | undefined, at: Date = new Date()): number | null {
  const min = minutesBetween(at, scheduled);
  return min == null ? null : Math.round((min / 60) * 10) / 10;
}

@Injectable()
export class JobEventsService {
  private readonly logger = new Logger(JobEventsService.name);

  constructor(
    @InjectRepository(JobEvent) private eventsRepo: Repository<JobEvent>,
    private dataSource: DataSource,
  ) {}

  // Records one interaction. Never throws: a logging problem must not stop
  // a booking, an arrival or a payment.
  async record(type: JobEventType, job: JobRef, actor: Actor, data?: Record<string, unknown>): Promise<void> {
    try {
      let isTest = false;
      if (job.customerId) {
        const rows = await this.dataSource.query('SELECT "isTestAccount" FROM users WHERE id = $1', [job.customerId]);
        isTest = !!rows?.[0]?.isTestAccount;
      }
      const clean = data
        ? Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
        : null;
      await this.eventsRepo.insert({
        serviceRequestId: job.id,
        ticketNumber: job.ticketNumber ?? null,
        bookingGroupId: job.bookingGroupId ?? null,
        type,
        actorRole: actor.role,
        actorId: actor.id ?? null,
        customerId: job.customerId ?? null,
        vendorId: job.vendorId ?? null,
        status: job.status ?? null,
        scheduledFor: job.scheduledDate ? new Date(job.scheduledDate) : null,
        data: clean && Object.keys(clean).length ? clean : null,
        isTest,
      });
    } catch (err: any) {
      this.logger.warn(`Could not record ${type} for job ${job?.id}: ${err?.message ?? err}`);
    }
  }

  forJob(serviceRequestId: string): Promise<JobEvent[]> {
    return this.eventsRepo.find({ where: { serviceRequestId }, order: { occurredAt: 'ASC' } });
  }

  list(filter: { from?: Date; to?: Date; type?: string; vendorId?: string; includeTest?: boolean }, take = 5000): Promise<JobEvent[]> {
    const where: FindOptionsWhere<JobEvent> = {};
    if (filter.from || filter.to) where.occurredAt = Between(filter.from ?? new Date(0), filter.to ?? new Date());
    if (filter.type) where.type = filter.type as JobEventType;
    if (filter.vendorId) where.vendorId = filter.vendorId;
    if (!filter.includeTest) where.isTest = false;
    return this.eventsRepo.find({ where, order: { occurredAt: 'ASC' }, take: Math.min(Math.max(take, 1), 50000) });
  }

  // One row per event; `data` flattened to JSON so any spreadsheet opens it.
  toCsv(events: JobEvent[]): string {
    const cols = ['occurredAt', 'ticketNumber', 'serviceRequestId', 'bookingGroupId', 'type', 'actorRole', 'actorId',
      'customerId', 'vendorId', 'status', 'scheduledFor', 'isTest', 'data'] as const;
    const esc = (v: unknown) => {
      if (v == null) return '';
      const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(','), ...events.map((e) => cols.map((c) => esc((e as any)[c])).join(','))].join('\n');
  }
}
