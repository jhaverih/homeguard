'use client';
import { useEffect, useState } from 'react';
import { inspectionConfigApi, userApi } from '@/lib/api';

type ItemDraft = { label: string; description: string; isActive: boolean };
type PendingNew = { tempId: string; label: string };

function toDraft(item: any): ItemDraft {
  return { label: item.label, description: item.description ?? '', isActive: item.isActive };
}

function isDirty(item: any, draft: ItemDraft | undefined): boolean {
  if (!draft) return false;
  return draft.label !== item.label || draft.description !== (item.description ?? '') || draft.isActive !== item.isActive;
}

function tempId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, ItemDraft>>({});
  const [taskDrafts, setTaskDrafts] = useState<Record<string, ItemDraft>>({});
  const [newSectionLabel, setNewSectionLabel] = useState<Record<string, string>>({});
  const [newTaskLabel, setNewTaskLabel] = useState<Record<string, string>>({});
  const [savingAll, setSavingAll] = useState(false);

  // Structural changes (add/delete a whole checklist or task) are staged
  // exactly like field edits now, instead of hitting the API instantly —
  // pending creates keyed by parent id, pending removes tracked with their
  // parent so a delete of an already-pending-removed section doesn't also
  // try to delete its tasks individually.
  const [pendingNewSections, setPendingNewSections] = useState<Record<string, PendingNew[]>>({});
  const [pendingRemoveSectionIds, setPendingRemoveSectionIds] = useState<Set<string>>(new Set());
  const [pendingNewTasks, setPendingNewTasks] = useState<Record<string, PendingNew[]>>({});
  const [pendingRemoveTasks, setPendingRemoveTasks] = useState<Map<string, string>>(new Map()); // taskId -> sectionId

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

  useEffect(() => {
    load().finally(() => setLoading(false));
    userApi.getMe().then((me: any) => setIsSuperUser(me.adminLevel === 'SUPER_USER')).catch(() => {});
  }, []);

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

  // Flat list of every dirty (field-edited) section/task across all nesting,
  // excluding anything already staged for removal — no point saving an edit
  // to something about to be deleted in the same Save Changes click.
  const dirtySectionIds: string[] = [];
  const dirtyTaskIds: string[] = [];
  for (const g of groups) {
    for (const sg of g.subgroups || []) {
      for (const sec of sg.sections || []) {
        if (!pendingRemoveSectionIds.has(sec.id) && isDirty(sec, sectionDrafts[sec.id])) dirtySectionIds.push(sec.id);
        for (const t of sec.tasks || []) {
          if (!pendingRemoveTasks.has(t.id) && isDirty(t, taskDrafts[t.id])) dirtyTaskIds.push(t.id);
        }
      }
    }
  }
  const pendingNewSectionCount = Object.values(pendingNewSections).reduce((n, arr) => n + arr.length, 0);
  const pendingNewTaskCount = Object.values(pendingNewTasks).reduce((n, arr) => n + arr.length, 0);
  const totalDirty = dirtySectionIds.length + dirtyTaskIds.length
    + pendingNewSectionCount + pendingRemoveSectionIds.size
    + pendingNewTaskCount + pendingRemoveTasks.size;

  const saveAll = async () => {
    setSavingAll(true);
    try {
      for (const [subgroupId, items] of Object.entries(pendingNewSections)) {
        for (const item of items) await inspectionConfigApi.createSection(subgroupId, item.label);
      }
      for (const [sectionId, items] of Object.entries(pendingNewTasks)) {
        for (const item of items) await inspectionConfigApi.createTask(sectionId, item.label);
      }
      // Tasks whose parent section is also being removed are already covered
      // by the section delete's own cascade — sending both would 404 the task.
      const taskRemovesToSend = [...pendingRemoveTasks.entries()]
        .filter(([, sectionId]) => !pendingRemoveSectionIds.has(sectionId))
        .map(([taskId]) => taskId);
      await Promise.all([
        ...[...pendingRemoveSectionIds].map((id) => inspectionConfigApi.removeSection(id)),
        ...taskRemovesToSend.map((id) => inspectionConfigApi.removeTask(id)),
      ]);
      await Promise.all([
        ...dirtySectionIds.map((id) => inspectionConfigApi.updateSection(id, sectionDrafts[id])),
        ...dirtyTaskIds.map((id) => inspectionConfigApi.updateTask(id, taskDrafts[id])),
      ]);
      setPendingNewSections({});
      setPendingNewTasks({});
      setPendingRemoveSectionIds(new Set());
      setPendingRemoveTasks(new Map());
      await load();
    } finally {
      setSavingAll(false);
    }
  };

  const addSection = (subgroupId: string) => {
    const label = (newSectionLabel[subgroupId] || '').trim();
    if (!label) return;
    setPendingNewSections((prev) => ({
      ...prev,
      [subgroupId]: [...(prev[subgroupId] || []), { tempId: tempId('section'), label }],
    }));
    setNewSectionLabel((p) => ({ ...p, [subgroupId]: '' }));
  };

  const cancelPendingSection = (subgroupId: string, tid: string) => {
    setPendingNewSections((prev) => ({
      ...prev,
      [subgroupId]: (prev[subgroupId] || []).filter((p) => p.tempId !== tid),
    }));
  };

  const removeSection = (id: string, label: string) => {
    if (!confirm(`Delete the "${label}" checklist and all its tasks? This takes effect the next time you press Save Changes.`)) return;
    setPendingRemoveSectionIds((prev) => new Set(prev).add(id));
  };

  const undoRemoveSection = (id: string) => {
    setPendingRemoveSectionIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const addTask = (sectionId: string) => {
    const label = (newTaskLabel[sectionId] || '').trim();
    if (!label) return;
    setPendingNewTasks((prev) => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] || []), { tempId: tempId('task'), label }],
    }));
    setNewTaskLabel((p) => ({ ...p, [sectionId]: '' }));
  };

  const cancelPendingTask = (sectionId: string, tid: string) => {
    setPendingNewTasks((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] || []).filter((p) => p.tempId !== tid),
    }));
  };

  const removeTask = (id: string, sectionId: string, label: string) => {
    if (!confirm(`Delete task "${label}"? This takes effect the next time you press Save Changes.`)) return;
    setPendingRemoveTasks((prev) => new Map(prev).set(id, sectionId));
  };

  const undoRemoveTask = (id: string) => {
    setPendingRemoveTasks((prev) => { const n = new Map(prev); n.delete(id); return n; });
  };

  if (loading) return <div className="text-steel p-8">Loading…</div>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="text-2xl font-bold text-lantern-deep mb-2">Assessment Configurator</h1>
          <p className="text-steel text-sm max-w-2xl">
            Configure the checklist a vendor completes during a Preventative Home Assessment. Every change here — field edits,
            adding a task or checklist, or deleting one — is staged and only takes effect when you press Save Changes.
            {!isSuperUser && ' Deleting a checklist or task requires a Super User.'}
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
          {(g.subgroups || []).map((sg: any) => {
            const pendingSections = pendingNewSections[sg.id] || [];
            return (
            <CollapsibleGroup key={sg.id} label={sg.label} level={1} collapsed={collapsedKeys.has(sg.id)} onToggle={() => toggleCollapsed(sg.id)}>
              {(sg.sections || []).map((sec: any) => {
                const sd = sectionDrafts[sec.id];
                if (!sd) return null;
                const pendingRemoved = pendingRemoveSectionIds.has(sec.id);
                const pendingTasks = pendingNewTasks[sec.id] || [];
                return (
                  <CollapsibleGroup
                    key={sec.id}
                    label={sec.label + (pendingRemoved ? ' (pending delete)' : '')}
                    level={2}
                    collapsed={collapsedKeys.has(sec.id)}
                    onToggle={() => toggleCollapsed(sec.id)}
                    actions={
                      pendingRemoved ? (
                        <button
                          onClick={() => undoRemoveSection(sec.id)}
                          className="text-xs font-semibold text-lantern-deep hover:underline transition-colors"
                        >
                          Undo Delete
                        </button>
                      ) : isSuperUser ? (
                        <button
                          onClick={() => removeSection(sec.id, sec.label)}
                          className="text-xs font-semibold text-steel hover:text-red-500 transition-colors"
                        >
                          ✕ Delete Checklist
                        </button>
                      ) : null
                    }
                  >
                    <div className={`bg-white rounded-2xl border p-4 mb-4 ${pendingRemoved ? 'border-red-200 opacity-50' : 'border-mist-dim'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="text"
                          value={sd.label}
                          disabled={pendingRemoved}
                          onChange={(e) => updateSectionDraft(sec.id, { label: e.target.value })}
                          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm font-semibold text-ink focus:border-lantern outline-none disabled:opacity-50"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-steel whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={sd.isActive}
                            disabled={pendingRemoved}
                            onChange={(e) => updateSectionDraft(sec.id, { isActive: e.target.checked })}
                            className="w-4 h-4 rounded cursor-pointer accent-lantern"
                          />
                          Enabled
                        </label>
                      </div>
                      <textarea
                        value={sd.description}
                        disabled={pendingRemoved}
                        onChange={(e) => updateSectionDraft(sec.id, { description: e.target.value })}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full border border-border rounded-lg px-3 py-1.5 text-xs text-steel focus:border-lantern outline-none resize-none mb-3 disabled:opacity-50"
                      />

                      <div className="divide-y divide-canvas">
                        {(sec.tasks || []).map((t: any) => {
                          const td = taskDrafts[t.id];
                          if (!td) return null;
                          const taskPendingRemoved = pendingRemoveTasks.has(t.id);
                          return (
                            <div key={t.id} className={`py-2.5 flex items-start gap-2 ${taskPendingRemoved ? 'opacity-50' : ''}`}>
                              <div className="flex-1 space-y-1">
                                <input
                                  type="text"
                                  value={td.label}
                                  disabled={taskPendingRemoved}
                                  onChange={(e) => updateTaskDraft(t.id, { label: e.target.value })}
                                  className="w-full border border-border rounded-lg px-2 py-1.5 text-sm font-medium text-ink focus:border-lantern outline-none disabled:opacity-50"
                                />
                                <textarea
                                  value={td.description}
                                  disabled={taskPendingRemoved}
                                  onChange={(e) => updateTaskDraft(t.id, { description: e.target.value })}
                                  placeholder="Description"
                                  rows={1}
                                  className="w-full border border-border rounded-lg px-2 py-1 text-xs text-steel focus:border-lantern outline-none resize-none disabled:opacity-50"
                                />
                              </div>
                              <label className="flex items-center gap-1 text-xs text-steel pt-2 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={td.isActive}
                                  disabled={taskPendingRemoved}
                                  onChange={(e) => updateTaskDraft(t.id, { isActive: e.target.checked })}
                                  className="w-4 h-4 rounded cursor-pointer accent-lantern"
                                />
                                Enabled
                              </label>
                              {taskPendingRemoved ? (
                                <button
                                  onClick={() => undoRemoveTask(t.id)}
                                  className="text-xs font-semibold text-lantern-deep hover:underline pt-2 whitespace-nowrap"
                                >
                                  Undo
                                </button>
                              ) : isSuperUser ? (
                                <button
                                  onClick={() => removeTask(t.id, sec.id, t.label)}
                                  className="text-steel hover:text-red-500 transition-colors px-1 pt-2"
                                  title="Delete task"
                                >
                                  ✕
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                        {pendingTasks.map((p) => (
                          <div key={p.tempId} className="py-2.5 flex items-center gap-2 bg-lantern/5">
                            <div className="flex-1 text-sm font-medium text-ink">{p.label} <span className="text-xs text-steel italic">(pending — saved on Save Changes)</span></div>
                            <button
                              onClick={() => cancelPendingTask(sec.id, p.tempId)}
                              className="text-steel hover:text-red-500 transition-colors px-1"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {(sec.tasks || []).length === 0 && pendingTasks.length === 0 && (
                          <div className="py-2 text-xs text-steel italic">No tasks yet — add one below.</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="text"
                          value={newTaskLabel[sec.id] || ''}
                          onChange={(e) => setNewTaskLabel((p) => ({ ...p, [sec.id]: e.target.value }))}
                          placeholder="New task name"
                          disabled={pendingRemoved}
                          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm focus:border-lantern outline-none disabled:opacity-50"
                        />
                        <button
                          onClick={() => addTask(sec.id)}
                          disabled={pendingRemoved || !(newTaskLabel[sec.id] || '').trim()}
                          className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          + Add Task
                        </button>
                      </div>
                    </div>
                  </CollapsibleGroup>
                );
              })}

              {pendingSections.map((p) => (
                <div key={p.tempId} className="bg-lantern/5 rounded-2xl border border-lantern p-4 mb-4" style={{ marginLeft: 20 }}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-ink">{p.label} <span className="text-xs text-steel italic font-normal">(pending — saved on Save Changes)</span></div>
                    <button
                      onClick={() => cancelPendingSection(sg.id, p.tempId)}
                      className="text-xs font-semibold text-steel hover:text-red-500 transition-colors"
                    >
                      ✕ Cancel
                    </button>
                  </div>
                </div>
              ))}

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
                  disabled={!(newSectionLabel[sg.id] || '').trim()}
                  className="bg-lantern text-ink px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lantern-deep hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  + New Checklist
                </button>
              </div>
            </CollapsibleGroup>
            );
          })}
        </CollapsibleGroup>
      ))}
    </div>
  );
}
