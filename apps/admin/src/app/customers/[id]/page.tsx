'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi, userApi } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  ACCEPTED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-orange-50 text-orange-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-mist-dim text-steel',
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
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);

  const load = () => adminApi.getCustomerActivity(id).then((a: any) => {
    setActivity(a);
    setAddress(a?.customer?.address ?? '');
    setCity(a?.customer?.city ?? '');
    setState(a?.customer?.state ?? '');
    setZip(a?.customer?.zipCode ?? '');
  });

  useEffect(() => {
    load().catch(() => setActivity(null)).finally(() => setLoading(false));
    userApi.getMe().then((me: any) => setIsSuperUser(me.adminLevel === 'SUPER_USER')).catch(() => {});
  }, [id]);

  const saveAddress = async () => {
    setSavingAddress(true);
    try {
      await adminApi.updateCustomerAddress(id, {
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zipCode: zip.trim(),
      });
      await load();
    } finally {
      setSavingAddress(false);
    }
  };

  if (loading) {
    return <div className="text-steel text-sm py-12 text-center">Loading customer activity…</div>;
  }
  if (!activity) {
    return (
      <div className="text-center py-16">
        <p className="text-steel">Could not load customer data.</p>
        <button onClick={() => router.back()} className="mt-4 text-lantern-deep text-sm font-semibold hover:underline">← Back</button>
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
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-steel hover:text-lantern-deep mb-6 transition-colors">
        ← Back
      </button>

      {/* Customer header */}
      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 rounded-full bg-lantern/10 flex items-center justify-center text-2xl font-bold text-lantern-deep shrink-0">
            {(customer?.name ?? customer?.email ?? '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-ink">{customer?.name ?? '—'}</h1>
            <p className="text-sm text-steel mt-0.5">{customer?.email}</p>
            {customer?.phone && <p className="text-sm text-steel">{customer.phone}</p>}
          </div>
          <div className="text-right text-sm text-steel">
            <p>Member since</p>
            <p className="font-medium text-ink">{customer?.createdAt ? fmt(customer.createdAt) : '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-mist-dim">
          {[
            { label: 'Total Jobs', value: serviceRequests.length },
            { label: 'Completed', value: serviceRequests.filter((r: any) => r.status === 'COMPLETED').length },
            { label: 'Total Paid', value: `$${payments.filter((p: any) => p.status === 'PAID').reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0).toFixed(2)}` },
            { label: 'Open Disputes', value: disputes.filter((d: any) => d.status === 'OPEN').length },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold text-lantern-deep">{stat.value}</p>
              <p className="text-xs text-steel mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Address */}
      <div className="bg-white rounded-2xl border border-mist-dim p-6 mb-6">
        <h2 className="text-sm font-bold text-steel uppercase tracking-wide mb-1">Address</h2>
        <p className="text-xs text-steel mb-4">Home address on file — used to match this customer with nearby vendors.</p>
        {isSuperUser ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-steel mb-1">Street address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-steel mb-1">City</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-steel mb-1">State</label>
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    maxLength={2}
                    placeholder="TN"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-steel mb-1">Zip</label>
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    maxLength={10}
                    placeholder="37201"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:border-lantern outline-none"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={saveAddress}
              disabled={savingAddress}
              className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-40 transition-colors"
            >
              {savingAddress ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          <p className="text-sm text-steel">
            {address || city || state || zip
              ? [address, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
              : '— No address on file —'}
          </p>
        )}
      </div>

      {/* Activity tabs */}
      <div className="flex gap-1 bg-mist-dim p-1 rounded-lg w-fit mb-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-lantern-deep shadow-sm' : 'text-steel hover:text-ink'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-lantern text-ink' : 'bg-border text-steel'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Jobs tab */}
      {tab === 'jobs' && (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          {serviceRequests.length === 0 ? (
            <p className="text-steel text-sm p-8 text-center">No jobs or inspections yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-[80px_1fr_160px_160px_120px] gap-4 px-6 py-3 bg-canvas border-b border-mist-dim text-xs font-semibold text-steel uppercase tracking-wide">
                <span>ID</span><span>Service</span><span>Vendor</span><span>Date</span><span>Status</span>
              </div>
              {serviceRequests.map((req: any) => {
                const vendorName = req.vendor
                  ? `${req.vendor.firstName ?? ''} ${req.vendor.lastName ?? ''}`.trim() || req.vendor.email
                  : '—';
                return (
                  <div key={req.id} className="grid grid-cols-[80px_1fr_160px_160px_120px] gap-4 px-6 py-4 border-t border-mist-dim items-center hover:bg-canvas">
                    <span className="text-xs text-steel font-mono truncate">{req.ticketNumber || req.id.slice(0, 8)}</span>
                    <div>
                      <p className="text-sm font-medium text-ink">{req.type?.replace(/_/g, ' ') ?? 'Service'}</p>
                      <p className="text-xs text-steel truncate">{req.address}, {req.city}</p>
                    </div>
                    <div>
                      {req.vendor?.id ? (
                        <a href={`/vendors/${req.vendor.id}`} className="text-sm text-green-700 hover:underline font-medium">
                          {vendorName}
                        </a>
                      ) : (
                        <span className="text-sm text-steel">{vendorName}</span>
                      )}
                    </div>
                    <span className="text-sm text-steel">{req.scheduledDate ? fmt(req.scheduledDate) : '—'}</span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold w-fit ${STATUS_COLOR[req.status] ?? 'bg-mist-dim text-steel'}`}>
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
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          {payments.length === 0 ? (
            <p className="text-steel text-sm p-8 text-center">No payment records yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_140px_120px_120px] gap-4 px-6 py-3 bg-canvas border-b border-mist-dim text-xs font-semibold text-steel uppercase tracking-wide">
                <span>Description</span><span>Amount</span><span>Date</span><span>Status</span>
              </div>
              {payments.map((p: any) => (
                <div key={p.id} className="grid grid-cols-[1fr_140px_120px_120px] gap-4 px-6 py-4 border-t border-mist-dim items-center hover:bg-canvas">
                  <div>
                    <p className="text-sm font-medium text-ink">{p.description || p.serviceType || 'Service'}</p>
                    {p.vendorName && <p className="text-xs text-steel">Vendor: {p.vendorName}</p>}
                  </div>
                  <span className="text-sm font-semibold text-ink">${Number(p.amount).toFixed(2)}</span>
                  <span className="text-sm text-steel">{p.paidAt ? fmt(p.paidAt) : fmt(p.createdAt)}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold w-fit ${
                    p.status === 'PAID' ? 'bg-green-50 text-green-700' :
                    p.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-mist-dim text-steel'
                  }`}>{p.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Disputes tab */}
      {tab === 'disputes' && (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          {disputes.length === 0 ? (
            <p className="text-steel text-sm p-8 text-center">No disputes.</p>
          ) : (
            disputes.map((d: any, idx: number) => {
              const vendorName = d.vendor
                ? `${d.vendor.firstName ?? ''} ${d.vendor.lastName ?? ''}`.trim() || d.vendor.email
                : '—';
              return (
                <div key={d.id} className={`px-6 py-4 ${idx !== 0 ? 'border-t border-mist-dim' : ''} hover:bg-canvas`}>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                      d.status === 'OPEN' ? 'bg-red-50 text-red-700' :
                      d.status === 'RESOLVED_CUSTOMER' ? 'bg-blue-50 text-blue-700' :
                      d.status === 'RESOLVED_VENDOR' ? 'bg-green-50 text-green-700' :
                      'bg-yellow-50 text-yellow-700'
                    }`}>{d.status?.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-steel">{fmt(d.createdAt)}</span>
                    <span className="text-xs text-steel">·</span>
                    <span className="text-xs text-steel">Vendor: {d.vendor?.id ? (
                      <a href={`/vendors/${d.vendor.id}`} className="text-green-700 hover:underline">{vendorName}</a>
                    ) : vendorName}</span>
                  </div>
                  <p className="text-sm text-ink">{d.description}</p>
                  <a href="/disputes" className="text-xs text-lantern-deep font-semibold hover:underline mt-1 inline-block">→ Manage in Disputes</a>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Alerts tab */}
      {tab === 'alerts' && (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          {alerts.length === 0 ? (
            <p className="text-steel text-sm p-8 text-center">No monitoring alerts.</p>
          ) : (
            alerts.map((a: any, idx: number) => (
              <div key={a.id} className={`px-6 py-4 ${idx !== 0 ? 'border-t border-mist-dim' : ''} hover:bg-canvas`}>
                <div className="flex items-center gap-3 mb-1">
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                    a.severity === 'CRITICAL' ? 'bg-red-50 text-red-700' :
                    a.severity === 'HIGH' ? 'bg-orange-50 text-orange-700' :
                    a.severity === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-blue-50 text-blue-700'
                  }`}>{a.severity}</span>
                  {a.deviceType && <span className="text-xs bg-mist-dim text-steel px-2 py-0.5 rounded-lg">{a.deviceType}</span>}
                  <span className="text-xs text-steel ml-auto">{fmt(a.createdAt)}</span>
                </div>
                <p className="text-sm text-ink">{a.message}</p>
                {a.deviceName && <p className="text-xs text-steel mt-0.5">Device: {a.deviceName}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
