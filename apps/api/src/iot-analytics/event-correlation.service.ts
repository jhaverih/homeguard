import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { MoreThan, Repository } from 'typeorm';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsAnomaly } from './entities/analytics-anomaly.entity';
import { AnalyticsFinding, FindingStatus } from './entities/analytics-finding.entity';
import { RuleEvaluation } from './entities/rule-evaluation.entity';
import { YolinkHome } from '../yolink/entities/yolink-home.entity';
import { ThresholdsService } from './thresholds.service';
import { ExplanationService } from './explanation.service';
import { correlate, shouldNotify } from './anomaly/correlation';
import { RULE_DEFINITIONS } from './rule-definitions';

const LOOKBACK_DAYS = 7;

// Groups rule findings + statistical anomalies into correlated events
// (spec §5). Reads findings, never writes them — rule behavior, alerts and
// health are untouched. New/changed evidence queues an explanation.
@Injectable()
export class EventCorrelationService {
  private readonly logger = new Logger(EventCorrelationService.name);

  constructor(
    @InjectRepository(AnalyticsEvent) private eventsRepo: Repository<AnalyticsEvent>,
    @InjectRepository(AnalyticsAnomaly) private anomaliesRepo: Repository<AnalyticsAnomaly>,
    @InjectRepository(AnalyticsFinding) private findingsRepo: Repository<AnalyticsFinding>,
    @InjectRepository(RuleEvaluation) private evaluationsRepo: Repository<RuleEvaluation>,
    private thresholds: ThresholdsService,
    private config: ConfigService,
    private explanations: ExplanationService,
  ) {}

  // Event-level notifications are off during the shadow phase; existing
  // rule alerts are unaffected either way.
  get notificationsEnabled(): boolean {
    return this.config.get('HVAC_EVENT_NOTIFICATIONS_ENABLED', 'false') === 'true';
  }

  async correlateHome(home: YolinkHome, now: Date): Promise<AnalyticsEvent[]> {
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
    const windowMinutes = await this.thresholds.getValue('CORRELATION_WINDOW_MINUTES', home.customerId);
    const findings = (await this.findingsRepo.find({ where: { customerId: home.customerId } }))
      .filter((f) => f.status === FindingStatus.ACTIVE || f.detectedAt >= since)
      .filter((f) => f.status !== FindingStatus.DISMISSED && !(f.measurements as any)?.supersededBy)
      .filter((f) => (f.ruleVersion ?? 1) >= (RULE_DEFINITIONS.find((r) => r.ruleId === f.ruleId)?.version ?? 1));
    // Isolated single readings are noise; they're kept for review but never form events.
    const anomalies = (await this.anomaliesRepo.find({ where: { customerId: home.customerId, lastObservedAt: MoreThan(since) } }))
      .filter((a) => a.type !== 'ISOLATED' && a.state !== 'UNCONFIRMED');
    const evaluations = await this.evaluationsRepo.find({ where: { customerId: home.customerId } });

    const groups = correlate(
      findings.map((f) => ({ id: f.id, ruleId: f.ruleId, ruleGroup: f.ruleGroup, severity: f.severity, status: f.status, detectedAt: f.detectedAt, resolvedAt: f.resolvedAt, sensorRole: f.sensorRole })),
      anomalies.map((a) => ({ id: a.id, sensorRole: a.sensorRole, type: a.type, state: a.state, startedAt: a.startedAt, lastObservedAt: a.resolvedAt ?? a.lastObservedAt, robustZ: a.robustZ, transition: a.transition })),
      evaluations.map((e) => ({ ruleId: e.ruleId, outcome: e.outcome })),
      { windowMinutes },
    );

    const existing = await this.eventsRepo.find({ where: { customerId: home.customerId } });
    const touched = new Set<string>();
    const equipmentOf = new Map<string, string | null>([...findings.map((f) => [f.id, f.equipmentId] as const), ...anomalies.map((a) => [a.id, a.equipmentId] as const)]);
    for (const g of groups) {
      const members = new Set([...g.findingIds, ...g.anomalyIds]);
      let event = existing.find((e) => !touched.has(e.id) && [...e.findingIds, ...e.anomalyIds].some((id) => members.has(id)));
      const isNew = !event;
      if (!event) event = this.eventsRepo.create({ customerId: home.customerId, homeId: home.homeId!, notifiedSeverity: null });
      const changed = isNew || event.evidenceHash !== g.evidenceHash;
      Object.assign(event, {
        equipmentId: [...members].map((id) => equipmentOf.get(id)).find((x) => !!x) ?? null,
        component: g.component, components: g.components, category: g.category,
        status: g.active ? 'ACTIVE' : 'RESOLVED', startedAt: g.startedAt, lastOccurrenceAt: g.lastOccurrenceAt,
        resolvedAt: g.active ? null : event.resolvedAt ?? now, severity: g.severity,
        findingIds: g.findingIds, anomalyIds: g.anomalyIds, disagreement: g.disagreement, evidenceHash: g.evidenceHash,
      });
      if (shouldNotify(g, event.notifiedSeverity, this.notificationsEnabled)) event.notifiedSeverity = g.severity;
      event = await this.eventsRepo.save(event);
      touched.add(event.id);
      if (changed) await this.explanations.enqueue(event.id, g.evidenceHash);
    }
    // Events whose members no longer correlate (aged out / all resolved).
    for (const e of existing.filter((x) => x.status === 'ACTIVE' && !touched.has(x.id))) {
      e.status = 'RESOLVED';
      e.resolvedAt = now;
      await this.eventsRepo.save(e);
    }
    return this.eventsRepo.find({ where: { customerId: home.customerId } });
  }
}
