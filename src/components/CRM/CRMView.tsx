// =====================================================
// Leadflow Vloom - CRM view (Kanban + Tabla + useLeads)
// =====================================================
import { useState, useMemo, useEffect, useCallback } from 'react';
import { LayoutGrid, Plus, X, Target, Trash2, Loader2, Columns } from 'lucide-react';
import Papa from 'papaparse';
import { recomputeLeadScores, enrichLeadsWithPersonas } from '@/lib/apify';
import { useLeads, type CreateLeadInput } from '@/hooks/useLeads';
import { useTasks } from '@/hooks/useTasks';
import { SUPABASE_CONFIG_HINT, getCurrentUser, supabase } from '@/lib/supabase';
import { getDisplayLeadsForView } from '@/lib/leadViewUtils';
import type { Database, Lead, LeadStatus, LeadViewBy } from '@/types/database';
import { LEAD_CHANNEL_OPTIONS, LINKEDIN_JOB_POST_CHANNEL } from '@/lib/leadChannels';
import { CRMKanban } from './CRMKanban';
import { LeadsTable } from '@/components/LeadsTable';
import { FilterBar } from '@/components/FilterBar';
import { LeadCardPopup } from './LeadCardPopup';
import { CrmDateInput } from './CrmDateInput';
import { lastFridayDateOnly } from '@/lib/dateUtils';

const CHANNEL_OPTIONS = LEAD_CHANNEL_OPTIONS;
const ASSIGNEE_OPTIONS = ['Aron D\'mello', 'Andres Leal', 'Juan Pablo Val'] as const;

/** Parse YYYY-MM-DD (date input) as local noon → ISO for DB (avoids UTC shift). */
function dateOnlyToISO(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

function normalizeStatusFromCsv(stage: unknown): Lead['status'] {
  const s = String(stage ?? '').trim().toLowerCase();
  if (!s) return 'backlog';
  if (s === 'backlog') return 'backlog';
  if (s === 'disqualified') return 'disqualified';
  // In this CRM, "FIRST CONTACT" corresponds to the stage where the first outreach is sent.
  // Map it to `invite_sent` so it lands in the expected Kanban column.
  if (s === 'first contact') return 'invite_sent';
  // tolerate alternative exports
  if (s === 'first_contact' || s === 'first-contact') return 'invite_sent';
  if (s === 'invite sent') return 'invite_sent';
  if (s === 'connected') return 'connected';
  if (s === 'reply') return 'reply';
  if (s === 'positive reply') return 'positive_reply';
  if (s === 'negotiation') return 'negotiation';
  if (s === 'closed') return 'closed';
  if (s === 'lost') return 'lost';
  return 'backlog';
}

function extractLinkedInJobExternalId(jobUrl: unknown): string | null {
  const url = String(jobUrl ?? '').trim();
  if (!url) return null;
  const m = url.match(/linkedin\.com\/jobs\/view\/(\d+)/i);
  return m?.[1] ?? null;
}

function parseScore(score: unknown): number | null {
  const s = String(score ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIsoFromCsvPostedDate(posted: unknown): string | null {
  const s = String(posted ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return dateOnlyToISO(s);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const CRM_PREFS_KEY = 'leadflow_crm_preferences';

type CRMViewMode = 'kanban' | 'table';

interface CRMPreferences {
  viewMode: CRMViewMode;
  marked_as_lead_only?: boolean;
  view_by?: LeadViewBy;
}

function getCRMPreferences(): CRMPreferences {
  try {
    const raw = localStorage.getItem(CRM_PREFS_KEY);
    if (!raw) return { viewMode: 'table', view_by: 'both' };
    const parsed = JSON.parse(raw) as Partial<CRMPreferences>;
    const vb = parsed.view_by;
    const view_by: LeadViewBy =
      vb === 'company' ? 'company' : vb === 'person' ? 'person' : vb === 'both' ? 'both' : 'both';
    return {
      viewMode: parsed.viewMode === 'kanban' ? 'kanban' : 'table',
      // Only persist the ON state; avoid storing `false` so CRM opens with no filter selected.
      marked_as_lead_only: parsed.marked_as_lead_only === true ? true : undefined,
      view_by,
    };
  } catch {
    return { viewMode: 'table', view_by: 'both' };
  }
}

function setCRMPreferences(prefs: Partial<CRMPreferences>) {
  try {
    const prev = getCRMPreferences();
    const next: CRMPreferences = { ...prev, ...prefs };
    // Never persist the explicit OFF state.
    if (next.marked_as_lead_only !== true) delete next.marked_as_lead_only;
    localStorage.setItem(CRM_PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

interface AddLeadModalProps {
  onClose: () => void;
  onCreate: (data: CreateLeadInput) => Promise<Lead | null>;
  onCreated: (lead: Lead) => void;
}

function AddLeadModal({ onClose, onCreate, onCreated }: AddLeadModalProps) {
  const [company_name, setCompany_name] = useState('');
  const [contact_name, setContact_name] = useState('');
  const [contact_email, setContact_email] = useState('');
  const [assignee, setAssignee] = useState('');
  const [channel, setChannel] = useState('');
  const [channelOther, setChannelOther] = useState('');
  const [first_contacted_at, setFirst_contacted_at] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const channelValue = channel === 'Other' ? (channelOther.trim() || null) : (channel || null);
      const lead = await onCreate({
        company_name: company_name.trim() || null,
        contact_name: contact_name.trim() || null,
        contact_email: contact_email.trim() || null,
        assignee: assignee.trim() || null,
        channel: channelValue,
        notes: notes.trim() || null,
        first_contacted_at: first_contacted_at.trim() ? dateOnlyToISO(first_contacted_at.trim()) : undefined,
      });
      if (lead) {
        onCreated(lead);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-vloom-surface rounded-xl border border-vloom-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-vloom-border">
          <h2 className="text-lg font-semibold text-vloom-text">Add new lead</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-md text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/30">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Company</label>
            <input
              type="text"
              value={company_name}
              onChange={(e) => setCompany_name(e.target.value)}
              placeholder="Company name"
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Contact name</label>
            <input
              type="text"
              value={contact_name}
              onChange={(e) => setContact_name(e.target.value)}
              placeholder="Contact name"
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Email</label>
            <input
              type="email"
              value={contact_email}
              onChange={(e) => setContact_email(e.target.value)}
              placeholder="contact@company.com"
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Assignee (optional)</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
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
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            >
              <option value="">Select channel</option>
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {channel === 'Other' && (
              <input
                type="text"
                value={channelOther}
                onChange={(e) => setChannelOther(e.target.value)}
                placeholder="Specify channel"
                className="mt-2 w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">First contact date (optional)</label>
            <input
              type="date"
              value={first_contacted_at}
              onChange={(e) => setFirst_contacted_at(e.target.value)}
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            />
            <p className="mt-1 text-xs text-vloom-muted">For past cohorts in KPIs. Leave empty for today.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              rows={2}
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-vloom-muted hover:text-vloom-text rounded-lg border border-vloom-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-2 text-sm font-medium text-white bg-vloom-accent rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CRMView() {
  const [initialPrefs] = useState(() => getCRMPreferences());
  const [viewMode, setViewMode] = useState<CRMViewMode>(() => initialPrefs.viewMode);

  const {
    leads,
    isLoading,
    error,
    updateLeadStatus,
    updateLead,
    createLead,
    deleteLeads,
    updateFilter,
    filters,
    sort,
    setSort,
    pagination,
    setPageSize,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
    refreshLeads,
  } = useLeads({
    pageSize: 500,
    fetchFullFilteredSet: viewMode === 'kanban',
    initialFilters: {
      marked_as_lead_only: initialPrefs.marked_as_lead_only,
      view_by: initialPrefs.view_by,
    },
    initialSort: { column: 'updated_at', direction: 'desc' },
  });
  const [recomputingScores, setRecomputingScores] = useState(false);
  const [personaEnriching, setPersonaEnriching] = useState(false);
  const [personaEnrichError, setPersonaEnrichError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [csvImportSummary, setCsvImportSummary] = useState<string | null>(null);
  const [lastCsvFilename, setLastCsvFilename] = useState<string | null>(null);
  const [lastCsvImportedAt, setLastCsvImportedAt] = useState<string | null>(null);
  const [csvBatchUpdating, setCsvBatchUpdating] = useState(false);
  const [csvBatchUpdateError, setCsvBatchUpdateError] = useState<string | null>(null);
  const { tasks, updateTaskStatus, updateTaskTitle, deleteTask, createTask, refreshTasks } = useTasks();
  const [bulkFirstContactDate, setBulkFirstContactDate] = useState('');
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>('disqualified');
  const [bulkAssignee, setBulkAssignee] = useState('');

  const [csvBatchFirstContactDate, setCsvBatchFirstContactDate] = useState<string>(() => lastFridayDateOnly());

  // Grid view uses paged fetch; Kanban uses fetchFullFilteredSet in useLeads (chunked) instead.
  useEffect(() => {
    if (viewMode !== 'kanban' && pagination.pageSize !== 500) setPageSize(500);
  }, [viewMode, pagination.pageSize, setPageSize]);

  const handleImportCsv = useCallback(async (file: File) => {
    setCsvImportError(null);
    setCsvImportSummary(null);
    setCsvBatchUpdateError(null);
    if (!supabase) {
      setCsvImportError('Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    const user = await getCurrentUser();
    if (!user) {
      setCsvImportError('You must be logged in to import leads.');
      return;
    }
    setCsvImporting(true);
    try {
      setLastCsvFilename(file.name);
      const text = await file.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => String(h ?? '').trim(),
      });
      if (parsed.errors?.length) throw new Error(parsed.errors[0]?.message ?? 'CSV parse error');
      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      if (!rows.length) {
        setCsvImportSummary('CSV is empty.');
        return;
      }

      const getField = (row: Record<string, unknown>, keys: string[]): string => {
        for (const k of keys) {
          const v = row[k];
          if (v != null && String(v).trim()) return String(v);
        }
        // Case-insensitive fallback (and tolerate common misspellings)
        const lowerKeys = new Set(keys.map((k) => k.toLowerCase()));
        for (const [k, v] of Object.entries(row)) {
          if (lowerKeys.has(k.toLowerCase()) && v != null && String(v).trim()) return String(v);
        }
        return '';
      };

      const toInsertWithExternalId: Array<Database['public']['Tables']['leads']['Insert']> = [];
      const toInsertWithoutExternalId: Array<Database['public']['Tables']['leads']['Insert']> = [];
      let updatedExisting = 0;
      let insertedNew = 0;
      let skippedInvalid = 0;
      let failedUpdates = 0;

      for (const r of rows) {
        const job_url = getField(r, ['Job URL', 'JobURL', 'job_url', 'job url']).trim() || null;
        const job_title = getField(r, ['Title', 'Job Title', 'job_title']).trim() || null;
        const company_name = getField(r, ['Company', 'comapny', 'company', 'Company Name', 'company_name']).trim() || null;
        if (!job_url && !job_title && !company_name) {
          skippedInvalid++;
          continue;
        }
        const job_external_id = extractLinkedInJobExternalId(job_url);
        const status = normalizeStatusFromCsv(getField(r, ['Stage', 'stage', 'Status']).trim());
        const assignee = getField(r, ['Assignee', 'assignee', 'Owner']).trim() || null;
        const notes = getField(r, ['Notes', 'notes', 'Note']).trim() || null;
        const score = parseScore(getField(r, ['Score', 'score']).trim());
        const company_linkedin_url = getField(r, ['Company LinkedIn', 'Company Linkedin', 'company_linkedin', 'company_linkedin_url']).trim() || null;
        const job_location = getField(r, ['Location', 'job_location']).trim() || null;
        const job_salary_range = getField(r, ['Salary', 'job_salary_range']).trim() || null;
        const job_posted_at = toIsoFromCsvPostedDate(getField(r, ['Posted Date', 'Posted', 'posted_date', 'job_posted_at']).trim());
        const employment_type = getField(r, ['Employment Type', 'employment_type']).trim() || null;
        const workplace_type = getField(r, ['Workplace Type', 'workplace_type']).trim() || null;
        const experience_level = getField(r, ['Experience Level', 'experience_level']).trim() || null;

        const baseRow: Database['public']['Tables']['leads']['Insert'] = {
          user_id: user.id,
          is_shared: false,
          assignee,
          job_title,
          job_description: null,
          job_url,
          job_source: 'linkedin',
          job_location,
          job_salary_range,
          job_posted_at,
          company_name,
          company_url: null,
          company_linkedin_url,
          company_size: null,
          company_industry: null,
          company_description: null,
          company_funding: null,
          company_location: null,
          contact_name: null,
          contact_title: null,
          contact_email: null,
          contact_linkedin_url: null,
          contact_phone: null,
          status,
          score: score ?? 0,
          score_weights: {
            has_email: 25,
            has_linkedin: 15,
            company_size_match: 20,
            industry_match: 20,
            recent_posting: 20,
          },
          enrichment_data: {
            import: { source: 'csv', filename: file.name, imported_at: new Date().toISOString() },
            csv: {
              score,
              employment_type,
              workplace_type,
              experience_level,
              assignee,
            },
          },
          last_enriched_at: null,
          notes,
          tags: [],
          scraping_job_id: null,
          job_external_id,
          is_marked_as_lead: true,
          channel: LINKEDIN_JOB_POST_CHANNEL,
          first_contacted_at: null,
        };

        // If there's a URL, first try to UPDATE existing rows (so stage and marked_as_lead are corrected).
        if (job_url) {
          const patch: Database['public']['Tables']['leads']['Update'] = {
            assignee: baseRow.assignee,
            job_title: baseRow.job_title,
            job_location: baseRow.job_location,
            job_salary_range: baseRow.job_salary_range,
            job_posted_at: baseRow.job_posted_at,
            company_name: baseRow.company_name,
            company_linkedin_url: baseRow.company_linkedin_url,
            status: baseRow.status,
            score: baseRow.score,
            notes: baseRow.notes,
            enrichment_data: baseRow.enrichment_data,
            is_marked_as_lead: true,
            channel: baseRow.channel,
            job_source: baseRow.job_source,
          };
          const { data: updatedRows, error: updateErr } = await supabase
            .from('leads')
            .update(patch as never)
            .eq('user_id', user.id)
            .eq('job_url', job_url)
            .select('id');
          if (updateErr) {
            failedUpdates++;
          } else if ((updatedRows ?? []).length > 0) {
            updatedExisting += (updatedRows ?? []).length;
            continue;
          }
          // Nothing updated → insert as new.
        }

        if (job_external_id) toInsertWithExternalId.push(baseRow);
        else toInsertWithoutExternalId.push(baseRow);
      }

      if (!toInsertWithExternalId.length && !toInsertWithoutExternalId.length && updatedExisting === 0) {
        setCsvImportSummary(`Nothing to import. Invalid: ${skippedInvalid}.`);
        return;
      }

      // Chunk insert/upsert to avoid request size limits
      const chunkSize = 300;
      for (let i = 0; i < toInsertWithExternalId.length; i += chunkSize) {
        const chunk = toInsertWithExternalId.slice(i, i + chunkSize);
        const { error: upsertErr } = await supabase
          .from('leads')
          .upsert(chunk as never, { onConflict: 'user_id,job_external_id' });
        if (upsertErr) throw upsertErr;
        insertedNew += chunk.length;
      }
      for (let i = 0; i < toInsertWithoutExternalId.length; i += chunkSize) {
        const chunk = toInsertWithoutExternalId.slice(i, i + chunkSize);
        const { error: insertErr } = await supabase.from('leads').insert(chunk as never);
        if (insertErr) throw insertErr;
        insertedNew += chunk.length;
      }

      setCsvImportSummary(
        `Updated ${updatedExisting} existing, inserted ${insertedNew} new. Invalid: ${skippedInvalid}.` +
          (failedUpdates ? ` Update errors: ${failedUpdates}.` : ''),
      );
      setLastCsvImportedAt(new Date().toISOString());
      await refreshLeads();
    } catch (err) {
      setCsvImportError(err instanceof Error ? err.message : 'CSV import failed');
    } finally {
      setCsvImporting(false);
    }
  }, [refreshLeads]);

  const handleSetFirstContactForLastCsv = useCallback(async () => {
    setCsvBatchUpdateError(null);
    if (!supabase) {
      setCsvBatchUpdateError('Supabase not configured.');
      return;
    }
    const user = await getCurrentUser();
    if (!user) {
      setCsvBatchUpdateError('You must be logged in.');
      return;
    }
    const filename = lastCsvFilename;
    if (!filename) {
      setCsvBatchUpdateError('No CSV import detected in this session.');
      return;
    }
    if (!csvBatchFirstContactDate.trim()) {
      setCsvBatchUpdateError('Pick a date first.');
      return;
    }
    const targetIso = dateOnlyToISO(csvBatchFirstContactDate.trim());
    setCsvBatchUpdating(true);
    try {
      // Find the most recent imported_at for this filename.
      const { data: latest, error: latestErr } = await supabase
        .from('leads')
        .select('enrichment_data')
        .eq('user_id', user.id)
        .contains('enrichment_data', { import: { source: 'csv', filename } } as never)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (latestErr) throw latestErr;
      const importedAts = (latest ?? [])
        .map(
          (r) =>
            (r as { enrichment_data?: { import?: { imported_at?: string } } })?.enrichment_data?.import?.imported_at
        )
        .filter((x): x is string => Boolean(x))
        .map((x) => new Date(x).getTime())
        .filter((t) => Number.isFinite(t));
      const newest = importedAts.length ? Math.max(...importedAts) : null;
      // If we can't read imported_at (older rows), fall back to "all rows with this filename".
      const start = newest != null ? new Date(newest - 15 * 60_000).toISOString() : null;
      const end = newest != null ? new Date(newest + 15 * 60_000).toISOString() : null;

      let q = supabase
        .from('leads')
        .update({ first_contacted_at: targetIso } as never)
        .eq('user_id', user.id)
        .contains('enrichment_data', { import: { source: 'csv', filename } } as never);
      if (start && end) {
        // Narrow to the latest batch window.
        // Note: we store imported_at inside JSON; if DB doesn't support JSON path filters here,
        // we still update all rows with filename (safe enough for a per-day export).
        // Keep this best-effort without hard failing.
        // (No-op filters if server rejects them.)
        try {
          type Q = typeof q;
          q = (q as Q & { gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q })
            .gte('enrichment_data->import->>imported_at', start)
            .lte('enrichment_data->import->>imported_at', end);
        } catch {
          // ignore
        }
      }
      const { error: updErr } = await q;
      if (updErr) throw updErr;

      setCsvImportSummary(`Updated first contact date to ${csvBatchFirstContactDate} for last CSV import (${filename}).`);
      await refreshLeads();
    } catch (err) {
      setCsvBatchUpdateError(err instanceof Error ? err.message : 'Batch update failed');
    } finally {
      setCsvBatchUpdating(false);
    }
  }, [csvBatchFirstContactDate, lastCsvFilename, refreshLeads]);

  const handleEnrichWithPersonas = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setPersonaEnrichError(null);
    setPersonaEnriching(true);
    try {
      const result = await enrichLeadsWithPersonas(ids);
      if (result.ok) {
        await refreshLeads();
        await refreshTasks();
        clearSelection();
      } else {
        setPersonaEnrichError(result.error ?? 'Enrichment failed');
      }
    } catch (err) {
      setPersonaEnrichError(err instanceof Error ? err.message : 'Enrichment failed');
    } finally {
      setPersonaEnriching(false);
    }
  }, [selectedIds, refreshLeads, refreshTasks, clearSelection]);

  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected lead(s)?`)) return;
    try {
      await deleteLeads(ids);
      await refreshLeads();
      clearSelection();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [selectedIds, deleteLeads, refreshLeads, clearSelection]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status?.length) count++;
    if (filters.source?.length) count++;
    if (filters.company_size?.length) count++;
    if (filters.industry?.length) count++;
    if (filters.has_email !== undefined) count++;
    if (filters.has_linkedin !== undefined) count++;
    if (filters.score_min !== undefined || filters.score_max !== undefined) count++;
    if (filters.search) count++;
    if (filters.tags?.length) count++;
    if (filters.saved_search_id) count++;
    if (filters.view_by && filters.view_by !== 'both') count++;
    if (filters.channel?.length) count++;
    if (filters.assignee?.length) count++;
    if (filters.first_contacted_from || filters.first_contacted_to) count++;
    if (filters.marked_as_lead_only !== undefined) count++;
    return count;
  }, [filters]);

  const handleRecomputeScores = useCallback(async () => {
    setRecomputingScores(true);
    try {
      await recomputeLeadScores();
      await refreshLeads();
    } finally {
      setRecomputingScores(false);
    }
  }, [refreshLeads]);

  // Persist CRM preferences when view or filters change (remember when switching tabs)
  useEffect(() => {
    setCRMPreferences({
      viewMode,
      marked_as_lead_only: filters.marked_as_lead_only,
      view_by: filters.view_by ?? 'both',
    });
  }, [viewMode, filters.marked_as_lead_only, filters.view_by]);
  const { displayLeads, groupSizeByLeadId } = useMemo(
    () => getDisplayLeadsForView(leads, filters.view_by ?? 'both'),
    [leads, filters.view_by]
  );

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) {
      const a = (l.assignee ?? '').trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const activeAssignee = filters.assignee?.length === 1 ? (filters.assignee[0] ?? '') : '';

  const countForAssignee = useCallback(
    (assignee: string) => {
      const a = (assignee ?? '').trim();
      return leads.filter((l) => !a || (l.assignee ?? '').trim() === a).length;
    },
    [leads]
  );

  const countStageForAssignee = useCallback(
    (status: LeadStatus, assignee: string) => {
      const a = (assignee ?? '').trim();
      return leads.filter((l) => l.status === status && (!a || (l.assignee ?? '').trim() === a)).length;
    },
    [leads]
  );

  if (error) {
    const isNotConfigured = error.includes('Configure Supabase') || error.includes('VITE_SUPABASE');
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-lg font-semibold text-vloom-text mb-4">CRM</h1>
        <div className="bg-vloom-surface border border-vloom-border rounded-lg p-4 text-vloom-muted text-sm space-y-2">
          <p>{error}</p>
          {isNotConfigured && <p className="text-xs mt-2">{SUPABASE_CONFIG_HINT}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)]">
      {/* Assignee tabs (Lovable-style) */}
      <div className="flex items-center border-b border-border bg-card/80 px-4 pt-3 gap-1 flex-shrink-0 overflow-x-auto">
        <button
          type="button"
          onClick={() => updateFilter('assignee', undefined)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            !filters.assignee?.length
              ? 'border-primary text-foreground bg-secondary/50'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30'
          }`}
        >
          Todos
          <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
            {countForAssignee('')}
          </span>
        </button>
        {assigneeOptions.map((a) => {
          const isActive = filters.assignee?.length === 1 && filters.assignee[0] === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => updateFilter('assignee', [a])}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-foreground bg-secondary/50'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/30'
              }`}
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-primary/20 text-primary">
                {a.trim().charAt(0).toUpperCase()}
              </div>
              {a}
              <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">
                {countForAssignee(a)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats Bar (all stages) */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-secondary/30 flex-shrink-0 overflow-x-auto">
        {([
          { id: 'backlog', label: 'Backlog', dot: 'bg-stage-backlog' },
          { id: 'not_contacted', label: 'Not contacted', dot: 'bg-stage-not-contacted' },
          { id: 'invite_sent', label: 'First contact', dot: 'bg-stage-first-contact' },
          { id: 'connected', label: 'Connected', dot: 'bg-stage-connected' },
          { id: 'reply', label: 'Reply', dot: 'bg-stage-reply' },
          { id: 'positive_reply', label: 'Positive reply', dot: 'bg-stage-positive-reply' },
          { id: 'negotiation', label: 'Negotiation', dot: 'bg-stage-negotiation' },
          { id: 'closed', label: 'Closed', dot: 'bg-stage-closed' },
          { id: 'lost', label: 'Lost', dot: 'bg-stage-lost' },
          { id: 'disqualified', label: 'Disqualified', dot: 'bg-stage-disqualified' },
        ] as const).map((s) => (
          <div
            key={s.id}
            className="w-44 h-16 flex items-center gap-2 px-3 py-2 bg-card rounded-lg border border-border flex-shrink-0"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className="text-lg font-bold text-foreground">
                {countStageForAssignee(s.id as LeadStatus, activeAssignee)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
        <div className="flex items-center bg-secondary rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Columns className="w-4 h-4" /> Kanban
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> Grid
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-foreground">
          <span className="text-muted-foreground">Sort:</span>
          <select
            value={
              sort.column === 'first_contacted_at'
                ? 'first_contacted'
                : sort.column === 'updated_at'
                  ? 'last_contacted'
                  : 'date_az'
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'date_az') setSort({ column: 'created_at', direction: 'asc' });
              else if (v === 'last_contacted') setSort({ column: 'updated_at', direction: 'desc' });
              else setSort({ column: 'first_contacted_at', direction: 'desc' });
            }}
            className="px-2 py-1.5 rounded-lg border border-border bg-secondary text-foreground text-xs"
          >
            <option value="date_az">Date (A–Z)</option>
            <option value="last_contacted">Last contacted</option>
            <option value="first_contacted">First contacted</option>
          </select>
        </label>

        <button
          type="button"
          onClick={handleRecomputeScores}
          disabled={recomputingScores}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {recomputingScores ? 'Recalculating…' : 'Recalculate scores'}
        </button>

        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-xs cursor-pointer hover:bg-secondary/30">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportCsv(f);
              e.currentTarget.value = '';
            }}
            disabled={csvImporting}
          />
          {csvImporting ? 'Importing…' : 'Import CSV'}
        </label>
        <button
          type="button"
          onClick={() => setAddLeadOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add lead
        </button>

        <span className="text-xs text-muted-foreground">
          {viewMode === 'kanban' ? leads.length : displayLeads.length}{' '}
          {viewMode === 'kanban' ? 'cards' : 'leads'}
        </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-transparent px-3 py-2 shrink-0 ml-auto">
          <span className="text-xs font-medium text-foreground whitespace-nowrap">First contact</span>
          <CrmDateInput
            fieldTone="dark"
            value={filters.first_contacted_from}
            onChange={(v) => updateFilter('first_contacted_from', v)}
            title="First contact from"
            inputClassName="text-xs py-1.5"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <CrmDateInput
            fieldTone="dark"
            value={filters.first_contacted_to}
            onChange={(v) => updateFilter('first_contacted_to', v)}
            title="First contact to"
            inputClassName="text-xs py-1.5"
          />
          {(filters.first_contacted_from || filters.first_contacted_to) && (
            <button
              type="button"
              onClick={() => {
                updateFilter('first_contacted_from', undefined);
                updateFilter('first_contacted_to', undefined);
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Clear first contact filter"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {(csvImportError || csvImportSummary || csvBatchUpdateError) && (
          <div className="mb-4 text-sm rounded-lg px-3 py-2 border flex items-center justify-between gap-3 border-border bg-card text-muted-foreground">
            <span className={(csvImportError || csvBatchUpdateError) ? 'text-red-400' : 'text-muted-foreground'}>
              {csvImportError ?? csvBatchUpdateError ?? csvImportSummary}
            </span>
            <button
              type="button"
              onClick={() => {
                setCsvImportError(null);
                setCsvBatchUpdateError(null);
                setCsvImportSummary(null);
              }}
              className="p-1 rounded hover:bg-secondary/30"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {lastCsvFilename && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2">
            <div className="text-xs text-muted-foreground">
              Last CSV: <span className="text-foreground font-medium">{lastCsvFilename}</span>
              {lastCsvImportedAt ? <span className="ml-2 opacity-80">({new Date(lastCsvImportedAt).toLocaleString()})</span> : null}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs text-muted-foreground">Set first contact to</label>
              <input
                type="date"
                value={csvBatchFirstContactDate}
                onChange={(e) => setCsvBatchFirstContactDate(e.target.value)}
                className="px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-xs"
              />
              <button
                type="button"
                onClick={() => void handleSetFirstContactForLastCsv()}
                disabled={csvBatchUpdating}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
              >
                {csvBatchUpdating ? 'Updating…' : 'Apply'}
              </button>
            </div>
          </div>
        )}

        <div className="mb-4">
          {selectedIds.size > 0 && (
            <div className="mb-3 bg-card rounded-xl border border-border p-3 flex flex-wrap items-center gap-3">
              <div className="text-xs text-muted-foreground">Bulk edit ({selectedIds.size} selected)</div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <span className="text-muted-foreground">Status:</span>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as LeadStatus)}
                  className="px-2 py-1.5 rounded-lg border border-border bg-secondary text-foreground text-xs"
                >
                  <option value="backlog">Backlog</option>
                  <option value="not_contacted">Not contacted</option>
                  <option value="invite_sent">First contact</option>
                  <option value="connected">Connected</option>
                  <option value="reply">Reply</option>
                  <option value="positive_reply">Positive reply</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="closed">Closed</option>
                  <option value="lost">Lost</option>
                  <option value="disqualified">Disqualified</option>
                </select>
              </label>
              <button
                type="button"
                disabled={!supabase}
                onClick={async () => {
                  if (!supabase) return;
                  const ids = Array.from(selectedIds);
                  if (!ids.length) return;
                  const { error: bulkErr } = await supabase
                    .from('leads')
                    .update({ status: bulkStatus } as never)
                    .in('id', ids);
                  if (bulkErr) throw bulkErr;
                  await refreshLeads();
                  clearSelection();
                }}
                className="px-3 py-2 rounded-lg border border-border bg-secondary text-foreground text-xs font-medium hover:bg-secondary/70 disabled:opacity-50"
              >
                Move
              </button>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <span className="text-muted-foreground">Assignee:</span>
                <select
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-border bg-secondary text-foreground text-xs"
                >
                  <option value="">Unassigned</option>
                  {ASSIGNEE_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!supabase}
                onClick={async () => {
                  if (!supabase) return;
                  const ids = Array.from(selectedIds);
                  if (!ids.length) return;
                  const v = bulkAssignee.trim() || null;
                  const { error: bulkErr } = await supabase
                    .from('leads')
                    .update({ assignee: v } as never)
                    .in('id', ids);
                  if (bulkErr) throw bulkErr;
                  await refreshLeads();
                  setBulkAssignee('');
                }}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
              >
                Apply assignee
              </button>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <span className="text-muted-foreground">First contact:</span>
                <input
                  type="date"
                  value={bulkFirstContactDate}
                  onChange={(e) => setBulkFirstContactDate(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-border bg-secondary text-foreground text-xs"
                />
              </label>
              <button
                type="button"
                disabled={!bulkFirstContactDate || !supabase}
                onClick={async () => {
                  if (!supabase) return;
                  const ids = Array.from(selectedIds);
                  if (!ids.length) return;
                  const iso = bulkFirstContactDate.trim() ? dateOnlyToISO(bulkFirstContactDate.trim()) : null;
                  const { error: bulkErr } = await supabase
                    .from('leads')
                    .update({ first_contacted_at: iso } as never)
                    .in('id', ids);
                  if (bulkErr) throw bulkErr;
                  await refreshLeads();
                  setBulkFirstContactDate('');
                }}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="ml-auto px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              >
                Clear selection
              </button>
            </div>
          )}
          <FilterBar
            filters={filters}
            onFilterChange={updateFilter}
            onClearFilters={() => {
              updateFilter('status', undefined);
              updateFilter('source', undefined);
              updateFilter('company_size', undefined);
              updateFilter('industry', undefined);
              updateFilter('has_email', undefined);
              updateFilter('has_linkedin', undefined);
              updateFilter('score_min', undefined);
              updateFilter('score_max', undefined);
              // Keep search as-is (toolbar controls it)
              updateFilter('tags', undefined);
              updateFilter('saved_search_id', undefined);
              updateFilter('channel', undefined);
              updateFilter('assignee', undefined);
              updateFilter('first_contacted_from', undefined);
              updateFilter('first_contacted_to', undefined);
              updateFilter('marked_as_lead_only', undefined);
              updateFilter('view_by', 'both');
            }}
            activeFilterCount={activeFilterCount}
          />
        </div>

        {/* Sort + Recalculate are in the top toolbar now */}

      {personaEnrichError && (
        <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{personaEnrichError}</span>
          <button type="button" onClick={() => setPersonaEnrichError(null)} className="p-1 rounded hover:bg-red-500/20">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {viewMode === 'kanban' ? (
        <CRMKanban
          // Always one card per lead: "By companies" only collapses rows in the table, not pipeline stages.
          leads={leads}
          isLoading={isLoading}
          onStatusChange={updateLeadStatus}
          onUpdateLead={(id, updates) => updateLead(id, updates)}
          onOpenLead={(lead) => setSelectedLead(lead)}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
        />
      ) : (
        <LeadsTable
          leads={displayLeads}
          isLoading={isLoading}
          sort={sort}
          onSortChange={setSort}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          isAllSelected={isAllSelected}
          onGenerateEmail={() => {}}
          onSendEmail={() => {}}
          onEnrich={() => {}}
          onDelete={(lead) => deleteLeads([lead.id])}
          onStatusChange={(lead, status) => updateLeadStatus(lead.id, status)}
          onToggleShare={() => {}}
          onViewDetails={(lead) => setSelectedLead(lead)}
          onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
          groupSizeByLeadId={groupSizeByLeadId}
          selectionAction={
            selectedIds.size > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleEnrichWithPersonas}
                  disabled={personaEnriching}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-vloom-accent/50 text-vloom-accent hover:bg-vloom-accent/10 text-sm font-medium disabled:opacity-50"
                >
                  {personaEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                  Enrich with personas ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete selected
                </button>
              </div>
            ) : undefined
          }
        />
      )}

      </div>

      {addLeadOpen && (
        <AddLeadModal
          onClose={() => setAddLeadOpen(false)}
          onCreate={createLead}
          onCreated={(lead) => setSelectedLead(lead)}
        />
      )}

      {selectedLead && (
        <LeadCardPopup
          lead={selectedLead}
          tasksForLead={tasks.filter((t) => t.lead_id === selectedLead.id)}
          onClose={() => setSelectedLead(null)}
          onUpdateLead={(id, updates) => updateLead(id, updates)}
          onUpdateLeadStatus={updateLeadStatus}
          onUpdateTaskStatus={updateTaskStatus}
          onUpdateTaskTitle={updateTaskTitle}
          onDeleteTask={deleteTask}
          onCreateTask={createTask}
          onRefreshTasks={refreshTasks}
        />
      )}
    </div>
  );
}