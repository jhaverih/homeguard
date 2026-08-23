import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { AnalyticsMetricSample } from './entities/analytics-metric-sample.entity';

export interface Baseline {
  mean: number;
  stddev: number;
  sampleCount: number;
}

// Minimum samples before a baseline is trusted enough to alert against —
// below this, "below baseline" is meaningless noise (e.g. day 2 of data).
// A rolling 14-day minimum roughly matches a home's normal day/night and
// weekday/weekend cooling-cycle variety.
const MIN_SAMPLES_FOR_BASELINE = 14;
const BASELINE_WINDOW_DAYS = 30;

// Generic statistics engine every needsBaseline:true rule reads from —
// "how far is today's reading from this specific home's own normal
// history" for whatever metric that rule cares about (delta-T, runtime,
// indoor temp variance, a power-draw signature, ...). Deliberately simple
// (mean + population stddev over a rolling window, computed on demand via
// a Postgres aggregate query) rather than a maintained rolling-stats cache
// table — sample volumes here (one home, a handful of metrics, daily-ish
// cadence) are far below where that complexity would pay for itself.
@Injectable()
export class BaselineService {
  constructor(@InjectRepository(AnalyticsMetricSample) private samplesRepo: Repository<AnalyticsMetricSample>) {}

  async recordSample(customerId: string, equipmentId: string, metricKey: string, value: number, observedAt: Date, context?: Record<string, any>): Promise<void> {
    await this.samplesRepo.save(this.samplesRepo.create({ customerId, equipmentId, metricKey, value, observedAt, context: context ?? null }));
  }

  // Returns null when there isn't yet enough history to trust — callers
  // treat that identically to "no baseline available," never as zero.
  async getBaseline(equipmentId: string, metricKey: string, windowDays = BASELINE_WINDOW_DAYS, minSamples = MIN_SAMPLES_FOR_BASELINE): Promise<Baseline | null> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const row = await this.samplesRepo.createQueryBuilder('s')
      .select('AVG(s.value)', 'mean')
      .addSelect('STDDEV_POP(s.value)', 'stddev')
      .addSelect('COUNT(*)', 'count')
      .where('s.equipmentId = :equipmentId', { equipmentId })
      .andWhere('s.metricKey = :metricKey', { metricKey })
      .andWhere('s.observedAt >= :since', { since })
      .getRawOne();

    const sampleCount = Number(row?.count ?? 0);
    if (sampleCount < minSamples) return null;
    return { mean: Number(row.mean), stddev: Number(row.stddev ?? 0), sampleCount };
  }

  // Most-recent-N raw samples — used by rules that need the actual recent
  // trend (e.g. "30-day rolling decline vs. prior period"), not just a
  // single mean/stddev snapshot.
  async getRecentSamples(equipmentId: string, metricKey: string, windowDays: number): Promise<AnalyticsMetricSample[]> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    return this.samplesRepo.find({
      where: { equipmentId, metricKey, observedAt: MoreThan(since) },
      order: { observedAt: 'ASC' },
    });
  }
}
