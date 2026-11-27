'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';

// Job event log (apps/api/src/job-events): every interaction on a job that
// affects its schedule or quality of service — bookings, acceptances,
// on my way, arrivals, cancellations, reschedules, extra work, messages,
// disputes, reviews. Counts for a date range, the latest events, and a CSV
// of everything for analysis in a spreadsheet.

type JobEvent = {
  id: string; occurredAt: string; ticketNumber: string | null; serviceRequestId: string;
  type: string; actorRole: string; status: string | null; scheduledFor: string | null;
  data: Record<string, unknown> | null; isTest: boolean;
};

const LABELS: Record<string, string> = {
  REQUESTED: 'Requested', VENDOR_PASSED: 'Vendor passed', ACCEPTED: 'Accepted',
  SCHEDULE_CONFIRMED: 'Time confirmed', SCHEDULE_DECLINED: 'Time declined', ASSIGNED: 'Assigned to technician',
  RESCHEDULED: 'Rescheduled', ON_MY_WAY: 'On my way', ARRIVED: 'Arrived', COMPLETED: 'Completed',
  CANCELLED: 'Cancelled', RELEASED: 'Released by vendor', STUCK_ON_THE_WAY: 'Stuck on the way',
  EXTRA_WORK_RECOMMENDED: 'Extra work recommended', EXTRA_TIME_REQUESTED: 'Extra time requested',
  EXTRA_WORK_APPROVED: 'Extra work approved', EXTRA_WORK_DECLINED: 'Extra work declined',
  MATERIAL_ADDED: 'Material added', MESSAGE_SENT: 'Message sent', DISPUTE_OPENED: 'Dispute opened',
  DISPUTE_RESOLVED: 'Dispute resolved', REVIEW_SUBMITTED: 'Review', QUOTE_SUBMITTED: 'Quote submitted',
  CONSULTATION_REQUESTED: 'Consultation requested', CONSULTATION_UPDATED: 'Consultation updated',
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function summary(e: JobEvent): string {
  const d = e.data ?? {};
  const parts: string[] = [];
  const n = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : null);
  if (n('minutesLate') != null) parts.push(n('minutesLate')! > 0 ? `${n('minutesLate')} min late` : `${-n('minutesLate')!} min early`);
  if (n('noticeHours') != null) parts.push(`${n('noticeHours')} h notice`);
  if (n('expectedMinutesLate') != null && n('expectedMinutesLate')! > 0) parts.push(`expected ${n('expectedMinutesLate')} min late`);
  if (n('onSiteMinutes') != null) parts.push(`${n('onSiteMinutes')} min on site`);
  if (n('minutesToAccept') != null) parts.push(`accepted after ${n('minutesToAccept')} min`);
  if (n('rating') != null) parts.push(`${n('rating')}★`);
  if (n('hours') != null) parts.push(`${n('hours')} h`);
  if (n('price') != null) parts.push(`$${n('price')}`);
  if (n('charged') != null) parts.push(`charged $${n('charged')}`);
  if (typeof d.how === 'string') parts.push(String(d.how));
  if (typeof d.lateFee === 'string') parts.push(`late fee ${d.lateFee}`);
  return parts.join(' · ');
}

export default function JobActivityPage() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [includeTest, setIncludeTest] = useState(false);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useMemo(() => ({
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59`).toISOString(),
    includeTest,
  }), [from, to, includeTest]);

  useEffect(() => {
    setLoading(true);
    setError('');
    adminApi.getJobEvents(params)
      .then((rows: JobEvent[]) => setEvents(rows))
      .catch((e: any) => setError(e?.response?.data?.message || 'Could not load job activity'))
      .finally(() => setLoading(false));
  }, [params]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.type] = (c[e.type] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [events]);

  const download = async () => {
    const res = await adminApi.downloadJobEventsCsv(params);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-events-${from}-to-${to}${includeTest ? '-with-tests' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-lantern-deep mb-2">Job Activity</h1>
          <p className="text-steel max-w-2xl">
            Every interaction on a job: bookings, acceptances, on my way, arrivals, cancellations, reschedules,
            extra work, messages, disputes and reviews. Download the CSV to analyse service and vendor quality.
          </p>
        </div>
        <button onClick={download} className="bg-lantern text-ink font-semibold rounded-lg px-4 py-2 hover:opacity-90">
          Download CSV
        </button>
      </div>

      <div className="flex items-center gap-4 flex-wrap mb-6 text-sm">
        <label className="flex items-center gap-2">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-border rounded-lg px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-border rounded-lg px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
          Include test accounts
        </label>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {counts.map(([type, count]) => (
          <div key={type} className="bg-white border border-border rounded-xl p-3">
            <div className="text-2xl font-bold text-ink">{count}</div>
            <div className="text-xs text-steel">{LABELS[type] ?? type}</div>
          </div>
        ))}
        {!loading && counts.length === 0 && <p className="text-steel col-span-full">No activity in this period.</p>}
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-steel border-b border-border">
              <th className="px-4 py-2">When</th><th className="px-4 py-2">Job</th><th className="px-4 py-2">What</th>
              <th className="px-4 py-2">By</th><th className="px-4 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {[...events].reverse().slice(0, 300).map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 whitespace-nowrap">{new Date(e.occurredAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                <td className="px-4 py-2 whitespace-nowrap">{e.ticketNumber ?? e.serviceRequestId.slice(0, 8)}{e.isTest ? <span className="ml-2 text-xs text-steel">test</span> : null}</td>
                <td className="px-4 py-2">{LABELS[e.type] ?? e.type}</td>
                <td className="px-4 py-2 text-steel">{e.actorRole.toLowerCase()}</td>
                <td className="px-4 py-2 text-steel">{summary(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="p-4 text-steel">Loading…</p>}
      </div>
    </div>
  );
}
