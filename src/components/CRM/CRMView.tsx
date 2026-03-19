// =====================================================
// Leadflow Vloom - CRM view (Kanban + Tabla + useLeads)
// =====================================================
import { useState, useMemo, useEffect, useCallback } from 'react';
import { LayoutGrid, List, Plus, X, Target, Trash2, Loader2 } from 'lucide-react';
import { recomputeLeadScores, enrichLeadsWithPersonas } from '@/lib/apify';
import { useLeads, type CreateLeadInput } from '@/hooks/useLeads';
import { useTasks } from '@/hooks/useTasks';
import { SUPABASE_CONFIG_HINT } from '@/lib/supabase';
import { getDisplayLeadsForView } from '@/lib/leadViewUtils';
import type { Lead, LeadViewBy } from '@/types/database';
import { CRMKanban } from './CRMKanban';
import { LeadsTable } from '@/components/LeadsTable';
import { FilterBar } from '@/components/FilterBar';
import { LeadCardPopup } from './LeadCardPopup';

const CHANNEL_OPTIONS = [
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'LinkedIn Job Post', label: 'LinkedIn Job Post' },
  { value: 'LinkedIn Post Feeds', label: 'LinkedIn Post Feeds' },
  { value: 'Website', label: 'Website' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Event', label: 'Event' },
  { value: 'Cold outreach', label: 'Cold outreach' },
  { value: 'Email', label: 'Email' },
  { value: 'Youtube Jobs', label: 'Youtube Jobs' },
  { value: 'Other', label: 'Other' },
];

/** Parse YYYY-MM-DD (date input) as local noon → ISO for DB (avoids UTC shift). */
function dateOnlyToISO(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
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
    if (!raw) return { viewMode: 'table', marked_as_lead_only: true, view_by: 'person' };
    const parsed = JSON.parse(raw) as Partial<CRMPreferences>;
    return {
      viewMode: parsed.viewMode === 'kanban' ? 'kanban' : 'table',
      // Default ON so CRM matches Discovery → Leads: only pipeline leads (avoids paging out
      // newly marked rows when unmarked search results fill the first 500 rows by score).
      marked_as_lead_only: parsed.marked_as_lead_only === false ? false : true,
      view_by: parsed.view_by === 'company' ? 'company' : 'person',
    };
  } catch {
    return { viewMode: 'table', marked_as_lead_only: true, view_by: 'person' };
  }
}

function setCRMPreferences(prefs: Partial<CRMPreferences>) {
  try {
    const prev = getCRMPreferences();
    const next = { ...prev, ...prefs };
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
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
    refreshLeads,
  } = useLeads({
    pageSize: 500,
    initialFilters: {
      marked_as_lead_only: initialPrefs.marked_as_lead_only,
      view_by: initialPrefs.view_by,
    },
  });

  const [viewMode, setViewMode] = useState<CRMViewMode>(() => initialPrefs.viewMode);
  const [recomputingScores, setRecomputingScores] = useState(false);
  const [personaEnriching, setPersonaEnriching] = useState(false);
  const [personaEnrichError, setPersonaEnrichError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const { tasks, updateTaskStatus, updateTaskTitle, deleteTask, createTask, refreshTasks } = useTasks();

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
    if (filters.view_by) count++;
    if (filters.channel?.length) count++;
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
      view_by: filters.view_by,
    });
  }, [viewMode, filters.marked_as_lead_only, filters.view_by]);
  const { displayLeads, groupSizeByLeadId } = useMemo(
    () => getDisplayLeadsForView(leads, filters.view_by),
    [leads, filters.view_by]
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
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-lg font-semibold text-vloom-text">CRM</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setAddLeadOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-vloom-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Add lead
          </button>
          <label className="flex items-center gap-2 text-sm text-vloom-text cursor-pointer">
            <input
              type="checkbox"
              checked={filters.marked_as_lead_only !== false}
              onChange={(e) => updateFilter('marked_as_lead_only', e.target.checked)}
              className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent"
            />
            Marked leads only
          </label>
          <div className="flex rounded-lg border border-vloom-border overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-vloom-accent text-white' : 'bg-vloom-surface text-vloom-text hover:bg-vloom-border/30'}`}
              title="Table view"
            >
              <List className="w-4 h-4" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${viewMode === 'kanban' ? 'bg-vloom-accent text-white' : 'bg-vloom-surface text-vloom-text hover:bg-vloom-border/30'}`}
              title="Kanban view"
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </button>
          </div>
          <div className="flex rounded-lg border border-vloom-border overflow-hidden">
            <button
              type="button"
              onClick={() => updateFilter('view_by', 'person' as LeadViewBy)}
              className={`px-3 py-2 text-sm ${filters.view_by !== 'company' ? 'bg-vloom-accent/10 text-vloom-accent font-medium' : 'bg-vloom-surface text-vloom-text hover:bg-vloom-border/30'}`}
            >
              By people
            </button>
            <button
              type="button"
              onClick={() => updateFilter('view_by', 'company' as LeadViewBy)}
              className={`px-3 py-2 text-sm ${filters.view_by === 'company' ? 'bg-vloom-accent/10 text-vloom-accent font-medium' : 'bg-vloom-surface text-vloom-text hover:bg-vloom-border/30'}`}
            >
              By companies
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-vloom-text">
            <span className="text-vloom-muted">Sort:</span>
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
              className="px-2 py-1.5 rounded-lg border border-vloom-border bg-vloom-bg text-vloom-text text-sm"
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
            className="text-sm text-vloom-muted hover:text-vloom-text disabled:opacity-50"
          >
            {recomputingScores ? 'Recalculating…' : 'Recalculate scores'}
          </button>
        </div>
      </div>

      <div className="mb-4">
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
            updateFilter('search', undefined);
            updateFilter('tags', undefined);
            updateFilter('saved_search_id', undefined);
            updateFilter('channel', undefined);
            updateFilter('marked_as_lead_only', filters.marked_as_lead_only);
          }}
          activeFilterCount={activeFilterCount}
        />
      </div>

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
          leads={displayLeads}
          isLoading={isLoading}
          onStatusChange={updateLeadStatus}
          onUpdateLead={(id, updates) => updateLead(id, updates)}
          onOpenLead={(lead) => setSelectedLead(lead)}
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