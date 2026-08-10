// =====================================================
// Leadflow Vloom - Shared lead card popup (CRM + Tasks)
// Left: main fields, Video Sent checkbox, Show more (all fields), Tasks.
// Right: Activity timeline.
// =====================================================
import { useState, useMemo, useEffect, useCallback } from 'react';
import { X, ChevronDown, ChevronUp, CheckCircle2, Circle, UserMinus } from 'lucide-react';
import { CrmDateInput } from './CrmDateInput';
import { supabase } from '@/lib/supabase';
import { dateOnlyToISO, isoToDateInputValue } from '@/lib/dateUtils';
import type { Lead, LeadStatus } from '@/types/database';
import type { LeadStatusHistory } from '@/types/database';
import type { TaskWithLead } from '@/hooks/useTasks';
import type { TaskStatus } from '@/types/database';
import { TASK_PRESET_OPTIONS, type TaskPresetId } from '@/lib/taskPresets';

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

const LEAD_STATUS_OPTIONS: LeadStatus[] = [
  'backlog',
  'not_contacted',
  'invite_sent',
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'nurturing',
  'closed',
  'lost',
  'disqualified',
];

const ASSIGNEE_OPTIONS = ['Aron D\'mello', 'Andres Leal', 'Juan Pablo Val'] as const;

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

function safeHostname(urlLike: string | null | undefined): string | null {
  const raw = (urlLike ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./i, '').trim();
    return host || null;
  } catch {
    return null;
  }
}

function logoUrlForLead(lead: Lead): string | null {
  const host = safeHostname(lead.company_url) ?? safeHostname(lead.company_linkedin_url);
  if (!host) return null;
  return `https://logo.clearbit.com/${host}`;
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
  /** Create a task for this lead (title + optional preset id). */
  onCreateTask?: (leadId: string, title: string, taskType?: string) => Promise<void>;
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
  const [statusHistory, setStatusHistory] = useState<LeadStatusHistory[]>([]);
  const [otherContactsAtCompany, setOtherContactsAtCompany] = useState<Pick<Lead, 'id' | 'contact_name' | 'contact_email' | 'company_name'>[]>([]);
  const [newTaskPresetId, setNewTaskPresetId] = useState<TaskPresetId>(TASK_PRESET_OPTIONS[0].id);
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    setLocalLead({
      ...lead,
      links: Array.isArray(lead.links) ? lead.links : [],
      budget: lead.budget ?? null,
    });
  }, [lead]);

  const channelSummaryLabel = useMemo(() => {
    const c = localLead.channel?.trim();
    if (c) return c;
    if (localLead.job_url && /linkedin\.com\/jobs/i.test(localLead.job_url)) return 'LinkedIn Job Post';
    if (localLead.job_source === 'linkedin_post_feed') return 'LinkedIn Post Feeds';
    return null;
  }, [localLead.channel, localLead.job_url, localLead.job_source]);

  const fetchOtherContactsAtCompany = useCallback(async () => {
    if (!supabase || !localLead.id) return;
    const linkedInUrl = localLead.company_linkedin_url?.trim();
    const companyName = localLead.company_name?.trim();
    if (!linkedInUrl && !companyName) {
      setOtherContactsAtCompany([]);
      return;
    }
    let query = supabase
      .from('leads')
      .select('id, contact_name, contact_email, company_name')
      .eq('user_id', localLead.user_id)
      .neq('id', localLead.id);
    if (linkedInUrl) {
      query = query.eq('company_linkedin_url', linkedInUrl as never);
    } else {
      query = query.eq('company_name', companyName as never);
    }
    const { data } = await query.limit(50);
    setOtherContactsAtCompany((data as Pick<Lead, 'id' | 'contact_name' | 'contact_email' | 'company_name'>[]) ?? []);
  }, [localLead.id, localLead.user_id, localLead.company_linkedin_url, localLead.company_name]);

  useEffect(() => {
    fetchOtherContactsAtCompany();
  }, [fetchOtherContactsAtCompany]);

  const fetchStatusHistory = useCallback(async () => {
    if (!lead?.id || !supabase) return;
    const { data, error } = await supabase
      .from('lead_status_history')
      .select('id, lead_id, from_status, to_status, changed_at')
      .eq('lead_id', lead.id)
      .order('changed_at', { ascending: false });
    if (!error) setStatusHistory((data as LeadStatusHistory[]) ?? []);
  }, [lead?.id]);

  useEffect(() => {
    fetchStatusHistory();
  }, [fetchStatusHistory]);

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
    await fetchStatusHistory();
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
    const items: { label: string; date: string; sortKey?: string }[] = [];
    if (localLead.created_at) items.push({ label: 'Lead imported', date: formatDate(localLead.created_at), sortKey: localLead.created_at });
    if (localLead.last_enriched_at) items.push({ label: 'Enriched', date: formatDate(localLead.last_enriched_at), sortKey: localLead.last_enriched_at });
    if (localLead.updated_at) items.push({ label: 'Last updated', date: formatDate(localLead.updated_at), sortKey: localLead.updated_at });
    items.push({ label: 'Status', date: CRM_STATUS_LABEL[localLead.status], sortKey: localLead.updated_at ?? localLead.created_at ?? '' });
    statusHistory.forEach((h) => {
      const toLabel = CRM_STATUS_LABEL[h.to_status as LeadStatus] ?? h.to_status;
      const fromLabel = h.from_status ? (CRM_STATUS_LABEL[h.from_status as LeadStatus] ?? h.from_status) : null;
      const label = fromLabel ? `Moved to ${toLabel} (from ${fromLabel})` : `Moved to ${toLabel}`;
      items.push({ label, date: formatDate(h.changed_at), sortKey: h.changed_at });
    });
    tasksForLead.filter((t) => t.status === 'done').forEach((t) => {
      items.push({ label: `Task completed: ${t.title}`, date: formatDate(t.updated_at), sortKey: t.updated_at });
    });
    items.sort((a, b) => (b.sortKey ?? '').localeCompare(a.sortKey ?? ''));
    return items.map(({ label, date }) => ({ label, date }));
  }, [localLead.created_at, localLead.last_enriched_at, localLead.updated_at, localLead.status, statusHistory, tasksForLead]);

  const initialFields = (
    <>
      <div>
        <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Company</div>
        <input
          type="text"
          value={localLead.company_name ?? ''}
          onChange={(e) => setLocalLead({ ...localLead, company_name: e.target.value })}
          onBlur={async () => {
            const v = (localLead.company_name ?? '').trim() || null;
            await onUpdateLead(localLead.id, { company_name: v });
            setLocalLead((prev) => ({ ...prev, company_name: v }));
          }}
          placeholder="Company name"
          className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Assignee</div>
          <select
            value={
              (localLead.assignee ?? '').trim() &&
              !ASSIGNEE_OPTIONS.includes((localLead.assignee ?? '').trim() as (typeof ASSIGNEE_OPTIONS)[number])
                ? ''
                : (localLead.assignee ?? '').trim()
            }
            onChange={async (e) => {
              const v = e.target.value.trim() || null;
              setLocalLead((prev) => ({ ...prev, assignee: v }));
              await onUpdateLead(localLead.id, { assignee: v });
            }}
            className="w-full max-w-xs rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          >
            <option value="">Unassigned</option>
            {ASSIGNEE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Budget (USD)</div>
          <input
            type="number"
            min={0}
            step={1}
            value={localLead.budget != null ? String(localLead.budget) : ''}
            onChange={(e) => {
              const raw = e.target.value;
              const n = raw === '' ? null : Number(raw);
              setLocalLead((prev) => ({
                ...prev,
                budget: n != null && Number.isFinite(n) ? n : null,
              }));
            }}
            onBlur={async () => {
              const n = localLead.budget;
              await onUpdateLead(localLead.id, {
                budget: n != null && Number.isFinite(n) ? n : null,
              });
            }}
            placeholder="e.g. 5000"
            className="w-full max-w-xs rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Website</div>
          <input
            type="url"
            value={localLead.company_url ?? ''}
            onChange={(e) => setLocalLead({ ...localLead, company_url: e.target.value })}
            onBlur={async () => {
              const v = (localLead.company_url ?? '').trim() || null;
              await onUpdateLead(localLead.id, { company_url: v });
              setLocalLead((prev) => ({ ...prev, company_url: v }));
            }}
            placeholder="https://…"
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Company LinkedIn</div>
          <input
            type="url"
            value={localLead.company_linkedin_url ?? ''}
            onChange={(e) => setLocalLead({ ...localLead, company_linkedin_url: e.target.value })}
            onBlur={async () => {
              const v = (localLead.company_linkedin_url ?? '').trim() || null;
              await onUpdateLead(localLead.id, { company_linkedin_url: v });
              setLocalLead((prev) => ({ ...prev, company_linkedin_url: v }));
            }}
            placeholder="https://linkedin.com/company/…"
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          />
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
          <input
            type="text"
            value={localLead.contact_name ?? ''}
            onChange={(e) => setLocalLead({ ...localLead, contact_name: e.target.value })}
            onBlur={async () => {
              const v = (localLead.contact_name ?? '').trim() || null;
              await onUpdateLead(localLead.id, { contact_name: v });
              setLocalLead((prev) => ({ ...prev, contact_name: v }));
            }}
            placeholder="Contact name"
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Contact email</div>
          <input
            type="email"
            value={localLead.contact_email ?? ''}
            onChange={(e) => setLocalLead({ ...localLead, contact_email: e.target.value })}
            onBlur={async () => {
              const v = (localLead.contact_email ?? '').trim() || null;
              await onUpdateLead(localLead.id, { contact_email: v });
              setLocalLead((prev) => ({ ...prev, contact_email: v }));
            }}
            placeholder="name@company.com"
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Contact LinkedIn</div>
          <input
            type="url"
            value={localLead.contact_linkedin_url ?? ''}
            onChange={(e) => setLocalLead({ ...localLead, contact_linkedin_url: e.target.value })}
            onBlur={async () => {
              const v = (localLead.contact_linkedin_url ?? '').trim() || null;
              await onUpdateLead(localLead.id, { contact_linkedin_url: v });
              setLocalLead((prev) => ({ ...prev, contact_linkedin_url: v }));
            }}
            placeholder="https://linkedin.com/in/…"
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          />
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Job post URL</div>
          <input
            type="url"
            value={localLead.job_url ?? ''}
            onChange={(e) => setLocalLead({ ...localLead, job_url: e.target.value })}
            onBlur={async () => {
              const v = (localLead.job_url ?? '').trim() || null;
              await onUpdateLead(localLead.id, { job_url: v });
              setLocalLead((prev) => ({ ...prev, job_url: v }));
            }}
            placeholder="https://linkedin.com/jobs/…"
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
          />
        </div>
        <div className="md:col-span-2">
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Links</div>
          <textarea
            value={(localLead.links ?? []).join('\n')}
            onChange={(e) => {
              const lines = e.target.value.split(/\r?\n/);
              setLocalLead((prev) => ({ ...prev, links: lines }));
            }}
            onBlur={async () => {
              const cleaned = (localLead.links ?? [])
                .map((s) => s.trim())
                .filter(Boolean);
              await onUpdateLead(localLead.id, { links: cleaned });
              setLocalLead((prev) => ({ ...prev, links: cleaned }));
            }}
            rows={3}
            placeholder={'One URL per line\nhttps://example.com/deck\nhttps://…'}
            className="w-full rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text resize-y"
          />
          <p className="mt-1 text-xs text-vloom-muted">Decks, samples, docs, or any missing LinkedIn/job URLs.</p>
          {(localLead.links ?? []).filter((l) => l.trim()).length > 0 && (
            <ul className="mt-2 space-y-1">
              {(localLead.links ?? [])
                .map((l) => l.trim())
                .filter(Boolean)
                .map((url) => (
                  <li key={url}>
                    <a
                      href={url.startsWith('http') ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-vloom-accent hover:underline break-all"
                    >
                      {url}
                    </a>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Channel</div>
          <div className="text-sm text-vloom-text">{channelSummaryLabel || '—'}</div>
        </div>
      </div>

      <div className="pt-3 border-t border-vloom-border">
        <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-2">Other contacts at this company</div>
        {otherContactsAtCompany.length === 0 ? (
          <p className="text-sm text-vloom-muted">
            No other contacts yet. Run &quot;Enrich with personas&quot; from the CRM table (select this lead and click the button) to find more people at this company.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm text-vloom-text">
            {otherContactsAtCompany.map((l) => (
              <li key={l.id}>
                {l.contact_name || '—'}
                {l.contact_email && (
                  <a href={`mailto:${l.contact_email}`} className="ml-2 text-vloom-accent hover:underline text-xs break-all">
                    {l.contact_email}
                  </a>
                )}
              </li>
            ))}
          </ul>
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
          <div className="flex items-center gap-3 min-w-0">
            {logoUrlForLead(localLead) ? (
              <img
                src={logoUrlForLead(localLead)!}
                alt=""
                className="w-9 h-9 rounded-lg border border-vloom-border bg-vloom-bg object-contain flex-shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-9 h-9 rounded-lg border border-vloom-border bg-vloom-bg flex-shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-vloom-text truncate">
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

            <div>
              <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Channel</div>
              <input
                type="text"
                value={localLead.channel ?? ''}
                onChange={(e) => setLocalLead({ ...localLead, channel: e.target.value })}
                onBlur={async () => {
                  const v = (localLead.channel ?? '').trim() || null;
                  await onUpdateLead(localLead.id, { channel: v });
                  setLocalLead((prev) => ({ ...prev, channel: v }));
                }}
                placeholder="e.g. LinkedIn, Website, Referral"
                className="w-full max-w-xs rounded-md border border-vloom-border bg-vloom-bg px-3 py-2 text-sm text-vloom-text"
              />
            </div>

            <div>
              <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">First contact date</div>
              <CrmDateInput
                fieldTone="dark"
                wrapperClassName="w-full max-w-xs"
                inputClassName="text-sm py-2"
                value={isoToDateInputValue(localLead.first_contacted_at ?? null) || undefined}
                onChange={async (raw) => {
                  // Persist on change (not blur): calendar button blurs the input before
                  // the pick, and blur would otherwise save a stale/null value.
                  const v = raw ? dateOnlyToISO(raw) : null;
                  setLocalLead((prev) => ({ ...prev, first_contacted_at: v }));
                  await onUpdateLead(localLead.id, { first_contacted_at: v });
                }}
                title="First contact date"
              />
              <p className="mt-1 text-xs text-vloom-muted">Used for KPI cohort. Clear to use history/updated date.</p>
            </div>

            {localLead.is_marked_as_lead && (
              <div className="pt-4 border-t border-vloom-border">
                <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-2">Remove from CRM</div>
                <p className="text-sm text-vloom-muted mb-2">
                  This will unmark the lead so it no longer appears in the CRM pipeline. The record is not deleted.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Remove this lead from the CRM? It will disappear from the pipeline but the record will remain.')) return;
                    await onUpdateLead(localLead.id, { is_marked_as_lead: false });
                    onClose();
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-medium"
                >
                  <UserMinus className="w-4 h-4" />
                  Remove from leads
                </button>
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
                <p className="text-sm text-vloom-muted mb-2">No tasks yet.</p>
              ) : (
                <ul className="space-y-2 mb-3">
                  {tasksForLead.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      {onUpdateTaskStatus && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateTaskStatus(t.id, t.status === 'done' ? 'backlog' : 'done')
                          }
                          className="flex-shrink-0"
                          title={t.status === 'done' ? 'Mark backlog' : 'Mark done'}
                        >
                          {t.status === 'done' ? (
                            <CheckCircle2 className="w-4 h-4 text-vloom-accent" />
                          ) : (
                            <Circle className="w-4 h-4 text-vloom-muted" />
                          )}
                        </button>
                      )}
                      <span className={t.status === 'done' ? 'text-vloom-muted line-through' : 'text-vloom-text'}>
                        {t.title}
                      </span>
                      <span className="text-[10px] uppercase text-vloom-muted">
                        {t.status === 'in_progress' ? 'In progress' : t.status}
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
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[12rem] flex-1">
                    <label className="block text-[10px] font-medium text-vloom-muted uppercase tracking-wider mb-1">
                      New task
                    </label>
                    <select
                      value={newTaskPresetId}
                      onChange={(e) => setNewTaskPresetId(e.target.value as TaskPresetId)}
                      className="w-full rounded-md border border-vloom-border bg-vloom-bg px-2 py-1.5 text-sm text-vloom-text"
                    >
                      {TASK_PRESET_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={creatingTask}
                    onClick={async () => {
                      const preset =
                        TASK_PRESET_OPTIONS.find((p) => p.id === newTaskPresetId) ??
                        TASK_PRESET_OPTIONS[0];
                      setCreatingTask(true);
                      try {
                        await onCreateTask(localLead.id, preset.title, preset.id);
                        await onRefreshTasks?.();
                      } finally {
                        setCreatingTask(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-md bg-vloom-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {creatingTask ? 'Adding…' : 'Add task'}
                  </button>
                </div>
              )}
            </div>

            {/* Current task (when opened from Tasks) - allow editing */}
            {currentTask && onUpdateTaskStatus && onUpdateTaskTitle && (
              <div className="pt-2 border-t border-vloom-border">
                <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-2">This task</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={
                      currentTask.status === 'in_progress' || currentTask.status === 'done'
                        ? currentTask.status
                        : 'backlog'
                    }
                    onChange={(e) => onUpdateTaskStatus(currentTask.id, e.target.value as TaskStatus)}
                    className="rounded-md border border-vloom-border bg-vloom-bg px-2 py-1 text-sm text-vloom-text"
                  >
                    <option value="backlog">Backlog</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
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
