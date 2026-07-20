'use client';
import { useEffect, useState } from 'react';
import { inspectionConfigApi } from '@/lib/api';

type ItemDraft = { label: string; description: string; isActive: boolean };

function toDraft(item: any): ItemDraft {
  return { label: item.label, description: item.description ?? '', isActive: item.isActive };
}

function isDirty(item: any, draft: ItemDraft | undefined): boolean {
  if (!draft) return false;
  return draft.label !== item.label || draft.description !== (item.description ?? '') || draft.isActive !== item.isActive;
}

// Reused at 3 nesting levels (Group -> Subgroup -> Section) with a `level`
// prop controlling heading size/indent — same collapse interaction as the
// Marketplace and Services Catalog pages (a Set<string> of collapsed keys).
function CollapsibleGroup({ label, level, collapsed, onToggle, actions, children }: {
  label: string; level: number; collapsed: boolean; onToggle: () => void; actions?: React.ReactNode; children: React.ReactNode;
}) {
  const headingClass = level === 0
    ? 'text-lg font-bold text-lantern-deep'
    : level === 1
    ? 'text-base font-bold text-ink'
    : 'text-sm font-bold text-steel uppercase tracking-wide';
  return (
    <div className={level === 0 ? 'mb-8' : 'mb-5'} style={{ marginLeft: level * 20 }}>
      <div className="flex items-center gap-3 mb-3">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left">
          <span className={`inline-block text-xs text-steel transition-transform ${collapsed ? '-rotate-90' : ''}`}>▼</span>
          <h2 className={headingClass}>{label}</h2>
        </button>
        {actions}
      </div>
      {!collapsed && children}
    </div>
  );
}

export default function InspectionConfigPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, ItemDraft>>({});
  const [taskDrafts, setTaskDrafts] = useState<Record<string, ItemDraft>>({});
  const [newSectionLabel, setNewSectionLabel] = useState<Record<string, string>>({});
  const [newTaskLabel, setNewTaskLabel] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  const load = () => inspectionConfigApi.getTree().then((data: any[]) => {
    setGroups(data);
    const sDrafts: Record<string, ItemDraft> = {};
    const tDrafts: Record<string, ItemDraft> = {};
    for (const g of data) {
      for (const sg of g.subgroups || []) {
        for (const sec of sg.sections || []) {
          sDrafts[sec.id] = toDraft(sec);
          for (const t of sec.tasks || []) tDrafts[t.id] = toDraft(t);
        }
      }
    }
    setSectionDrafts(sDrafts);
    setTaskDrafts(tDrafts);
  });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const toggleCollapsed = (key: string) =>
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const updateSectionDraft = (id: string, patch: Partial<ItemDraft>) =>
    setSectionDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const updateTaskDraft = (id: string, patch: Partial<ItemDraft>) =>
    setTaskDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // Flat list of every dirty section/task across all nesting — dirty-tracking
  // doesn't care about tree position, only id, same as the Services Catalog's
  // single Save Changes button.
  const dirtySectionIds: string[] = [];
  const dirtyTaskIds: string[] = [];
  for (const g of groups) {
    for (const sg of g.subgroups || []) {
      for (const sec of sg.sections || []) {
        if (isDirty(sec, sectionDrafts[sec.id])) dirtySectionIds.push(sec.id);
        for (const t of sec.tasks || []) {
          if (isDirty(t, taskDrafts[t.id])) dirtyTaskIds.push(t.id);
        }
      }
    }
  }
  const totalDirty = dirtySectionIds.length + dirtyTaskIds.length;

  const saveAll = async () => {
    setSavingAll(true);
    try {
      await Promise.all([
        ...dirtySectionIds.map((id) => inspectionConfigApi.updateSection(id, sectionDrafts[id])),
        ...dirtyTaskIds.map((id) => inspectionConfigApi.updateTask(id, taskDrafts[id])),
      ]);
      await load();
    } finally {
      setSavingAll(false);
    }
  };

  const withBusy = async (key: string, fn: () => Promise<any>) => {
    setBusy((s) => new Set(s).add(key));
    try {
      await fn();
      await load();
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const addSection = (subgroupId: string) => {
    const label = (newSectionLabel[subgroupId] || '').trim();
    if (!label) return;
    withBusy(subgroupId, () => inspectionConfigApi.createSection(subgroupId, label))
      .then(() => setNewSectionLabel((p) => ({ ...p, [subgroupId]: '' })));
  };

  const removeSection = (id: string, label: string) => {
    if (!confirm(`Delete the "${label}" checklist and all its tasks? This cannot be undone.`)) return;
    withBusy(id, () => inspectionConfigApi.removeSection(id));
  };

  const addTask = (sectionId: string) => {
    const label = (newTaskLabel[sectionId] || '').trim();
    if (!label) return;
    withBusy(sectionId, () => inspectionConfigApi.createTask(sectionId, label))
      .then(() => setNewTaskLabel((p) => ({ ...p, [sectionId]: '' })));
  };

  const removeTask = (id: string, label: string) => {
    if (!confirm(`Delete task "${label}"? This cannot be undone.`)) return;
    withBusy(id, () => inspectionConfigApi.removeTask(id));
  };

  if (loading) return <div className="text-steel p-8">Loading…</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="text-2xl font-bold text-lantern-deep mb-2">Inspection Configurator</h1>
          <p className="text-steel text-sm max-w-2xl">
            Configure the checklist a vendor completes during a General Home Inspection. Editing a label, description, or
            Enabled toggle requires pressing Save Changes; adding or deleting a task or whole checklist takes effect immediately.
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={totalDirty === 0 || savingAll}
          className="bg-lantern-deep text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-lantern-deep/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {savingAll ? 'Saving…' : totalDirty > 0 ? `Save Changes (${totalDirty})` : 'Save Changes'}
        </button>
      </div>

      {groups.map((g) => (
        <CollapsibleGroup key={g.id} label={g.label} level={0} collapsed={collapsedKeys.has(g.id)} onToggle={() => toggleCollapsed(g.id)}>
          {(g.subgroups || []).map((sg: any) => (
            <CollapsibleGroup key={sg.id} label={sg.label} level={1} collapsed={collapsedKeys.has(sg.id)} onToggle={() => toggleCollapsed(sg.id)}>
              {(sg.sections || []).map((sec: any) => {
                const sd = sectionDrafts[sec.id];
                if (!sd) return null;
                return (
                  <CollapsibleGroup
                    key={sec.id}
                    label={sec.label}
                    level={2}
                    collapsed={collapsedKeys.has(sec.id)}
                    onToggle={() => toggleCollapsed(sec.id)}
                    actions={
                      <button
                        onClick={() => removeSection(sec.id, sec.label)}
                        className="text-xs font-semibold text-steel hover:text-red-500 transition-colors"
                      >
                        ✕ Delete Checklist
                      </button>
                    }
                  >
                    <div className="bg-white rounded-2xl border border-mist-dim p-4 mb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="text"
                          value={sd.label}
                          onChange={(e) => updateSectionDraft(sec.id, { label: e.target.value })}
                          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm font-semibold text-ink focus:border-lantern outline-none"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-steel whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={sd.isActive}
                            onChange={(e) => updateSectionDraft(sec.id, { isActive: e.target.checked })}
                            className="w-4 h-4 rounded cursor-pointer accent-lantern"
                          />
                          Enabled
                        </label>
                      </div>
                      <textarea
                        value={sd.description}
                        onChange={(e) => updateSectionDraft(sec.id, { description: e.target.value })}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-xs text-steel focus:border-lantern outline-none resize-none mb-3"
                      />

                      <div className="divide-y divide-canvas">
                        {(sec.tasks || []).map((t: any) => {
                          const td = taskDrafts[t.id];
                          if (!td) return null;
                          return (
                            <div key={t.id} className="py-2.5 flex items-start gap-2">
                              <div className="flex-1 space-y-1">
                                <input
                                  type="text"
                                  value={td.label}
                                  onChange={(e) => updateTaskDraft(t.id, { label: e.target.value })}
                                  className="w-full border border-border rounded-lg px-2 py-1.5 text-sm font-medium text-ink focus:border-lantern outline-none"
                                />
                                <textarea
                                  value={td.description}
                                  onChange={(e) => updateTaskDraft(t.id, { description: e.target.value })}
                                  placeholder="Description"
                                  rows={1}
                                  className="w-full border border-border rounded-lg px-2 py-1 text-xs text-steel focus:border-lantern outline-none resize-none"
                                />
                              </div>
                              <label className="flex items-center gap-1 text-xs text-steel pt-2 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={td.isActive}
                                  onChange={(e) => updateTaskDraft(t.id, { isActive: e.target.checked })}
                                  className="w-4 h-4 rounded cursor-pointer accent-lantern"
                                />
                                Enabled
                              </label>
                              {busy.has(t.id) ? (
                                <div className="w-4 h-4 mt-2 border-2 border-lantern border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <button
                                  onClick={() => removeTask(t.id, t.label)}
                                  className="text-steel hover:text-red-500 transition-colors px-1 pt-2"
                                  title="Delete task"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {(sec.tasks || []).length === 0 && (
                          <div className="py-2 text-xs text-steel italic">No tasks yet — add one below.</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="text"
                          value={newTaskLabel[sec.id] || ''}
                          onChange={(e) => setNewTaskLabel((p) => ({ ...p, [sec.id]: e.target.value }))}
                          placeholder="New task name"
                          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:border-lantern outline-none"
                        />
                        <button
                          onClick={() => addTask(sec.id)}
                          disabled={busy.has(sec.id) || !(newTaskLabel[sec.id] || '').trim()}
                          className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {busy.has(sec.id) ? 'Adding…' : '+ Add Task'}
                        </button>
                      </div>
                    </div>
                  </CollapsibleGroup>
                );
              })}

              <div className="flex items-center gap-2 mb-4" style={{ marginLeft: 20 }}>
                <input
                  type="text"
                  value={newSectionLabel[sg.id] || ''}
                  onChange={(e) => setNewSectionLabel((p) => ({ ...p, [sg.id]: e.target.value }))}
                  placeholder="New checklist name"
                  className="flex-1 max-w-xs border border-border rounded-lg px-3 py-1.5 text-sm focus:border-lantern outline-none"
                />
                <button
                  onClick={() => addSection(sg.id)}
                  disabled={busy.has(sg.id) || !(newSectionLabel[sg.id] || '').trim()}
                  className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {busy.has(sg.id) ? 'Adding…' : '+ New Checklist'}
                </button>
              </div>
            </CollapsibleGroup>
          ))}
        </CollapsibleGroup>
      ))}
    </div>
  );
}
