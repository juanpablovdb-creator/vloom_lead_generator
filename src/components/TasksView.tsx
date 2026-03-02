// =====================================================
// Leadflow Vloom - Tasks view (two views: Table + Todo list)
// =====================================================
import { useState, useEffect } from 'react';
import {
  CheckSquare,
  ExternalLink,
  Loader2,
  LayoutGrid,
  List,
  Circle,
  CheckCircle2,
  Search,
  Building2,
  Settings2,
  X,
  Plus,
} from 'lucide-react';
import { useTasks, type TaskWithLead } from '@/hooks/useTasks';
import { useLeads } from '@/hooks/useLeads';
import type { TaskStatus, LeadStatus } from '@/types/database';
import type { Lead } from '@/types/database';

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

export function TasksView({ onNavigateToLead }: TasksViewProps) {
  const [viewMode, setViewMode] = useState<TasksViewMode>(getStoredViewMode);
  const [todoFilter, setTodoFilter] = useState<TodoFilter>(getStoredTodoFilter);
  const [tableSearch, setTableSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { tasks, isLoading, error, updateTaskStatus, updateTaskTitle, createTask, deleteTask, refreshTasks } = useTasks();
  const { leads } = useLeads({ initialFilters: { marked_as_lead_only: true }, pageSize: 100 });

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

  const openPanelForTask = (taskId: string | null) => {
    setSelectedTaskId(taskId);
    setPanelOpen(true);
  };
  const closePanel = () => {
    setPanelOpen(false);
    setSelectedTaskId(null);
  };

  return (
    <div className="p-4 md:p-6 flex gap-4 relative">
      <div className={`flex-1 min-w-0 ${viewMode === 'table' && panelOpen ? 'mr-[420px]' : ''}`}>
        {/* View switcher */}
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
          {viewMode === 'table' && (
            <button
              type="button"
              onClick={() => openPanelForTask(null)}
              className="inline-flex items-center gap-2 rounded-md bg-vloom-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-vloom-accent/90"
            >
              <Plus className="w-4 h-4" />
              Create task
            </button>
          )}
        </div>

        {viewMode === 'table' ? (
          <TasksTableView
            tasks={tasks}
            searchTerm={tableSearch}
            onSearchChange={setTableSearch}
            onStatusChange={updateTaskStatus}
            onDelete={deleteTask}
            onNavigateToLead={onNavigateToLead}
            onRefresh={refreshTasks}
            onOpenTask={openPanelForTask}
            onCreateTaskClick={() => openPanelForTask(null)}
          />
        ) : (
          <TasksTodoView
          pendingTasks={pendingTasks}
          doneTasks={doneTasks}
          todoFilter={todoFilter}
          onTodoFilterChange={setTodoFilterAndStore}
          onStatusChange={updateTaskStatus}
          onDelete={deleteTask}
          onNavigateToLead={onNavigateToLead}
          onRefresh={refreshTasks}
        />
        )}
      </div>

      {/* Right-hand task details panel (view/edit or create) */}
      {viewMode === 'table' && (
        <TaskDetailsPanel
          isOpen={panelOpen}
          taskId={selectedTaskId}
          tasks={tasks}
          leads={leads}
          onClose={closePanel}
          onSaveTitle={updateTaskTitle}
          onSaveStatus={updateTaskStatus}
          onCreate={createTask}
          onDelete={deleteTask}
          onSaved={refreshTasks}
          onNavigateToLead={onNavigateToLead}
        />
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
  onNavigateToLead,
  onRefresh,
  onOpenTask,
  onCreateTaskClick,
}: {
  tasks: TaskWithLead[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNavigateToLead?: (leadId: string) => void;
  onRefresh: () => Promise<void>;
  onOpenTask: (taskId: string) => void;
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
                          onClick={() => onOpenTask(task.id)}
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
                        <div className="flex items-center gap-1">
                          {onNavigateToLead && (
                            <button
                              type="button"
                              onClick={() => onNavigateToLead(task.lead_id)}
                              className="p-1.5 rounded text-vloom-muted hover:text-vloom-accent"
                              title="View lead"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDelete(task.id)}
                            className="text-xs text-vloom-muted hover:text-vloom-error"
                          >
                            Delete
                          </button>
                        </div>
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

/** Right-hand slide-out panel: view/edit task or create new */
function TaskDetailsPanel({
  isOpen,
  taskId,
  tasks,
  leads,
  onClose,
  onSaveTitle,
  onSaveStatus,
  onCreate,
  onDelete,
  onSaved,
  onNavigateToLead,
}: {
  isOpen: boolean;
  taskId: string | null;
  tasks: TaskWithLead[];
  leads: Lead[];
  onClose: () => void;
  onSaveTitle: (id: string, title: string) => Promise<void>;
  onSaveStatus: (id: string, status: TaskStatus) => Promise<void>;
  onCreate: (leadId: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaved: () => Promise<void>;
  onNavigateToLead?: (leadId: string) => void;
}) {
  const task = taskId ? tasks.find((t) => t.id === taskId) ?? null : null;
  const isCreate = taskId === null;
  const [title, setTitle] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('pending');
  const [createLeadId, setCreateLeadId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (task) {
      setTitle(task.title);
      setTaskStatus(task.status);
    } else {
      setTitle('');
      setTaskStatus('pending');
      if (leads.length > 0) setCreateLeadId(leads[0].id);
    }
  }, [isOpen, task?.id, task?.title, task?.status, leads]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isCreate) {
        await onCreate(createLeadId, title.trim() || 'New task');
        await onSaved();
        onClose();
      } else if (taskId) {
        await onSaveTitle(taskId, title.trim() || (task?.title ?? ''));
        if (taskStatus !== task?.status) await onSaveStatus(taskId, taskStatus);
        await onSaved();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!taskId) return;
    if (!confirm('Delete this task?')) return;
    setSaving(true);
    try {
      await onDelete(taskId);
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const leadStatus = task?.leads?.status ?? 'backlog';
  const crmLabel = CRM_STATUS_LABEL[leadStatus];

  return (
    <div
      className="fixed top-0 right-0 z-30 h-full w-full max-w-[420px] bg-vloom-surface border-l border-vloom-border shadow-xl flex flex-col"
      style={{ marginTop: 0 }}
    >
      <div className="flex items-center justify-between p-4 border-b border-vloom-border">
        <h2 className="text-lg font-semibold text-vloom-text">
          {isCreate ? 'Create task' : 'Task details'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-md text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/30"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
            Task title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
            placeholder="E.g. Follow up with contact"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
            Task type
          </label>
          <div className="text-sm text-vloom-muted">To-do</div>
        </div>

        {isCreate ? (
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
              Associate with lead
            </label>
            {leads.length === 0 ? (
              <p className="text-sm text-vloom-muted">No leads. Mark leads in CRM first.</p>
            ) : (
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
            )}
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
                Associate with records
              </label>
              <div className="text-sm text-vloom-text">
                {task?.leads?.company_name || task?.leads?.contact_name || '--'}
                {onNavigateToLead && task && (
                  <button
                    type="button"
                    onClick={() => onNavigateToLead(task.lead_id)}
                    className="ml-2 text-vloom-accent hover:underline"
                  >
                    View lead
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
                CRM status (lead column)
              </label>
              <div className="text-sm text-vloom-text">{crmLabel}</div>
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
            Task status
          </label>
          <select
            value={taskStatus}
            onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          >
            <option value="pending">Not started</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
            Notes
          </label>
          <textarea
            readOnly
            value="—"
            className="w-full rounded-md border border-vloom-border bg-vloom-border/20 px-3 py-2 text-sm text-vloom-muted min-h-[80px]"
            placeholder="Lead notes (from CRM)"
          />
        </div>
      </div>

      <div className="p-4 border-t border-vloom-border flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (isCreate && (!createLeadId || leads.length === 0))}
          className="rounded-md bg-vloom-accent px-4 py-2 text-sm font-medium text-white hover:bg-vloom-accent/90 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-vloom-border px-4 py-2 text-sm text-vloom-text hover:bg-vloom-border/30"
        >
          Cancel
        </button>
        {!isCreate && taskId && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="rounded-md border border-red-500/50 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-60"
          >
            Delete
          </button>
        )}
      </div>
    </div>
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

// View 2: Todo List – To Do / Done tabs, checklist style
function TasksTodoView({
  pendingTasks,
  doneTasks,
  todoFilter,
  onTodoFilterChange,
  onStatusChange,
  onDelete,
  onNavigateToLead,
  onRefresh: _onRefresh,
}: {
  pendingTasks: TaskWithLead[];
  doneTasks: TaskWithLead[];
  todoFilter: TodoFilter;
  onTodoFilterChange: (f: TodoFilter) => void;
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNavigateToLead?: (leadId: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const displayTasks = todoFilter === 'todo' ? pendingTasks : doneTasks;

  return (
    <>
      <div className="mb-2">
        <h1 className="text-base font-semibold text-vloom-text">Todo List</h1>
        <p className="text-sm text-vloom-muted mt-0.5">Stay organized with tasks, your way.</p>
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
        <ul className="space-y-1">
          {displayTasks.map((task) => (
            <TodoTaskRow
              key={task.id}
              task={task}
              isDoneView={todoFilter === 'done'}
              onToggleDone={() => onStatusChange(task.id, task.status === 'pending' ? 'done' : 'pending')}
              onDelete={() => onDelete(task.id)}
              onNavigateToLead={onNavigateToLead}
            />
          ))}
        </ul>
      )}

      <div className="mt-6">
        <button
          type="button"
          className="text-sm text-vloom-muted hover:text-vloom-accent border border-dashed border-vloom-border rounded-lg px-4 py-2 w-full"
        >
          + New task
        </button>
      </div>
    </>
  );
}

function TodoTaskRow({
  task,
  isDoneView: _isDoneView,
  onToggleDone,
  onDelete,
  onNavigateToLead,
}: {
  task: TaskWithLead;
  isDoneView: boolean;
  onToggleDone: () => void;
  onDelete: () => void;
  onNavigateToLead?: (leadId: string) => void;
}) {
  const isChecked = task.status === 'done' || task.status === 'cancelled';
  const jobUrl = task.leads?.job_url;

  return (
    <li className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-vloom-surface/50">
      <button
        type="button"
        onClick={onToggleDone}
        className="flex-shrink-0 mt-0.5 rounded border-2 border-vloom-border w-5 h-5 flex items-center justify-center hover:border-vloom-accent hover:bg-vloom-accent/10"
        aria-label={isChecked ? 'Mark not done' : 'Mark done'}
      >
        {isChecked && <CheckCircle2 className="w-4 h-4 text-vloom-accent" />}
      </button>
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm ${isChecked ? 'text-vloom-muted line-through' : 'text-vloom-text'}`}
        >
          {task.title}
        </span>
        {jobUrl && (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-vloom-accent hover:underline mt-0.5 inline-block"
          >
            View job
          </a>
        )}
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
        {onNavigateToLead && (
          <button
            type="button"
            onClick={() => onNavigateToLead(task.lead_id)}
            className="p-1.5 rounded text-vloom-muted hover:text-vloom-accent"
            title="View card"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-vloom-muted hover:text-vloom-error"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
