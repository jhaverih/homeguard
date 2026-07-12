'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';

const LEVELS = ['SUPER_USER', 'ADMIN', 'VIEW_ONLY'];
const LEVEL_LABELS: Record<string, string> = {
  SUPER_USER: 'Super User',
  ADMIN: 'Admin',
  VIEW_ONLY: 'View Only',
};

export default function TeamPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', adminLevel: 'VIEW_ONLY' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => adminApi.getTeamUsers().then(setUsers);

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

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

  if (loading) return <div className="text-gray-500 p-8">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-brand">Team</h1>
        <button
          onClick={() => setShowInvite((v) => !v)}
          className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-light transition-colors"
        >
          + Invite Admin User
        </button>
      </div>
      <p className="text-gray-500 mb-8">Houmi staff with access to this Admin Portal.</p>

      {showInvite && (
        <form onSubmit={invite} className="bg-white rounded-2xl border border-gray-100 p-6 mb-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              required
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              placeholder="First name"
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <input
              required
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              placeholder="Last name"
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Access Level</label>
            <select
              value={form.adminLevel}
              onChange={(e) => setForm((f) => ({ ...f, adminLevel: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
            </select>
          </div>
          {inviteError && <p className="text-red-600 text-sm">{inviteError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={inviting}
              className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-light disabled:opacity-50 transition-colors"
            >
              {inviting ? 'Sending invite…' : 'Send invite'}
            </button>
            <button type="button" onClick={() => setShowInvite(false)} className="text-gray-500 text-sm px-4 py-2">Cancel</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-6 py-4 font-semibold text-gray-600">Name</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-600">Email</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-600">Level</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-600">Status</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-800">{u.name}</td>
                <td className="px-6 py-4 text-gray-500">{u.email}</td>
                <td className="px-6 py-4">
                  <select
                    value={u.adminLevel}
                    disabled={busyId === u.id}
                    onChange={(e) => changeLevel(u.id, e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
                  >
                    {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                  </select>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${u.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => remove(u.id, u.name)}
                    disabled={busyId === u.id}
                    className="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
