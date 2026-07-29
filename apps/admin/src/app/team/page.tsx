'use client';
import { useEffect, useState } from 'react';
import { adminApi, userApi } from '@/lib/api';

const LEVELS = ['SUPER_USER', 'ADMIN', 'VIEW_ONLY'];
const LEVEL_LABELS: Record<string, string> = {
  SUPER_USER: 'Super User',
  ADMIN: 'Admin',
  VIEW_ONLY: 'View Only',
};

export default function TeamPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', adminLevel: 'VIEW_ONLY' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => adminApi.getTeamUsers().then(setUsers);

  useEffect(() => {
    userApi.getMe().then((me: any) => setIsSuperUser(me.adminLevel === 'SUPER_USER')).catch(() => {});
    load().finally(() => setLoading(false));
  }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError('');
    try {
      await adminApi.createTeamUser(form);
      setForm({ email: '', firstName: '', lastName: '', adminLevel: 'VIEW_ONLY' });
      setShowInvite(false);
      await load();
    } catch (err: any) {
      setInviteError(err.response?.data?.message || 'Could not invite user.');
    } finally {
      setInviting(false);
    }
  };

  const changeLevel = async (id: string, adminLevel: string) => {
    setBusyId(id);
    try {
      await adminApi.updateTeamUserLevel(id, adminLevel);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Could not change level.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Deactivate "${name}"? They will no longer be able to log in.`)) return;
    setBusyId(id);
    try {
      await adminApi.removeTeamUser(id);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Could not remove user.');
    } finally {
      setBusyId(null);
    }
  };

  const reinstate = async (id: string, name: string) => {
    setBusyId(id);
    try {
      await adminApi.reinstateTeamUser(id);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Could not reinstate user.');
    } finally {
      setBusyId(null);
    }
  };

  const deletePermanently = async (id: string, name: string) => {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await adminApi.deleteTeamUserPermanently(id);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Could not delete user.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-lantern-deep">Team</h1>
        <button
          onClick={() => setShowInvite((v) => !v)}
          className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep hover:text-white transition-colors"
        >
          + Invite Admin User
        </button>
      </div>
      <p className="text-steel mb-8">Attenteve staff with access to this Admin Portal.</p>

      {showInvite && (
        <form onSubmit={invite} className="bg-white rounded-2xl border border-mist-dim p-6 mb-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              required
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              placeholder="First name"
              className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern"
            />
            <input
              required
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              placeholder="Last name"
              className="border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern"
            />
          </div>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern"
          />
          {isSuperUser ? (
            <div>
              <label className="block text-xs font-medium text-steel mb-1">Access Level</label>
              <select
                value={form.adminLevel}
                onChange={(e) => setForm((f) => ({ ...f, adminLevel: e.target.value }))}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lantern"
              >
                {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-xs text-steel">New users are added as View Only.</p>
          )}
          {inviteError && <p className="text-red-600 text-sm">{inviteError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={inviting}
              className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep hover:text-white disabled:opacity-50 transition-colors"
            >
              {inviting ? 'Sending invite…' : 'Send invite'}
            </button>
            <button type="button" onClick={() => setShowInvite(false)} className="text-steel text-sm px-4 py-2">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-mist-dim overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-canvas border-b border-mist-dim">
            <tr>
              <th className="text-left px-6 py-4 font-semibold text-steel">Name</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Email</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Level</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Status</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-canvas transition-colors">
                <td className="px-6 py-4 font-medium text-ink">{u.name}</td>
                <td className="px-6 py-4 text-steel">{u.email}</td>
                <td className="px-6 py-4">
                  {isSuperUser ? (
                    <select
                      value={u.adminLevel}
                      disabled={busyId === u.id}
                      onChange={(e) => changeLevel(u.id, e.target.value)}
                      className="border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-lantern disabled:opacity-50"
                    >
                      {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-steel">{LEVEL_LABELS[u.adminLevel]}</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${u.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {u.status === 'SUSPENDED' ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => reinstate(u.id, u.name)}
                        disabled={busyId === u.id}
                        className="bg-green-50 text-green-700 border border-green-200 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                      >
                        Reinstate
                      </button>
                      {isSuperUser && (
                        <button
                          onClick={() => deletePermanently(u.id, u.name)}
                          disabled={busyId === u.id}
                          className="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                        >
                          Delete Permanently
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => remove(u.id, u.name)}
                      disabled={busyId === u.id}
                      className="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
