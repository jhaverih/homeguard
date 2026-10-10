'use client';
import { Fragment, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

const emptyEditForm = { yolinkUAID: '', yolinkSecretKey: '', homeName: '', address: '' };

export default function MonitoringSetupPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [editingFor, setEditingFor] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  const [nestStatus, setNestStatus] = useState<{ configured: boolean; realtimeEvents: boolean } | null>(null);
  const [nestAccounts, setNestAccounts] = useState<any[]>([]);

  // Nest is best-effort here — the page still works for YoLink if the Nest
  // endpoints fail (e.g. an older API without them).
  const loadNest = () => Promise.all([
    adminApi.getNestStatus().then(setNestStatus).catch(() => setNestStatus(null)),
    adminApi.getNestAccounts().then(setNestAccounts).catch(() => setNestAccounts([])),
  ]);
  const load = () => Promise.all([adminApi.getMonitoringSetupRequests().then(setCustomers), loadNest()]);

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const requestConnection = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await adminApi.requestMonitoringConnection(id);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not dispatch this request.');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (customer: any) => {
    setEditingFor(customer.id);
    setEditForm({ ...emptyEditForm, homeName: `${customer.name}'s Home` });
    setEditError('');
  };

  const submitEdit = async (e: React.FormEvent, customerId: string) => {
    e.preventDefault();
    setEditing(true);
    setEditError('');
    try {
      await adminApi.linkYolinkHome({
        customerId,
        yolinkUAID: editForm.yolinkUAID.trim(),
        yolinkSecretKey: editForm.yolinkSecretKey.trim(),
        homeName: editForm.homeName.trim(),
        address: editForm.address.trim() || undefined,
      });
      setEditingFor(null);
      await load();
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Could not connect — check the UAID and Secret Key.');
    } finally {
      setEditing(false);
    }
  };

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-lantern-deep mb-2">Monitoring Setup</h1>
      <p className="text-steel mb-8">
        Customers on Standard or Premium. Request Connection dispatches a job any Yolink-trained vendor can accept.
        Already-connected customers can be re-linked via Edit if their credentials ever need to change.
        Nest thermostats can be added to any connected home — Connect Nest opens Google&apos;s consent screen in a new tab.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">{error}</div>
      )}

      {customers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center text-steel text-sm">
          No customers on Standard or Premium yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas border-b border-mist-dim">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-steel">Name</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Email</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Action</th>
                <th className="text-left px-6 py-4 font-semibold text-steel">Nest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-canvas">
              {customers.map((c) => (
                <Fragment key={c.id}>
                  <tr className="hover:bg-canvas transition-colors">
                    <td className="px-6 py-4 font-medium text-ink">{c.name}</td>
                    <td className="px-6 py-4 text-steel">{c.email}</td>
                    <td className="px-6 py-4">
                      {c.isConnected ? (
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg">
                            ✅ Connected
                          </span>
                          <button
                            onClick={() => (editingFor === c.id ? setEditingFor(null) : startEdit(c))}
                            className="text-lantern-deep text-xs font-semibold hover:underline"
                          >
                            {editingFor === c.id ? 'Cancel' : 'Edit'}
                          </button>
                        </div>
                      ) : c.hasPendingRequest ? (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg">
                          🚚 Dispatched
                        </span>
                      ) : (
                        <button
                          onClick={() => requestConnection(c.id)}
                          disabled={busyId === c.id}
                          className="bg-lantern text-ink px-4 py-2 rounded-lg text-xs font-semibold hover:bg-lantern-deep hover:text-white disabled:opacity-50 transition-colors"
                        >
                          {busyId === c.id ? 'Dispatching…' : 'Request Connection'}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <NestCell
                        customer={c}
                        status={nestStatus}
                        account={nestAccounts.find((a) => a.customerId === c.id && a.isActive) ?? null}
                        onChanged={loadNest}
                      />
                    </td>
                  </tr>
                  {editingFor === c.id && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 bg-mist-dim/40">
                        <form onSubmit={(e) => submitEdit(e, c.id)} className="space-y-3 max-w-md">
                          <p className="text-xs text-steel">
                            Enter this customer&apos;s Yolink credentials — found in their Yolink app under
                            Account → Advanced Settings → User Access Credentials.
                          </p>
                          <input
                            required
                            value={editForm.yolinkUAID}
                            onChange={(e) => setEditForm((f) => ({ ...f, yolinkUAID: e.target.value }))}
                            placeholder="UAID (starts with ua_)"
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lantern"
                          />
                          <input
                            required
                            value={editForm.yolinkSecretKey}
                            onChange={(e) => setEditForm((f) => ({ ...f, yolinkSecretKey: e.target.value }))}
                            placeholder="Secret Key (starts with sec_)"
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lantern"
                          />
                          <input
                            required
                            value={editForm.homeName}
                            onChange={(e) => setEditForm((f) => ({ ...f, homeName: e.target.value }))}
                            placeholder="Home name"
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lantern"
                          />
                          <input
                            value={editForm.address}
                            onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                            placeholder="Address (optional)"
                            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lantern"
                          />
                          {editError && <p className="text-red-600 text-xs">{editError}</p>}
                          <button
                            type="submit"
                            disabled={editing}
                            className="bg-lantern text-ink px-4 py-2 rounded-lg text-xs font-semibold hover:bg-lantern-deep hover:text-white disabled:opacity-50 transition-colors"
                          >
                            {editing ? 'Verifying…' : 'Verify & Reconnect'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const HVAC_LABEL: Record<string, string> = { HEATING: 'Heating', COOLING: 'Cooling', OFF: 'Idle' };

function NestCell({ customer, status, account, onChanged }: {
  customer: any;
  status: { configured: boolean; realtimeEvents: boolean } | null;
  account: any | null;
  onChanged: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [awaitingGoogle, setAwaitingGoogle] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  if (!customer.isConnected) return <span className="text-xs text-steel" title="Connect home monitoring first">—</span>;
  if (!status?.configured) return <span className="text-xs text-steel" title="NEST_* settings are not set on the server">Not configured</span>;

  const run = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err: any) {
      setError(err.response?.data?.message || failure);
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const { url } = await adminApi.startNestAuthorization(customer.id);
    window.open(url, '_blank', 'noopener');
    setAwaitingGoogle(true);
  }, 'Could not start the Google connection.');

  const linkButton = 'text-lantern-deep text-xs font-semibold hover:underline disabled:opacity-50';

  if (!account) {
    return (
      <div className="space-y-1">
        <button
          onClick={connect}
          disabled={busy}
          className="bg-lantern text-ink px-4 py-2 rounded-lg text-xs font-semibold hover:bg-lantern-deep hover:text-white disabled:opacity-50 transition-colors"
        >
          {busy ? 'Opening Google…' : 'Connect Nest'}
        </button>
        {awaitingGoogle && (
          <p className="text-xs text-steel">
            Finish in the Google tab, then{' '}
            <button onClick={() => { setAwaitingGoogle(false); onChanged(); }} className={linkButton}>refresh</button>.
          </p>
        )}
        {error && <p className="text-red-600 text-xs">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {account.thermostats.length === 0 && <p className="text-xs text-steel">Connected — no thermostats shared yet.</p>}
      {account.thermostats.map((t: any) => (
        <div key={t.id} className="text-xs text-ink">
          <span className="font-semibold">{t.roomName || t.displayName}</span>
          {' · '}{t.temperatureF != null ? `${t.temperatureF}°F` : '—'}
          {t.humidity != null && ` · ${t.humidity}%`}
          {' · '}{t.online ? (HVAC_LABEL[t.hvacStatus] ?? '—') : <span className="text-red-600">Offline</span>}
          {t.setpoint && <span className="text-steel"> · {t.setpoint}</span>}
        </div>
      ))}
      {account.thermostats.length > 0 && <SystemMapping account={account} onChanged={onChanged} />}
      {account.lastError && <p className="text-red-600 text-xs">{account.lastError}</p>}
      <div className="flex items-center gap-3">
        {account.lastError ? (
          <button onClick={connect} disabled={busy} className={linkButton}>Reconnect</button>
        ) : (
          <button onClick={() => run(async () => { await adminApi.syncNestAccount(account.id); await onChanged(); }, 'Sync failed.')} disabled={busy} className={linkButton}>
            {busy ? 'Syncing…' : 'Sync'}
          </button>
        )}
        {confirmDisconnect ? (
          <>
            <button
              onClick={() => run(async () => { await adminApi.disconnectNestAccount(account.id); setConfirmDisconnect(false); await onChanged(); }, 'Could not disconnect.')}
              disabled={busy}
              className="text-red-700 text-xs font-semibold hover:underline disabled:opacity-50"
            >
              Confirm disconnect
            </button>
            <button onClick={() => setConfirmDisconnect(false)} className="text-steel text-xs hover:underline">Cancel</button>
          </>
        ) : (
          <button onClick={() => setConfirmDisconnect(true)} className="text-steel text-xs font-semibold hover:underline">Disconnect</button>
        )}
      </div>
      {!status.realtimeEvents && <p className="text-xs text-steel">Updates every 5 min (real-time events not configured)</p>}
      {awaitingGoogle && <p className="text-xs text-steel">Finish in the Google tab, then <button onClick={() => { setAwaitingGoogle(false); onChanged(); }} className={linkButton}>refresh</button>.</p>}
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}

// Which HVAC system each thermostat zone belongs to (spec §5). Two
// thermostats on the same system = one air handler with zone dampers; the
// analytics only combine zones once the mapping is confirmed here.
function SystemMapping({ account, onChanged }: { account: any; onChanged: () => Promise<unknown> }) {
  const initial = Object.fromEntries(account.thermostats.map((t: any) => [t.id, t.equipmentNumber ?? '01']));
  const allVerified = (account.systems ?? []).length > 0 && account.systems.every((s: any) => s.verified);
  const [mapping, setMapping] = useState<Record<string, string>>(initial);
  const [verified, setVerified] = useState<boolean>(allVerified);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = verified !== allVerified || account.thermostats.some((t: any) => mapping[t.id] !== (t.equipmentNumber ?? '01'));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await adminApi.setNestSystemMapping(account.id, { thermostats: Object.entries(mapping).map(([id, equipmentNumber]) => ({ id, equipmentNumber })), verified });
      await onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not save the system mapping.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 rounded-lg border border-mist-dim p-2 space-y-1.5">
      <p className="text-[11px] font-semibold text-steel uppercase tracking-wide">HVAC systems</p>
      {account.thermostats.map((t: any) => (
        <label key={t.id} className="flex items-center justify-between gap-2 text-xs text-ink">
          <span>{t.roomName || t.displayName}</span>
          <select
            value={mapping[t.id]}
            onChange={(e) => setMapping((m) => ({ ...m, [t.id]: e.target.value }))}
            className="border border-border rounded px-1.5 py-0.5 text-xs"
          >
            {['01', '02', '03'].map((n) => <option key={n} value={n}>HVAC-{n}</option>)}
          </select>
        </label>
      ))}
      <label className="flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        Mapping confirmed with the homeowner
      </label>
      {!allVerified && <p className="text-[11px] text-amber-700">Zone-combining analytics (runtime, cycling, line temperatures, humidity) are paused until confirmed.</p>}
      {dirty && (
        <button onClick={save} disabled={saving} className="text-lantern-deep text-xs font-semibold hover:underline disabled:opacity-50">
          {saving ? 'Saving…' : 'Save systems'}
        </button>
      )}
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}
