// =====================================================
// Leadflow Vloom - Tasks board (Backlog / In progress / Done)
// =====================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2,
  Plus,
  Calendar,
  Building2,
  User,
  GripVertical,
} from 'lucide-react';
import { useTasks, type TaskWithLead } from '@/hooks/useTasks';
import { useLeads } from '@/hooks/useLeads';
import { supabase } from '@/lib/supabase';
import type { TaskStatus, LeadStatus } from '@/types/database';
import type { Lead } from '@/types/database';
import { LeadCardPopup } from '@/components/CRM/LeadCardPopup';
import { TASK_PRESET_OPTIONS, formatBudget } from '@/lib/taskPresets';

const CRM_STATUS_LABEL: Record<LeadStatus, string> = {
  backlog: 'Backlog',
  not_contacted: 'Not contacted',
  invite_sent: 'First contact',
  connected: 'Connected',
  reply: 'Reply',
  positive_reply: 'Positive reply',
  negotiation: 'Negotiation',
  nurturing: 'Nurturing',
  closed: 'Closed',
  lost: 'Lost',
  disqualified: 'Disqualified',
};

const BOARD_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

function normalizeTaskStatus(raw: string | null | undefined): TaskStatus {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'in_progress' || s === 'done') return s;
  if (s === 'pending' || s === 'cancelled') return 'backlog';
  return 'backlog';
}

export interface TasksViewProps {
  onNavigateToLead?: (leadId: string) => void;
}

export function TasksView({ onNavigateToLead: _onNavigateToLead }: TasksViewProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPresetId, setCreatePresetId] = useState(TASK_PRESET_OPTIONS[0].id);
  const [createLeadId, setCreateLeadId] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const {
    tasks,
    isLoading,
    error,
    updateTaskStatus,
    updateTaskTitle,
    createTask,
    deleteTask,
    refreshTasks,
  } = useTasks();
  const { leads, updateLead, updateLeadStatus } = useLeads({
    initialFilters: { marked_as_lead_only: true },
    pageSize: 200,
  });

  const openTaskPopup = useCallback((task: TaskWithLead | null) => {
    setSelectedTaskId(task?.id ?? null);
    setSelectedLead(null);
  }, []);

  useEffect(() => {
    if (!selectedTaskId || !supabase) {
      setSelectedLead(null);
      return;
    }
    const task = tasks.find((t) => t.id === selectedTaskId);
    if (!task) {
      setSelectedLead(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('leads')
      .select('*')
      .eq('id', task.lead_id)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setSelectedLead(null);
          return;
        }
        setSelectedLead(data as Lead);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId, tasks]);

  const byColumn = useMemo(() => {
    const map = new Map<TaskStatus, TaskWithLead[]>();
    for (const col of BOARD_COLUMNS) map.set(col.id, []);
    for (const t of tasks) {
      const st = normalizeTaskStatus(t.status);
      map.get(st)!.push(t);
    }
    return map;
  }, [tasks]);

  const handleDragStart = (e: React.DragEvent, task: TaskWithLead) => {
    e.dataTransfer.setData('text/task-id', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const id = e.dataTransfer.getData('text/task-id');
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || normalizeTaskStatus(task.status) === status) return;
    await updateTaskStatus(id, status);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createLeadId) return;
    const preset =
      TASK_PRESET_OPTIONS.find((p) => p.id === createPresetId) ?? TASK_PRESET_OPTIONS[0];
    setCreateSaving(true);
    try {
      await createTask({
        leadId: createLeadId,
        title: preset.title,
        taskType: preset.id,
        status: 'backlog',
      });
      setShowCreateModal(false);
      setCreateLeadId('');
      setCreatePresetId(TASK_PRESET_OPTIONS[0].id);
    } finally {
      setCreateSaving(false);
    }
  };

  const leadOptions = useMemo(() => {
    return leads
      .slice()
      .sort((a, b) => (a.company_name ?? '').localeCompare(b.company_name ?? ''))
      .map((l) => ({
        id: l.id,
        label:
          [l.company_name, l.contact_name].filter(Boolean).join(' · ') ||
          l.job_title ||
          l.id.slice(0, 8),
      }));
  }, [leads]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-vloom-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-vloom-error text-sm">{error}</p>
        <button
          type="button"
          onClick={() => refreshTasks()}
          className="mt-2 text-sm text-vloom-accent hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 h-full min-h-0 flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-vloom-text">Tasks</h1>
          <p className="text-sm text-vloom-muted">
            Drag cards across Backlog → In progress → Done. Open a card for full lead details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-vloom-accent text-white text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          New task
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-4">
        {BOARD_COLUMNS.map((col) => {
          const colTasks = byColumn.get(col.id) ?? [];
          return (
            <div
              key={col.id}
              className={`flex flex-col min-h-[280px] rounded-xl border border-vloom-border bg-vloom-surface/50 ${
                dragOverColumn === col.id ? 'ring-2 ring-vloom-accent/40' : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverColumn(col.id);
              }}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              <div className="px-3 py-2.5 border-b border-vloom-border flex items-center justify-between">
                <span className="text-sm font-semibold text-vloom-text">{col.label}</span>
                <span className="text-xs text-vloom-muted tabular-nums">{colTasks.length}</span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
                {colTasks.length === 0 && (
                  <p className="text-xs text-vloom-muted px-1 py-4 text-center">No tasks</p>
                )}
                {colTasks.map((task) => (
                  <TaskBoardCard
                    key={task.id}
                    task={task}
                    onDragStart={handleDragStart}
                    onOpen={() => openTaskPopup(task)}
                    onDelete={async () => {
                      if (!confirm('Delete this task?')) return;
                      await deleteTask(task.id);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showCreateModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
          onClick={() => setShowCreateModal(false)}
        >
          <form
            className="w-full max-w-md rounded-xl border border-vloom-border bg-vloom-surface p-4 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h2 className="text-base font-semibold text-vloom-text">New task</h2>
            <div>
              <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
                Task type
              </label>
              <select
                value={createPresetId}
                onChange={(e) => setCreatePresetId(e.target.value as typeof createPresetId)}
                className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
              >
                {TASK_PRESET_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
                Lead
              </label>
              <select
                required
                value={createLeadId}
                onChange={(e) => setCreateLeadId(e.target.value)}
                className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
              >
                <option value="">Select a lead…</option>
                {leadOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-2 text-sm text-vloom-muted hover:text-vloom-text rounded-lg border border-vloom-border"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createSaving || !createLeadId}
                className="px-3 py-2 text-sm font-medium text-white bg-vloom-accent rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {createSaving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedLead && (
        <LeadCardPopup
          lead={selectedLead}
          currentTask={selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null}
          tasksForLead={tasks.filter((t) => t.lead_id === selectedLead.id)}
          onClose={() => {
            setSelectedTaskId(null);
            setSelectedLead(null);
          }}
          onUpdateLead={async (id, updates) => {
            await updateLead(id, updates);
            setSelectedLead((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
          }}
          onUpdateLeadStatus={updateLeadStatus}
          onUpdateTaskStatus={updateTaskStatus}
          onUpdateTaskTitle={updateTaskTitle}
          onCreateTask={async (leadId, title, taskType) => {
            await createTask({ leadId, title, taskType: taskType ?? null, status: 'backlog' });
          }}
          onDeleteTask={deleteTask}
        />
      )}
    </div>
  );
}

function TaskBoardCard({
  task,
  onDragStart,
  onOpen,
  onDelete,
}: {
  task: TaskWithLead;
  onDragStart: (e: React.DragEvent, task: TaskWithLead) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const company = task.leads?.company_name?.trim() || null;
  const contact = task.leads?.contact_name?.trim() || null;
  const crmStatus = task.leads?.status
    ? CRM_STATUS_LABEL[task.leads.status] ?? task.leads.status
    : null;
  const due =
    task.due_at != null
      ? new Date(task.due_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : null;
  const budget =
    task.leads?.budget != null && Number.isFinite(Number(task.leads.budget))
      ? formatBudget(Number(task.leads.budget))
      : null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={onOpen}
      className="rounded-lg border border-vloom-border bg-vloom-bg p-3 cursor-pointer hover:border-vloom-accent/50 transition-colors space-y-1.5"
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="w-3.5 h-3.5 text-vloom-muted shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-vloom-text leading-snug">{task.title}</div>
          {company && (
            <div className="flex items-center gap-1 text-xs text-vloom-muted mt-1 truncate">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{company}</span>
            </div>
          )}
          {contact && contact !== company && (
            <div className="flex items-center gap-1 text-xs text-vloom-muted truncate">
              <User className="w-3 h-3 shrink-0" />
              <span className="truncate">{contact}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[11px] text-vloom-muted">
            {crmStatus && <span>{crmStatus}</span>}
            {budget && budget !== '—' && <span>{budget}</span>}
            {due && (
              <span className="inline-flex items-center gap-0.5">
                <Calendar className="w-3 h-3" />
                Due {due}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-[11px] text-vloom-muted hover:text-red-400"
      >
        Delete
      </button>
    </div>
  );
}
