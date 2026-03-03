// =====================================================
// Leadflow Vloom - Tasks view (two views: Table + Todo list)
// =====================================================
import { useState, useEffect, useCallback } from 'react';
import {
  CheckSquare,
  Loader2,
  LayoutGrid,
  List,
  Circle,
  CheckCircle2,
  Search,
  Building2,
  X,
  Plus,
  Settings2,
} from 'lucide-react';
import { useTasks, type TaskWithLead } from '@/hooks/useTasks';
import { useLeads } from '@/hooks/useLeads';
import { supabase } from '@/lib/supabase';
import type { TaskStatus, LeadStatus } from '@/types/database';
import type { Lead } from '@/types/database';
import { LeadCardPopup } from '@/components/CRM/LeadCardPopup';

/** CRM pipeline stage labels for the Status column (lead's column on the board) */
const CRM_STATUS_LABEL: Record<LeadStatus, string> = {
  backlog: 'Backlog',
  not_contacted: 'Not contacted',
  invite_sent: 'Invite sent',
  connected: 'Connected',
  reply: 'Reply',
  positive_reply: 'Positive reply',
  negotiation: 'Negotiation',
  closed: 'Closed',
  lost: 'Lost',
  disqualified: 'Disqualified',
};

type TasksViewMode = 'table' | 'todo';
type TodoFilter = 'todo' | 'done';

const TASKS_VIEW_KEY = 'leadflow_tasks_view';
const TODO_FILTER_KEY = 'leadflow_tasks_todo_filter';

function getStoredViewMode(): TasksViewMode {
  try {
    const v = localStorage.getItem(TASKS_VIEW_KEY);
    return v === 'todo' ? 'todo' : 'table';
  } catch {
    return 'table';
  }
}

function getStoredTodoFilter(): TodoFilter {
  try {
    const v = localStorage.getItem(TODO_FILTER_KEY);
    return v === 'done' ? 'done' : 'todo';
  } catch {
    return 'todo';
  }
}

export interface TasksViewProps {
  onNavigateToLead?: (leadId: string) => void;
}

export function TasksView({ onNavigateToLead: _onNavigateToLead }: TasksViewProps) {
  const [viewMode, setViewMode] = useState<TasksViewMode>(getStoredViewMode);
  const [todoFilter, setTodoFilter] = useState<TodoFilter>(getStoredTodoFilter);
  const [tableSearch, setTableSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createLeadId, setCreateLeadId] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const { tasks, isLoading, error, updateTaskStatus, updateTaskTitle, createTask, deleteTask, refreshTasks } = useTasks();
  const { leads, updateLead, updateLeadStatus } = useLeads({ initialFilters: { marked_as_lead_only: true }, pageSize: 100 });

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

  const setViewModeAndStore = (mode: TasksViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(TASKS_VIEW_KEY, mode);
    } catch {
      // ignore
    }
  };

  const setTodoFilterAndStore = (f: TodoFilter) => {
    setTodoFilter(f);
    try {
      localStorage.setItem(TODO_FILTER_KEY, f);
    } catch {
      // ignore
    }
  };

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

  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const doneTasks = tasks.filter((t) => t.status === 'done' || t.status === 'cancelled');

  const closePopup = () => {
    setSelectedTaskId(null);
    setSelectedLead(null);
  };

  const handleCreateTask = async () => {
    const leadId = createLeadId || leads[0]?.id;
    const title = createTitle.trim() || `Contact ${leads.find((l) => l.id === leadId)?.company_name || 'lead'}`;
    if (!leadId) return;
    setCreateSaving(true);
    try {
      await createTask(leadId, title);
      setShowCreateModal(false);
      setCreateTitle('');
      setCreateLeadId(leads[0]?.id ?? '');
    } finally {
      setCreateSaving(false);
    }
  };

  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewModeAndStore('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${
                viewMode === 'table'
                  ? 'bg-vloom-accent/15 text-vloom-accent'
                  : 'text-vloom-muted hover:text-vloom-text hover:bg-vloom-surface'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewModeAndStore('todo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${
                viewMode === 'todo'
                  ? 'bg-vloom-accent/15 text-vloom-accent'
                  : 'text-vloom-muted hover:text-vloom-text hover:bg-vloom-surface'
              }`}
            >
              <List className="w-4 h-4" />
              Todo
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreateModal(true);
              setCreateLeadId(leads[0]?.id ?? '');
              setCreateTitle('');
            }}
            className="inline-flex items-center gap-2 rounded-md bg-vloom-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-vloom-accent/90"
          >
            <Plus className="w-4 h-4" />
            Create task
          </button>
        </div>

        {viewMode === 'table' ? (
          <TasksTableView
            tasks={tasks}
            searchTerm={tableSearch}
            onSearchChange={setTableSearch}
            onStatusChange={updateTaskStatus}
            onDelete={deleteTask}
            onRefresh={refreshTasks}
            onOpenTask={(task) => openTaskPopup(task)}
            onCreateTaskClick={() => setShowCreateModal(true)}
          />
        ) : (
          <TasksTodoView
            pendingTasks={pendingTasks}
            doneTasks={doneTasks}
            todoFilter={todoFilter}
            onTodoFilterChange={setTodoFilterAndStore}
            onStatusChange={updateTaskStatus}
            onDelete={deleteTask}
            onRefresh={refreshTasks}
            onOpenTask={(task) => openTaskPopup(task)}
          />
        )}
      </div>

      {selectedLead && selectedTask && (
        <LeadCardPopup
          lead={selectedLead}
          currentTask={selectedTask}
          tasksForLead={tasks.filter((t) => t.lead_id === selectedLead.id)}
          onClose={closePopup}
          onUpdateLead={(id, updates) => updateLead(id, updates)}
          onUpdateLeadStatus={updateLeadStatus}
          onUpdateTaskStatus={updateTaskStatus}
          onUpdateTaskTitle={updateTaskTitle}
          onDeleteTask={deleteTask}
          onRefreshTasks={refreshTasks}
        />
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={() => setShowCreateModal(false)}>
          <div
            className="w-full max-w-md bg-vloom-surface rounded-xl border border-vloom-border p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-vloom-text mb-3">New task</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Lead</label>
                <select
                  value={createLeadId}
                  onChange={(e) => setCreateLeadId(e.target.value)}
                  className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.company_name || l.contact_name || l.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Title</label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="E.g. Contact company"
                  className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleCreateTask}
                disabled={createSaving || !createLeadId || leads.length === 0}
                className="rounded-md bg-vloom-accent px-4 py-2 text-sm font-medium text-white hover:bg-vloom-accent/90 disabled:opacity-50"
              >
                {createSaving ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-md border border-vloom-border px-4 py-2 text-sm text-vloom-text"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// View 1: Tasks table – Status, Title, Associated Contact/Company, CRM Status (no Last contacted, Last engagement, Task type)
function TasksTableView({
  tasks,
  searchTerm,
  onSearchChange,
  onStatusChange,
  onDelete,
  onRefresh,
  onOpenTask,
  onCreateTaskClick,
}: {
  tasks: TaskWithLead[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenTask: (task: TaskWithLead) => void;
  onCreateTaskClick: () => void;
}) {
  const q = searchTerm.trim().toLowerCase();
  const filteredTasks =
    q === '' ? tasks : tasks.filter((t) => t.title.toLowerCase().includes(q));

  return (
    <>
      {/* Bar above table: search left, Edit columns right */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 rounded-md border border-vloom-border bg-vloom-surface px-3 py-2 text-sm w-full max-w-md">
          <Search className="w-4 h-4 text-vloom-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Search task title and note"
            className="flex-1 bg-transparent outline-none text-vloom-text placeholder:text-vloom-muted min-w-0"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-vloom-border bg-vloom-surface text-sm text-vloom-muted hover:text-vloom-text"
        >
          <Settings2 className="w-4 h-4" />
          Edit columns
        </button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="bg-vloom-surface border border-vloom-border rounded-lg p-8 text-center text-vloom-muted text-sm">
          {tasks.length === 0 ? 'No tasks yet.' : 'No tasks match your search.'}
        </div>
      ) : (
        <div className="border border-vloom-border rounded-lg overflow-hidden bg-vloom-surface">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-vloom-border/30 border-b border-vloom-border z-10">
                <tr>
                  <th className="w-10 px-3 py-3" aria-label="Select" />
                  <th className="px-3 py-3 text-xs font-medium text-vloom-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 py-3 text-xs font-medium text-vloom-muted uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-3 py-3 text-xs font-medium text-vloom-muted uppercase tracking-wider">
                    Associated contact
                  </th>
                  <th className="px-3 py-3 text-xs font-medium text-vloom-muted uppercase tracking-wider">
                    Associated company
                  </th>
                  <th className="px-3 py-3 text-xs font-medium text-vloom-muted uppercase tracking-wider">
                    CRM status
                  </th>
                  <th className="w-20 px-3 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-vloom-border/50">
                {filteredTasks.map((task) => {
                  const leadStatus = task.leads?.status ?? 'backlog';
                  const crmLabel = CRM_STATUS_LABEL[leadStatus];
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-vloom-border/20"
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent"
                          aria-label="Select task"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <TaskStatusIcon
                          status={task.status}
                          onMarkDone={() => onStatusChange(task.id, 'done')}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenTask(task)}
                          className="text-vloom-accent hover:underline font-medium text-left"
                        >
                          {task.title}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-vloom-muted">
                        {task.leads?.contact_name?.trim() || '--'}
                      </td>
                      <td className="px-3 py-3 text-vloom-muted">
                        {task.leads?.company_name?.trim() ? (
                          <span className="inline-flex items-center gap-1.5 text-vloom-text">
                            <Building2 className="w-4 h-4 text-vloom-accent/80" />
                            {task.leads.company_name}
                          </span>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="px-3 py-3 text-vloom-muted">
                        {crmLabel}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onDelete(task.id)}
                          className="text-xs text-vloom-muted hover:text-vloom-error"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onRefresh()}
          className="text-sm text-vloom-muted hover:text-vloom-text"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={onCreateTaskClick}
          className="text-sm text-vloom-muted hover:text-vloom-accent border border-dashed border-vloom-border rounded-lg px-4 py-2"
        >
          + New task
        </button>
      </div>
    </>
  );
}

/** Blue circle with check when done; clickable circle when pending (HubSpot-style) */
function TaskStatusIcon({
  status,
  onMarkDone,
}: {
  status: TaskStatus;
  onMarkDone: () => void;
}) {
  const isDone = status === 'done' || status === 'cancelled';
  return (
    <span className="inline-flex items-center">
      {isDone ? (
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-blue-500"
          aria-label="Done"
        >
          <CheckCircle2 className="h-4 w-4" />
        </span>
      ) : (
        <button
          type="button"
          onClick={onMarkDone}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-vloom-border text-vloom-muted hover:border-vloom-accent hover:text-vloom-accent"
          aria-label="Mark done"
        >
          <Circle className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

// View 2: Todo List – same columns as table (Status, Title, Contact, Company, CRM status), click opens popup
function TasksTodoView({
  pendingTasks,
  doneTasks,
  todoFilter,
  onTodoFilterChange,
  onStatusChange,
  onDelete,
  onRefresh: _onRefresh,
  onOpenTask,
}: {
  pendingTasks: TaskWithLead[];
  doneTasks: TaskWithLead[];
  todoFilter: TodoFilter;
  onTodoFilterChange: (f: TodoFilter) => void;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenTask: (task: TaskWithLead) => void;
}) {
  const displayTasks = todoFilter === 'todo' ? pendingTasks : doneTasks;

  return (
    <>
      <div className="mb-2">
        <h1 className="text-base font-semibold text-vloom-text">Todo List</h1>
        <p className="text-sm text-vloom-muted mt-0.5">Same info as table. Click a row to open the lead card.</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => onTodoFilterChange('todo')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
            todoFilter === 'todo'
              ? 'bg-vloom-surface border border-vloom-border text-vloom-text'
              : 'text-vloom-muted hover:text-vloom-text'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          To Do
          {pendingTasks.length > 0 && (
            <span className="ml-1 text-sm text-vloom-muted">({pendingTasks.length})</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onTodoFilterChange('done')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${
            todoFilter === 'done'
              ? 'bg-vloom-surface border border-vloom-border text-vloom-text'
              : 'text-vloom-muted hover:text-vloom-text'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Done
          {doneTasks.length > 0 && (
            <span className="ml-1 text-sm text-vloom-muted">({doneTasks.length})</span>
          )}
        </button>
      </div>

      {displayTasks.length === 0 ? (
        <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
          {todoFilter === 'todo' ? 'No tasks to do.' : 'No completed tasks.'}
        </div>
      ) : (
        <div className="border border-vloom-border rounded-lg overflow-hidden bg-vloom-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-vloom-border/30 border-b border-vloom-border">
                <tr>
                  <th className="px-3 py-2 text-xs font-medium text-vloom-muted uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-xs font-medium text-vloom-muted uppercase tracking-wider">Title</th>
                  <th className="px-3 py-2 text-xs font-medium text-vloom-muted uppercase tracking-wider">Contact</th>
                  <th className="px-3 py-2 text-xs font-medium text-vloom-muted uppercase tracking-wider">Company</th>
                  <th className="px-3 py-2 text-xs font-medium text-vloom-muted uppercase tracking-wider">CRM status</th>
                  <th className="w-16 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-vloom-border/50">
                {displayTasks.map((task) => (
                  <TodoTaskRow
                    key={task.id}
                    task={task}
                    onToggleDone={() => onStatusChange(task.id, task.status === 'pending' ? 'done' : 'pending')}
                    onDelete={() => onDelete(task.id)}
                    onOpen={() => onOpenTask(task)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function TodoTaskRow({
  task,
  onToggleDone,
  onDelete,
  onOpen,
}: {
  task: TaskWithLead;
  onToggleDone: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const isChecked = task.status === 'done' || task.status === 'cancelled';
  const leadStatus = task.leads?.status ?? 'backlog';
  const crmLabel = CRM_STATUS_LABEL[leadStatus];

  return (
    <tr
      className="hover:bg-vloom-border/20 cursor-pointer"
      onClick={onOpen}
    >
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <TaskStatusIcon status={task.status} onMarkDone={onToggleDone} />
      </td>
      <td className="px-3 py-2">
        <span className={`font-medium text-vloom-accent hover:underline ${isChecked ? 'text-vloom-muted line-through' : 'text-vloom-text'}`}>
          {task.title}
        </span>
      </td>
      <td className="px-3 py-2 text-vloom-muted">
        {task.leads?.contact_name?.trim() || '--'}
      </td>
      <td className="px-3 py-2 text-vloom-muted">
        {task.leads?.company_name?.trim() ? (
          <span className="inline-flex items-center gap-1.5 text-vloom-text">
            <Building2 className="w-4 h-4 text-vloom-accent/80" />
            {task.leads.company_name}
          </span>
        ) : (
          '--'
        )}
      </td>
      <td className="px-3 py-2 text-vloom-muted">{crmLabel}</td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-vloom-muted hover:text-vloom-error"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}
