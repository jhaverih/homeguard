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

  const load = () => adminApi.getMonitoringSetupRequests().then(setCustomers);

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
                  </tr>
                  {editingFor === c.id && (
                    <tr>
                      <td colSpan={3} className="px-6 py-4 bg-mist-dim/40">
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
