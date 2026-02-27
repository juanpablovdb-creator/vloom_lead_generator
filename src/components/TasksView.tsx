// =====================================================
// Leadflow Vloom - Tasks view (two views: Table + Todo list)
// =====================================================
import { useState } from 'react';
import {
  CheckSquare,
  ExternalLink,
  Loader2,
  LayoutGrid,
  List,
  BarChart3,
  Circle,
  CheckCircle2,
} from 'lucide-react';
import { useTasks, type TaskWithLead } from '@/hooks/useTasks';
import type { TaskStatus } from '@/types/database';

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Not Started',
  done: 'Done',
  cancelled: 'Cancelled',
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

function formatCompletedOn(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

export interface TasksViewProps {
  onNavigateToLead?: (leadId: string) => void;
}

export function TasksView({ onNavigateToLead }: TasksViewProps) {
  const [viewMode, setViewMode] = useState<TasksViewMode>(getStoredViewMode);
  const [todoFilter, setTodoFilter] = useState<TodoFilter>(getStoredTodoFilter);
  const { tasks, isLoading, error, updateTaskStatus, deleteTask, refreshTasks } = useTasks();

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

  return (
    <div className="p-4 md:p-6">
      {/* View switcher */}
      <div className="flex items-center gap-2 mb-4">
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

      {viewMode === 'table' ? (
        <TasksTableView
          tasks={tasks}
          onStatusChange={updateTaskStatus}
          onDelete={deleteTask}
          onNavigateToLead={onNavigateToLead}
          onRefresh={refreshTasks}
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
  );
}

// View 1: Projects & Tasks – table with Task name, Project, Assignee, Status, Completed on
function TasksTableView({
  tasks,
  onStatusChange,
  onDelete,
  onNavigateToLead,
  onRefresh,
}: {
  tasks: TaskWithLead[];
  onStatusChange: (id: string, status: TaskStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNavigateToLead?: (leadId: string) => void;
  onRefresh: () => Promise<void>;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-semibold text-vloom-text">Projects & Tasks</h1>
        <button
          type="button"
          onClick={() => onRefresh()}
          className="text-sm text-vloom-muted hover:text-vloom-text"
        >
          Refresh
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
          No tasks yet.
        </div>
      ) : (
        <div className="border border-vloom-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-vloom-border bg-vloom-surface/80">
                <th className="px-4 py-3 text-sm font-medium text-vloom-muted">Task name</th>
                <th className="px-4 py-3 text-sm font-medium text-vloom-muted">Project</th>
                <th className="px-4 py-3 text-sm font-medium text-vloom-muted">Assignee</th>
                <th className="px-4 py-3 text-sm font-medium text-vloom-muted">Status</th>
                <th className="px-4 py-3 text-sm font-medium text-vloom-muted">Completed on</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className="border-b border-vloom-border/50 last:border-b-0 hover:bg-vloom-surface/50"
                >
                  <td className="px-4 py-3 text-sm">
                    <span className="font-medium text-vloom-text block">{task.title}</span>
                    {task.leads?.job_url && (
                      <a
                        href={task.leads.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-vloom-accent hover:underline mt-0.5 inline-block"
                      >
                        View job
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-vloom-muted">
                    <span className="inline-flex items-center gap-1">
                      <BarChart3 className="w-4 h-4 opacity-60" />
                      Lead
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-vloom-muted">—</td>
                  <td className="px-4 py-3 text-sm">
                    <StatusCell status={task.status} onMarkDone={() => onStatusChange(task.id, 'done')} />
                  </td>
                  <td className="px-4 py-3 text-sm text-vloom-muted">
                    {task.status === 'done' ? formatCompletedOn(task.updated_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {onNavigateToLead && (
                        <button
                          type="button"
                          onClick={() => onNavigateToLead(task.lead_id)}
                          className="p-1.5 rounded text-vloom-muted hover:text-vloom-accent"
                          title="Ver tarjeta"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(task.id)}
                        className="text-sm text-vloom-muted hover:text-vloom-error"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
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

function StatusCell({
  status: taskStatus,
  onMarkDone,
}: {
  status: TaskStatus;
  onMarkDone: () => void;
}) {
  const label = STATUS_LABEL[taskStatus];
  const isPending = taskStatus === 'pending';
  const isDone = taskStatus === 'done';

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {isDone ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Circle className={`w-4 h-4 ${isPending ? 'text-vloom-muted' : 'text-vloom-muted'}`} />
      )}
      <span className={isDone ? 'text-vloom-muted' : ''}>{label}</span>
      {isPending && (
        <button
          type="button"
          onClick={onMarkDone}
          className="text-sm text-vloom-accent hover:underline ml-1"
        >
          Mark done
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
            title="Ver tarjeta"
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
