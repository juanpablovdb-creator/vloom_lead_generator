// =====================================================
// Leadflow Vloom - Shared lead card popup (CRM + Tasks)
// Left: main fields, Video Sent checkbox, Show more (all fields), Tasks.
// Right: Activity timeline.
// =====================================================
import { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, CheckCircle2, Circle } from 'lucide-react';
import type { Lead, LeadStatus } from '@/types/database';
import type { TaskWithLead } from '@/hooks/useTasks';
import type { TaskStatus } from '@/types/database';

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

const LEAD_STATUS_OPTIONS: LeadStatus[] = [
  'backlog',
  'not_contacted',
  'invite_sent',
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'closed',
  'lost',
  'disqualified',
];

function formatDate(s: string | null): string {
  return s ? new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

/** Get a single display string from an enrichment value (avoid [object Object]) */
function itemToDisplayString(x: unknown): string {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'number') return String(x);
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    const pick = (k: string) => (o[k] != null && typeof o[k] === 'string' ? String(o[k]) : null);
    return pick('name') ?? pick('title') ?? pick('label') ?? pick('value') ?? pick('text') ?? '';
  }
  return String(x);
}

/** Format enrichment_data values for display; returns '' when not displayable (no [object Object]) */
function formatEnrichmentValue(key: string, v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    const parts = v.map(itemToDisplayString).filter((s) => s.length > 0);
    return parts.join(', ');
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (key === 'foundedOn' && ('year' in o || 'month' in o)) {
      const y = o.year;
      if (y != null) return String(y);
      return '';
    }
    if (key === 'employeeCountRange' && ('start' in o || 'end' in o)) {
      const start = o.start;
      const end = o.end;
      if (start != null && end != null) return `${start}–${end}`;
      if (start != null) return `${start}+`;
      return '';
    }
    return '';
  }
  return String(v);
}

const URL_REGEX = /^https?:\/\/[^\s]+$/i;
function isUrl(s: string): boolean {
  return URL_REGEX.test(s.trim());
}

export interface LeadCardPopupProps {
  lead: Lead;
  /** When opened from Tasks, the task that was clicked (for editing task status). */
  currentTask?: TaskWithLead | null;
  /** All tasks linked to this lead (for display in popup). */
  tasksForLead?: TaskWithLead[];
  onClose: () => void;
  onUpdateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
  onUpdateLeadStatus?: (id: string, status: LeadStatus) => Promise<void>;
  onUpdateTaskStatus?: (taskId: string, status: TaskStatus) => Promise<void>;
  onUpdateTaskTitle?: (taskId: string, title: string) => Promise<void>;
  onDeleteTask?: (taskId: string) => Promise<void>;
  onCreateTask?: (leadId: string, title: string) => Promise<void>;
  onRefreshTasks?: () => Promise<void>;
}

export function LeadCardPopup({
  lead,
  currentTask,
  tasksForLead = [],
  onClose,
  onUpdateLead,
  onUpdateLeadStatus,
  onUpdateTaskStatus,
  onUpdateTaskTitle,
  onDeleteTask,
  onCreateTask,
  onRefreshTasks,
}: LeadCardPopupProps) {
  const [showMore, setShowMore] = useState(false);
  const [localLead, setLocalLead] = useState(lead);

  const videoSent = localLead.tags?.includes('video_sent') ?? false;
  const toggleVideoSent = async () => {
    const nextTags = videoSent
      ? (localLead.tags ?? []).filter((t) => t !== 'video_sent')
      : [...(localLead.tags ?? []), 'video_sent'];
    await onUpdateLead(localLead.id, { tags: nextTags });
    setLocalLead({ ...localLead, tags: nextTags });
  };

  const handleStatusChange = async (status: LeadStatus) => {
    if (!onUpdateLeadStatus) return;
    await onUpdateLeadStatus(localLead.id, status);
    setLocalLead({ ...localLead, status });
  };

  const enrich = localLead.enrichment_data as Record<string, unknown> | null | undefined;
  const enrichmentEntries = useMemo(() => {
    if (!enrich || typeof enrich !== 'object') return [];
    return Object.entries(enrich)
      .map(([key, v]) => ({
        key,
        label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        value: formatEnrichmentValue(key, v),
        raw: v,
      }))
      .filter((e) => e.value !== '' && !e.value.includes('[object Object]'));
  }, [enrich]);

  const activityItems = useMemo(() => {
    const items: { label: string; date: string }[] = [];
    if (localLead.created_at) items.push({ label: 'Lead imported', date: formatDate(localLead.created_at) });
    if (localLead.last_enriched_at) items.push({ label: 'Enriched', date: formatDate(localLead.last_enriched_at) });
    if (localLead.updated_at) items.push({ label: 'Last updated', date: formatDate(localLead.updated_at) });
    items.push({ label: 'Status', date: CRM_STATUS_LABEL[localLead.status] });
    tasksForLead.filter((t) => t.status === 'done' || t.status === 'cancelled').forEach((t) => {
      items.push({ label: `Task completed: ${t.title}`, date: formatDate(t.updated_at) });
    });
    return items;
  }, [localLead.created_at, localLead.last_enriched_at, localLead.updated_at, localLead.status, tasksForLead]);

  const initialFields = (
    <>
      <div>
        <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Company</div>
        <div className="text-sm text-vloom-text">{localLead.company_name || '—'}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Website</div>
          {localLead.company_url ? (
            <a href={localLead.company_url} target="_blank" rel="noopener noreferrer" className="text-sm text-vloom-accent hover:underline break-all">
              {localLead.company_url}
            </a>
          ) : (
            <div className="text-sm text-vloom-muted">—</div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Company LinkedIn</div>
          {localLead.company_linkedin_url ? (
            <a href={localLead.company_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm text-vloom-accent hover:underline">
              Company LinkedIn
            </a>
          ) : (
            <div className="text-sm text-vloom-muted">—</div>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Revenue / funding</div>
          <div className="text-sm text-vloom-text">{localLead.company_funding || '—'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Location</div>
          <div className="text-sm text-vloom-text">{localLead.company_location || localLead.job_location || '—'}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Contact</div>
          <div className="text-sm text-vloom-text">{localLead.contact_name || '—'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Contact email</div>
          {localLead.contact_email ? (
            <a href={`mailto:${localLead.contact_email}`} className="text-sm text-vloom-accent hover:underline break-all">
              {localLead.contact_email}
            </a>
          ) : (
            <div className="text-sm text-vloom-muted">—</div>
          )}
        </div>
        {localLead.contact_linkedin_url && (
          <div>
            <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Contact LinkedIn</div>
            <a href={localLead.contact_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm text-vloom-accent hover:underline">
              Open profile
            </a>
          </div>
        )}
        {localLead.job_url && (
          <div>
            <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Job post</div>
            <a href={localLead.job_url} target="_blank" rel="noopener noreferrer" className="text-sm text-vloom-accent hover:underline break-all">
              {localLead.job_url}
            </a>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[85vh] bg-vloom-surface rounded-xl border border-vloom-border shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-vloom-border">
          <div>
            <h2 className="text-lg font-semibold text-vloom-text">
              {localLead.company_name || localLead.contact_name || localLead.job_title || 'Lead details'}
            </h2>
            {localLead.job_title && (
              <p className="text-sm text-vloom-muted">
                {localLead.job_title}
                {localLead.job_posted_at && (
                  <> · Posted {new Date(localLead.job_posted_at).toLocaleDateString(undefined, { dateStyle: 'short' })}</>
                )}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-md text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/30">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 min-w-0 p-4 space-y-4 overflow-y-auto">
            {/* Video Sent checkbox - left side */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={videoSent}
                onChange={toggleVideoSent}
                className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent"
              />
              <span className="text-sm font-medium text-vloom-text">Video Sent</span>
            </label>

            {initialFields}

            {onUpdateLeadStatus && (
              <div>
                <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">CRM status</div>
                <select
                  value={localLead.status}
                  onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                  className="w-full max-w-xs rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
                >
                  {LEAD_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {CRM_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!showMore ? (
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className="flex items-center gap-1 text-sm text-vloom-accent hover:underline"
              >
                Show more <ChevronDown className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowMore(false)}
                  className="flex items-center gap-1 text-sm text-vloom-muted hover:text-vloom-text"
                >
                  Show less <ChevronUp className="w-4 h-4" />
                </button>
                <div className="space-y-3 pt-2 border-t border-vloom-border">
                  <div>
                    <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Job description</div>
                    <p className="text-sm text-vloom-text whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {localLead.job_description || '—'}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Company description</div>
                    <p className="text-sm text-vloom-text whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {localLead.company_description || '—'}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Notes</div>
                    <p className="text-sm text-vloom-text whitespace-pre-wrap">{localLead.notes || '—'}</p>
                  </div>
                  {enrichmentEntries.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-2">Enrichment data</div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {enrichmentEntries.map((entry) => {
                          const { key, label, value, raw } = entry as {
                            key: string;
                            label: string;
                            value: string;
                            raw: unknown;
                          };

                          // Special handling for similar organizations: show each org name as link when url is present
                          if (key.toLowerCase().includes('similar') && Array.isArray(raw)) {
                            const parts = raw
                              .map((item, index) => {
                                const obj = item as Record<string, unknown>;
                                const name = itemToDisplayString(obj);
                                const url = typeof obj.url === 'string' ? obj.url : undefined;
                                if (!name) return null;
                                const content = url && isUrl(url) ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-vloom-accent hover:underline"
                                  >
                                    {name}
                                  </a>
                                ) : (
                                  <span>{name}</span>
                                );
                                return (
                                  <span key={index}>
                                    {index > 0 ? ', ' : ''}
                                    {content}
                                  </span>
                                );
                              })
                              .filter(Boolean);

                            if (parts.length === 0) return null;

                            return (
                              <div key={key}>
                                <span className="text-vloom-muted">{label}:</span>{' '}
                                <span className="text-vloom-text break-words">{parts}</span>
                              </div>
                            );
                          }

                          // Generic rendering with URL detection inside the string
                          return (
                            <div key={key}>
                              <span className="text-vloom-muted">{label}:</span>{' '}
                              <span className="text-vloom-text break-words">
                                {isUrl(value) ? (
                                  <a
                                    href={value}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-vloom-accent hover:underline"
                                  >
                                    {value}
                                  </a>
                                ) : (
                                  value.split(', ').map((part, i) => {
                                    const trimmed = part.trim();
                                    if (!trimmed) return null;
                                    if (isUrl(trimmed)) {
                                      return (
                                        <span key={i}>
                                          {i > 0 ? ', ' : ''}
                                          <a
                                            href={trimmed}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-vloom-accent hover:underline"
                                          >
                                            {trimmed}
                                          </a>
                                        </span>
                                      );
                                    }
                                    return (
                                      <span key={i}>
                                        {i > 0 ? ', ' : ''}
                                        {trimmed}
                                      </span>
                                    );
                                  })
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Tasks section */}
            <div className="pt-2 border-t border-vloom-border">
              <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-2">Tasks</div>
              {tasksForLead.length === 0 ? (
                <p className="text-sm text-vloom-muted">No tasks.</p>
              ) : (
                <ul className="space-y-2">
                  {tasksForLead.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      {onUpdateTaskStatus && (
                        <button
                          type="button"
                          onClick={() => onUpdateTaskStatus(t.id, t.status === 'pending' ? 'done' : 'pending')}
                          className="flex-shrink-0"
                        >
                          {t.status === 'done' || t.status === 'cancelled' ? (
                            <CheckCircle2 className="w-4 h-4 text-vloom-accent" />
                          ) : (
                            <Circle className="w-4 h-4 text-vloom-muted" />
                          )}
                        </button>
                      )}
                      <span className={t.status === 'done' || t.status === 'cancelled' ? 'text-vloom-muted line-through' : 'text-vloom-text'}>
                        {t.title}
                      </span>
                      {onDeleteTask && (
                        <button
                          type="button"
                          onClick={() => onDeleteTask(t.id)}
                          className="ml-auto text-xs text-vloom-muted hover:text-vloom-error"
                        >
                          Delete
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {onCreateTask && (
                <button
                  type="button"
                  onClick={async () => {
                    const title = `Contact ${[localLead.company_name, localLead.contact_name].filter(Boolean).join(' – ') || 'lead'}`;
                    await onCreateTask(localLead.id, title);
                    await onRefreshTasks?.();
                  }}
                  className="mt-2 text-sm text-vloom-accent hover:underline"
                >
                  + Add task
                </button>
              )}
            </div>

            {/* Current task (when opened from Tasks) - allow editing */}
            {currentTask && onUpdateTaskStatus && onUpdateTaskTitle && (
              <div className="pt-2 border-t border-vloom-border">
                <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-2">This task</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={currentTask.status}
                    onChange={(e) => onUpdateTaskStatus(currentTask.id, e.target.value as TaskStatus)}
                    className="rounded-md border border-vloom-border bg-vloom-bg px-2 py-1 text-sm text-vloom-text"
                  >
                    <option value="pending">Pending</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  {onDeleteTask && (
                    <button
                      type="button"
                      onClick={() => onDeleteTask(currentTask.id)}
                      className="text-sm text-vloom-muted hover:text-vloom-error"
                    >
                      Delete task
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-72 flex-shrink-0 border-l border-vloom-border p-4 bg-vloom-border/10 overflow-y-auto">
            <h4 className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-3">Activity</h4>
            <ul className="space-y-3">
              {activityItems.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-vloom-accent/60 mt-1.5" />
                  <div>
                    <div className="text-vloom-text font-medium">{item.label}</div>
                    {item.date && <div className="text-xs text-vloom-muted">{item.date}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
