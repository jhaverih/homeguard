'use client';
import { useEffect, useState } from 'react';
import { vendorApi, uploadsApi } from '@/lib/api';
import { usePermissions } from '@/lib/permissions';

export default function TeamPage() {
  const { isCompanyAdmin } = usePermissions();
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [form, setForm] = useState<{ email: string; firstName: string; lastName: string; photoFile: File | null }>({
    email: '', firstName: '', lastName: '', photoFile: null,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ firstName: string; lastName: string; photoFile: File | null }>({
    firstName: '', lastName: '', photoFile: null,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => vendorApi.getTeam().then(setTeam);

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError('');
    try {
      let avatarUrl: string | undefined;
      if (form.photoFile) {
        const { key } = await uploadsApi.upload(form.photoFile, 'vendor-avatars');
        avatarUrl = key;
      }
      await vendorApi.createTechnician({ email: form.email, firstName: form.firstName, lastName: form.lastName, avatarUrl });
      setForm({ email: '', firstName: '', lastName: '', photoFile: null });
      setShowInvite(false);
      await load();
    } catch (err: any) {
      setInviteError(err.response?.data?.message || 'Could not invite technician.');
    } finally {
      setInviting(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from the team?`)) return;
    setBusyId(id);
    try {
      await vendorApi.removeTeamMember(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (member: any) => {
    setEditingId(member.id);
    setEditForm({ firstName: member.firstName ?? '', lastName: member.lastName ?? '', photoFile: null });
  };

  const saveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      let avatarUrl: string | undefined;
      if (editForm.photoFile) {
        const { key } = await uploadsApi.upload(editForm.photoFile, 'vendor-avatars');
        avatarUrl = key;
      }
      await vendorApi.updateTeamMember(id, { firstName: editForm.firstName, lastName: editForm.lastName, avatarUrl });
      setEditingId(null);
      await load();
    } finally {
      setSavingEdit(false);
    }
  };

  if (!isCompanyAdmin) {
    return <div className="bg-white rounded-2xl border border-mist-dim p-12 text-center text-steel text-sm">Only your Vendor Admin can manage the team.</div>;
  }

  if (loading) return <div className="text-steel p-8">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-lantern-deep">Team</h1>
        <button
          onClick={() => setShowInvite((v) => !v)}
          className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep transition-colors"
        >
          + Invite Technician
        </button>
      </div>
      <p className="text-steel mb-8">Manage who works under your company. You count as a technician too.</p>

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
          <div>
            <label className="block text-xs font-medium text-steel mb-1">Photo (optional — they can add it later if you skip this)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setForm((f) => ({ ...f, photoFile: e.target.files?.[0] ?? null }))}
              className="text-sm"
            />
          </div>
          {inviteError && <p className="text-red-600 text-sm">{inviteError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={inviting}
              className="bg-lantern text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep disabled:opacity-50 transition-colors"
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
              <th className="text-left px-6 py-4 font-semibold text-steel">Photo</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Name</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Email</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Role</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Status</th>
              <th className="text-left px-6 py-4 font-semibold text-steel">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-canvas">
            {team.map((t) => (
              <tr key={t.id} className="hover:bg-canvas transition-colors align-top">
                <td className="px-6 py-4">
                  {t.avatarUrl ? (
                    <img src={t.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-mist-dim" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-mist-dim flex items-center justify-center text-steel text-xs">—</div>
                  )}
                </td>
                {editingId === t.id ? (
                  <td colSpan={5} className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editForm.firstName}
                        onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                        placeholder="First name"
                        className="border border-border rounded-lg px-3 py-1.5 text-sm focus:border-lantern outline-none"
                      />
                      <input
                        value={editForm.lastName}
                        onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                        placeholder="Last name"
                        className="border border-border rounded-lg px-3 py-1.5 text-sm focus:border-lantern outline-none"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setEditForm((f) => ({ ...f, photoFile: e.target.files?.[0] ?? null }))}
                        className="text-xs"
                      />
                      <button
                        onClick={() => saveEdit(t.id)}
                        disabled={savingEdit}
                        className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep disabled:opacity-50"
                      >
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-steel text-xs px-2">Cancel</button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-6 py-4 font-medium text-ink">{t.name}</td>
                    <td className="px-6 py-4 text-steel">{t.email}</td>
                    <td className="px-6 py-4 text-steel">{t.isCompanyAdmin ? 'Vendor Admin' : 'Technician'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${t.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(t)}
                          className="bg-white border border-border text-steel text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-canvas transition-colors"
                        >
                          Edit
                        </button>
                        {!t.isCompanyAdmin && (
                          <button
                            onClick={() => remove(t.id, t.name)}
                            disabled={busyId === t.id}
                            className="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
