'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  ACCEPTED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-orange-50 text-orange-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  PENDING: 'bg-yellow-50 text-yellow-700',
};

function fmt(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activity, setActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'jobs' | 'payments' | 'disputes' | 'alerts'>('jobs');

  useEffect(() => {
    adminApi.getCustomerActivity(id)
      .then(setActivity)
      .catch(() => setActivity(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-gray-400 text-sm py-12 text-center">Loading customer activity…</div>;
  }
  if (!activity) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Could not load customer data.</p>
        <button onClick={() => router.back()} className="mt-4 text-brand text-sm font-semibold hover:underline">← Back</button>
      </div>
    );
  }

  const { customer, serviceRequests = [], payments = [], disputes = [], alerts = [] } = activity;

  const tabs = [
    { key: 'jobs', label: 'Jobs & Inspections', count: serviceRequests.length },
    { key: 'payments', label: 'Payments', count: payments.length },
    { key: 'disputes', label: 'Disputes', count: disputes.length },
    { key: 'alerts', label: 'Alerts', count: alerts.length },
  ] as const;

  return (
    <div>
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand mb-6 transition-colors">
        ← Back
      </button>

      {/* Customer header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center text-2xl font-bold text-brand shrink-0">
            {(customer?.name ?? customer?.email ?? '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{customer?.name ?? '—'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{customer?.email}</p>
            {customer?.phone && <p className="text-sm text-gray-500">{customer.phone}</p>}
            {customer?.address && <p className="text-sm text-gray-400 mt-1">{customer.address}</p>}
          </div>
          <div className="text-right text-sm text-gray-400">
            <p>Member since</p>
            <p className="font-medium text-gray-700">{customer?.createdAt ? fmt(customer.createdAt) : '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-gray-100">
          {[
            { label: 'Total Jobs', value: serviceRequests.length },
            { label: 'Completed', value: serviceRequests.filter((r: any) => r.status === 'COMPLETED').length },
            { label: 'Total Paid', value: `$${payments.filter((p: any) => p.status === 'PAID').reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0).toFixed(2)}` },
            { label: 'Open Disputes', value: disputes.filter((d: any) => d.status === 'OPEN').length },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold text-brand">{stat.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Activity tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Jobs tab */}
      {tab === 'jobs' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {serviceRequests.length === 0 ? (
            <p className="text-gray-400 text-sm p-8 text-center">No jobs or inspections yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-[80px_1fr_160px_160px_120px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <span>ID</span><span>Service</span><span>Vendor</span><span>Date</span><span>Status</span>
              </div>
              {serviceRequests.map((req: any) => {
                const vendorName = req.vendor
                  ? `${req.vendor.firstName ?? ''} ${req.vendor.lastName ?? ''}`.trim() || req.vendor.email
                  : '—';
                return (
                  <div key={req.id} className="grid grid-cols-[80px_1fr_160px_160px_120px] gap-4 px-6 py-4 border-t border-gray-100 items-center hover:bg-gray-50">
                    <span className="text-xs text-gray-400 font-mono truncate">{req.ticketNumber || req.id.slice(0, 8)}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{req.type?.replace(/_/g, ' ') ?? 'Service'}</p>
                      <p className="text-xs text-gray-400 truncate">{req.address}, {req.city}</p>
                    </div>
                    <div>
                      {req.vendor?.id ? (
                        <a href={`/vendors/${req.vendor.id}`} className="text-sm text-green-700 hover:underline font-medium">
                          {vendorName}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">{vendorName}</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-600">{req.scheduledDate ? fmt(req.scheduledDate) : '—'}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold w-fit ${STATUS_COLOR[req.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {req.status?.replace(/_/g, ' ') ?? '—'}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Payments tab */}
      {tab === 'payments' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {payments.length === 0 ? (
            <p className="text-gray-400 text-sm p-8 text-center">No payment records yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_140px_120px_120px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <span>Description</span><span>Amount</span><span>Date</span><span>Status</span>
              </div>
              {payments.map((p: any) => (
                <div key={p.id} className="grid grid-cols-[1fr_140px_120px_120px] gap-4 px-6 py-4 border-t border-gray-100 items-center hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.description || p.serviceType || 'Service'}</p>
                    {p.vendorName && <p className="text-xs text-gray-400">Vendor: {p.vendorName}</p>}
                  </div>
                  <span className="text-sm font-semibold text-gray-800">${Number(p.amount).toFixed(2)}</span>
                  <span className="text-sm text-gray-500">{p.paidAt ? fmt(p.paidAt) : fmt(p.createdAt)}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold w-fit ${
                    p.status === 'PAID' ? 'bg-green-50 text-green-700' :
                    p.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{p.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Disputes tab */}
      {tab === 'disputes' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {disputes.length === 0 ? (
            <p className="text-gray-400 text-sm p-8 text-center">No disputes.</p>
          ) : (
            disputes.map((d: any, idx: number) => {
              const vendorName = d.vendor
                ? `${d.vendor.firstName ?? ''} ${d.vendor.lastName ?? ''}`.trim() || d.vendor.email
                : '—';
              return (
                <div key={d.id} className={`px-6 py-4 ${idx !== 0 ? 'border-t border-gray-100' : ''} hover:bg-gray-50`}>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                      d.status === 'OPEN' ? 'bg-red-50 text-red-700' :
                      d.status === 'RESOLVED_CUSTOMER' ? 'bg-blue-50 text-blue-700' :
                      d.status === 'RESOLVED_VENDOR' ? 'bg-green-50 text-green-700' :
                      'bg-yellow-50 text-yellow-700'
                    }`}>{d.status?.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-gray-400">{fmt(d.createdAt)}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">Vendor: {d.vendor?.id ? (
                      <a href={`/vendors/${d.vendor.id}`} className="text-green-700 hover:underline">{vendorName}</a>
                    ) : vendorName}</span>
                  </div>
                  <p className="text-sm text-gray-700">{d.description}</p>
                  <a href="/disputes" className="text-xs text-brand font-semibold hover:underline mt-1 inline-block">→ Manage in Disputes</a>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Alerts tab */}
      {tab === 'alerts' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {alerts.length === 0 ? (
            <p className="text-gray-400 text-sm p-8 text-center">No monitoring alerts.</p>
          ) : (
            alerts.map((a: any, idx: number) => (
              <div key={a.id} className={`px-6 py-4 ${idx !== 0 ? 'border-t border-gray-100' : ''} hover:bg-gray-50`}>
                <div className="flex items-center gap-3 mb-1">
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                    a.severity === 'CRITICAL' ? 'bg-red-50 text-red-700' :
                    a.severity === 'HIGH' ? 'bg-orange-50 text-orange-700' :
                    a.severity === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-blue-50 text-blue-700'
                  }`}>{a.severity}</span>
                  {a.deviceType && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg">{a.deviceType}</span>}
                  <span className="text-xs text-gray-400 ml-auto">{fmt(a.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700">{a.message}</p>
                {a.deviceName && <p className="text-xs text-gray-400 mt-0.5">Device: {a.deviceName}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
