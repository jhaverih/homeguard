import axios from 'axios';
import { FindOperator } from 'typeorm';
import { ExplanationService } from './explanation.service';
import { EventCorrelationService } from './event-correlation.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function repo(rows: any[] = []) {
  const match = (r: any, where: any) => Object.entries(where ?? {}).every(([k, v]) => {
    if (v instanceof FindOperator) {
      const inner = (v as any)._value;
      if (v.type === 'in') return (inner as any[]).includes(r[k]);
      if (v.type === 'moreThan') return r[k] > inner;
      throw new Error(`op ${v.type}`);
    }
    return r[k] === v;
  });
  let seq = 0;
  return {
    rows,
    find: jest.fn(async (o: any = {}) => rows.filter((r) => match(r, o.where))),
    findOne: jest.fn(async (o: any = {}) => rows.filter((r) => match(r, o.where)).slice(-1)[0] ?? null),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => { if (!rows.includes(d)) { d.id ??= `id-${++seq}`; d.createdAt ??= new Date(); rows.push(d); } return d; }),
  };
}

const T0 = new Date(Date.UTC(2026, 6, 15, 14, 5));
const anomaly = { id: 'a-1', customerId: 'c', homeId: 'h', equipmentId: 'eq', deviceRegistryId: 'd-s', sensorRole: 'HVAC_SUCTION_LINE_TEMP', component: 'REFRIGERANT', type: 'PERSISTENT', state: 'ACTIVE', startedAt: T0, lastObservedAt: new Date(T0.getTime() + 30 * 60_000), resolvedAt: null, observed: 60.5, baseline: { median: 48, mad: 0.8, n: 400 }, deviation: 12.5, unit: '°F', robustZ: 10.5, consecutive: 12, method: 'rolling-median-mad', configVersion: 'cfg1', transition: false, context: { mode: 'COOLING', band: '90s', cycleBucket: '15+' } };
const event = { id: 'ev-1', customerId: 'c', homeId: 'h', equipmentId: 'eq', component: 'REFRIGERANT', components: ['REFRIGERANT'], category: 'EQUIPMENT', status: 'ACTIVE', startedAt: T0, lastOccurrenceAt: anomaly.lastObservedAt, resolvedAt: null, severity: 'INFO', findingIds: [], anomalyIds: ['a-1'], disagreement: null, evidenceHash: 'h1', notifiedSeverity: null };
const config = (over: Record<string, string> = {}) => ({ get: (k: string, d?: any) => ({ HVAC_LLM_MAX_RETRIES: '0', HVAC_LLM_TIMEOUT_MS: '1000', ...over } as any)[k] ?? d });

describe('ExplanationService', () => {
  let queue: { add: jest.Mock };
  let explanations: ReturnType<typeof repo>;
  let service: ExplanationService;
  beforeEach(() => {
    jest.resetAllMocks();
    queue = { add: jest.fn(async () => ({})) };
    explanations = repo();
    service = new ExplanationService(queue as any, repo([event]) as any, repo([anomaly]) as any, repo() as any, explanations as any, repo() as any, config() as any);
  });

  it('13. queuing never touches the LLM — rules/ingestion are never blocked by it', async () => {
    await service.enqueue('ev-1', 'h1');
    expect(queue.add).toHaveBeenCalledWith({ eventId: 'ev-1', evidenceHash: 'h1' }, expect.objectContaining({ jobId: 'ev-1:h1' }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('11. stores a validated LLM explanation that cites only supplied evidence', async () => {
    mockedAxios.post.mockResolvedValue({ data: { message: { content: JSON.stringify({
      summary: 'The suction-line temperature is above its normal stable-cooling pattern.',
      observations: ['Suction-line temperature 60.5 °F vs a usual 48 °F.'],
      possible_causes: [{ cause: 'Reduced airflow could raise suction temperature', supporting_evidence: ['above baseline'], contradicting_evidence: ['supply air not measured'] }],
      confidence_label: 'insufficient_evidence', confidence_rationale: 'Only one signal and some inputs missing.',
      recommended_actions: ['Check the air filter'], customer_message: 'A cooling temperature is higher than usual. Checking the filter is a good first step.',
      technician_message: 'Suction 60.5 vs 48 baseline, z 10.5.', additional_data_needed: ['Supply air temperature'], safety_note: null,
      evidence_references: ['anomaly:a-1'],
    }) } } });
    const row = await service.explain('ev-1');
    expect(row).toMatchObject({ status: 'OK', model: 'llama3.1:8b', promptVersion: expect.any(String), detectorVersion: expect.any(String), configVersion: 'cfg1' });
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({ format: expect.any(Object), stream: false, options: { temperature: 0 } });
  });

  it('12. rejects unsupported output and stores the deterministic fallback with the reasons', async () => {
    mockedAxios.post.mockResolvedValue({ data: { message: { content: JSON.stringify({ summary: 'Low refrigerant confirmed: add refrigerant now.' }) } } });
    const row = await service.explain('ev-1');
    expect(row.status).toBe('FALLBACK');
    expect(row.rejectionReasons!.length).toBeGreaterThan(0);
    expect(row.output.evidence_references).toEqual(['anomaly:a-1']);
  });

  it('13. an LLM timeout falls back instead of failing', async () => {
    mockedAxios.post.mockRejectedValue(Object.assign(new Error('timeout of 1000ms exceeded'), { code: 'ECONNABORTED' }));
    const row = await service.explain('ev-1');
    expect(row).toMatchObject({ status: 'FALLBACK', rejectionReasons: [expect.stringMatching(/LLM unavailable: ECONNABORTED/)] });
  });

  it('honors the kill switch: no LLM call when disabled', async () => {
    const off = new ExplanationService(queue as any, repo([event]) as any, repo([anomaly]) as any, repo() as any, repo() as any, repo() as any, config({ HVAC_AI_EXPLANATIONS_ENABLED: 'false' }) as any);
    await off.enqueue('ev-1', 'h1');
    const row = await off.explain('ev-1');
    expect(queue.add).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(row).toMatchObject({ status: 'FALLBACK', model: null });
  });
});

describe('EventCorrelationService', () => {
  it('10. re-running correlation on unchanged evidence neither duplicates the event nor re-queues an explanation', async () => {
    const events = repo();
    const explain = { enqueue: jest.fn(async () => {}) };
    const svc = new EventCorrelationService(events as any, repo([anomaly]) as any, repo() as any, repo() as any,
      { getValue: async () => 60 } as any, config() as any, explain as any);
    const home: any = { id: 'yh', customerId: 'c', homeId: 'h' };
    await svc.correlateHome(home, new Date(T0.getTime() + 40 * 60_000));
    await svc.correlateHome(home, new Date(T0.getTime() + 45 * 60_000));
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]).toMatchObject({ component: 'REFRIGERANT', anomalyIds: ['a-1'], severity: 'INFO', status: 'ACTIVE', startedAt: T0 });
    expect(explain.enqueue).toHaveBeenCalledTimes(1);
  });
});
