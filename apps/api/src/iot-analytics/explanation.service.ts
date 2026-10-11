import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { In, Repository } from 'typeorm';
import axios from 'axios';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsAnomaly } from './entities/analytics-anomaly.entity';
import { AnalyticsFinding } from './entities/analytics-finding.entity';
import { AnalyticsExplanation } from './entities/analytics-explanation.entity';
import { TelemetryDataQuality, TelemetryEvent } from './entities/telemetry-event.entity';
import { SENSOR_ROLE_META, SensorRole } from '../common/enums/sensor-role.enum';
import { RULE_DEFINITIONS } from './rule-definitions';
import { RECOMMENDED_ACTION_CATALOG } from './recommended-action-catalog';
import { DETECTOR_VERSION } from './anomaly/anomaly-detector';
import { assessConfidence } from './anomaly/confidence';
import {
  EXPLANATION_JSON_SCHEMA, EvidenceItem, EvidencePackage, PROMPT_VERSION, fallbackExplanation, systemPrompt, validateExplanation,
} from './anomaly/explanation';

export const EXPLANATION_QUEUE = 'hvac-explanations';
// Roles whose data availability is reported per component domain.
const RELEVANT_ROLES: Record<string, SensorRole[]> = {
  PERFORMANCE: [SensorRole.INDOOR_AMBIENT_TEMP, SensorRole.HVAC_STATE, SensorRole.HVAC_THERMOSTAT_SETPOINT, SensorRole.HVAC_SUPPLY_TEMP, SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_OUTDOOR_TEMP],
  REFRIGERANT: [SensorRole.HVAC_SUCTION_LINE_TEMP, SensorRole.HVAC_LIQUID_LINE_TEMP, SensorRole.HVAC_STATE, SensorRole.HVAC_SUPPLY_TEMP, SensorRole.HVAC_RETURN_TEMP, SensorRole.HVAC_OUTDOOR_TEMP],
  HUMIDITY: [SensorRole.INDOOR_AMBIENT_HUMIDITY, SensorRole.HVAC_STATE, SensorRole.HVAC_DRAIN_WATER],
  CONDENSATE: [SensorRole.HVAC_DRAIN_WATER, SensorRole.INDOOR_AMBIENT_HUMIDITY],
  CONTROLS: [SensorRole.HVAC_STATE, SensorRole.HVAC_THERMOSTAT_SETPOINT, SensorRole.INDOOR_AMBIENT_TEMP],
};
// Homeowner-safe + professional referral actions the LLM may choose from.
const ALLOWED_ACTION_CODES = ['CHECK_AIR_FILTER', 'CHECK_VENTS_AIRFLOW', 'CHECK_CONDENSATE_DRAIN', 'CHECK_THERMOSTAT_SETTINGS', 'CHECK_THERMOSTAT_ONLINE', 'CHECK_SENSOR_CONNECTIVITY', 'SCHEDULE_CONTRACTOR_VISIT', 'GET_ATTENTEVE_HELP'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// LLM explanations (spec §6–7) — an interpretation layer only. Runs from a
// Bull job, never inline with ingestion or rules; every answer is validated
// against the evidence before it's stored, and a deterministic explanation
// is stored instead whenever the LLM is off, unreachable, slow or wrong.
@Injectable()
export class ExplanationService {
  private readonly logger = new Logger(ExplanationService.name);

  constructor(
    @InjectQueue(EXPLANATION_QUEUE) private queue: Queue,
    @InjectRepository(AnalyticsEvent) private eventsRepo: Repository<AnalyticsEvent>,
    @InjectRepository(AnalyticsAnomaly) private anomaliesRepo: Repository<AnalyticsAnomaly>,
    @InjectRepository(AnalyticsFinding) private findingsRepo: Repository<AnalyticsFinding>,
    @InjectRepository(AnalyticsExplanation) private explanationsRepo: Repository<AnalyticsExplanation>,
    @InjectRepository(TelemetryEvent) private telemetryRepo: Repository<TelemetryEvent>,
    private config: ConfigService,
  ) {}

  get enabled(): boolean { return this.config.get('HVAC_AI_EXPLANATIONS_ENABLED', 'true') !== 'false'; }
  private get model(): string { return this.config.get('HVAC_LLM_MODEL') || this.config.get('OLLAMA_MODEL', 'llama3.1:8b'); }
  private get ollamaUrl(): string { return this.config.get('OLLAMA_URL', 'http://localhost:11434'); }
  private get timeoutMs(): number { return Number(this.config.get('HVAC_LLM_TIMEOUT_MS', 120000)); }
  private get maxRetries(): number { return Number(this.config.get('HVAC_LLM_MAX_RETRIES', 2)); }

  // Never awaits the LLM: drops a deduplicated job (one per event+evidence).
  async enqueue(eventId: string, evidenceHash: string): Promise<void> {
    if (!this.enabled) return;
    await this.queue.add({ eventId, evidenceHash }, { jobId: `${eventId}:${evidenceHash}`, removeOnComplete: true, removeOnFail: true })
      .catch((e) => this.logger.warn(`Could not queue explanation for event ${eventId}: ${e.message}`));
  }

  async latestFor(eventId: string): Promise<AnalyticsExplanation | null> {
    return this.explanationsRepo.findOne({ where: { eventId }, order: { createdAt: 'DESC' } });
  }

  async explain(eventId: string, force = false): Promise<AnalyticsExplanation> {
    const event = await this.eventsRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (!force) {
      const cached = await this.explanationsRepo.findOne({ where: { eventId, evidenceHash: event.evidenceHash, status: 'OK' } });
      if (cached) return cached;
    }
    const pkg = await this.buildEvidence(event);
    const started = Date.now();
    let reasons: string[] = [];
    let output: Record<string, any> | null = null;
    if (this.enabled) {
      for (let attempt = 0; attempt <= this.maxRetries && !output; attempt++) {
        try {
          const raw = await this.callLlm(pkg);
          const result = validateExplanation(raw, pkg);
          if (result.ok) output = result.explanation!;
          else reasons = result.reasons;
        } catch (err: any) {
          reasons = [`LLM unavailable: ${err.code ?? ''} ${err.message}`.trim()];
          if (attempt < this.maxRetries) await sleep(5000 * (attempt + 1));
        }
      }
    } else {
      reasons = ['AI explanations disabled'];
    }
    const row = this.explanationsRepo.create({
      eventId, evidenceHash: event.evidenceHash, status: output ? 'OK' : 'FALLBACK',
      output: output ?? fallbackExplanation(pkg), rejectionReasons: output ? null : reasons, evidence: pkg as any,
      model: this.enabled ? this.model : null, promptVersion: PROMPT_VERSION, detectorVersion: DETECTOR_VERSION,
      configVersion: event.anomalyIds.length ? (await this.anomaliesRepo.findOne({ where: { id: event.anomalyIds[0] } }))?.configVersion ?? 'unknown' : 'rules-only',
      latencyMs: Date.now() - started,
    });
    if (!output) this.logger.warn(`Explanation for event ${eventId} fell back to deterministic text: ${reasons.slice(0, 2).join('; ')}`);
    return this.explanationsRepo.save(row);
  }

  private async callLlm(pkg: EvidencePackage): Promise<any> {
    const res = await axios.post(`${this.ollamaUrl}/api/chat`, {
      model: this.model, stream: false, format: EXPLANATION_JSON_SCHEMA, options: { temperature: 0 },
      messages: [{ role: 'system', content: systemPrompt() }, { role: 'user', content: JSON.stringify(pkg) }],
    }, { timeout: this.timeoutMs });
    const content = res.data?.message?.content;
    if (typeof content !== 'string') throw new Error('LLM returned no message content');
    return JSON.parse(content);
  }

  // Minimum evidence for the explanation (spec §6.1): event, contributing
  // findings/anomalies, latest relevant readings, data availability,
  // operating context, deterministic confidence, allowed actions. No names,
  // addresses, credentials or unrelated homeowner data.
  async buildEvidence(event: AnalyticsEvent): Promise<EvidencePackage> {
    const findings = event.findingIds.length ? await this.findingsRepo.find({ where: { id: In(event.findingIds) } }) : [];
    const anomalies = event.anomalyIds.length ? await this.anomaliesRepo.find({ where: { id: In(event.anomalyIds) } }) : [];
    const label = (role: string) => SENSOR_ROLE_META[role as SensorRole]?.label ?? role;
    const items: EvidenceItem[] = [
      ...findings.map((f) => ({
        ref: `finding:${f.id}`, kind: 'rule_finding' as const, observedAt: f.detectedAt.toISOString(),
        description: `Rule ${f.ruleId} (${RULE_DEFINITIONS.find((r) => r.ruleId === f.ruleId)?.label ?? ''}) ${f.status === 'ACTIVE' ? 'active' : 'resolved'}: ${f.message}`,
        values: numericValues(f.measurements),
      })),
      ...anomalies.map((a) => ({
        ref: `anomaly:${a.id}`, kind: 'anomaly' as const, observedAt: a.lastObservedAt.toISOString(), unit: a.unit,
        description: `${label(a.sensorRole)}: ${a.type.toLowerCase().replace('_', ' ')} (${a.state.toLowerCase()}) — observed ${a.observed}${a.unit} vs baseline median ${a.baseline?.median ?? 'n/a'}${a.unit}${a.robustZ != null ? `, robust z ${a.robustZ}` : ''}, ${a.consecutive} reading(s) since ${a.startedAt.toISOString()}`,
        values: { observed: a.observed, baselineMedian: a.baseline?.median ?? null, baselineMad: a.baseline?.mad ?? null, robustZ: a.robustZ, deviation: a.deviation },
      })),
    ];
    // Latest reading per relevant role in this home.
    const roles = [...new Set(event.components.flatMap((c) => RELEVANT_ROLES[c] ?? []))];
    const dataAvailability: EvidencePackage['dataAvailability'] = [];
    for (const role of roles) {
      const latest = await this.telemetryRepo.findOne({ where: { homeId: event.homeId, sensorRole: role, dataQuality: TelemetryDataQuality.VALID }, order: { observedAt: 'DESC' } });
      const ageMin = latest ? (Date.now() - latest.observedAt.getTime()) / 60_000 : null;
      // Coarse 24 h availability for the explanation only — several of these
      // sensors report on change, so a quiet hour isn't missing data; the
      // per-source freshness rules live in data-quality.ts / health.
      dataAvailability.push({ input: label(role), state: !latest ? 'NO_DATA' : ageMin! > 24 * 60 ? 'STALE' : 'OK' });
      if (latest) items.push({ ref: `reading:${role}@${latest.observedAt.toISOString()}`, kind: 'reading', description: `Latest ${label(role)}: ${latest.value}${latest.unit ?? ''}`, values: { value: latest.numericValue != null ? Number(latest.numericValue) : latest.value }, unit: latest.unit ?? undefined, observedAt: latest.observedAt.toISOString() });
    }
    const ctx = anomalies.find((a) => a.context)?.context ?? {};
    const confidence = assessConfidence({
      robustZs: anomalies.map((a) => a.robustZ),
      ruleFindings: findings.filter((f) => f.status === 'ACTIVE').length,
      independentSignals: new Set([...anomalies.map((a) => a.sensorRole), ...findings.map((f) => f.ruleGroup ?? f.ruleId)]).size,
      inputsOk: dataAvailability.filter((d) => d.state === 'OK').length, inputsTotal: dataAvailability.length,
      sensorQualityProblem: anomalies.some((a) => a.type === 'SENSOR_QUALITY') || event.category === 'SENSOR',
      disagreement: !!event.disagreement,
    });
    return {
      event: { id: event.id, component: event.component, components: event.components, category: event.category, startedAt: event.startedAt.toISOString(), lastOccurrenceAt: event.lastOccurrenceAt.toISOString(), status: event.status, severity: event.severity },
      items, dataAvailability,
      operatingContext: { mode: ctx.mode ?? null, outdoorBand: ctx.band ?? null, cycleStage: ctx.cycleBucket ?? null, reducedContext: ctx.reducedContext ? 'yes' : 'no' },
      confidence,
      allowedActions: RECOMMENDED_ACTION_CATALOG.filter((a) => ALLOWED_ACTION_CODES.includes(a.actionCode)).map((a) => ({ code: a.actionCode, title: a.title })),
    };
  }
}

function numericValues(m: Record<string, any> | null): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'number' || typeof v === 'string') out[k] = v;
  return out;
}
