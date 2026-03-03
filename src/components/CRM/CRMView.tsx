// =====================================================
// Leadflow Vloom - CRM view (Kanban + Tabla + useLeads)
// =====================================================
import { useState, useMemo, useEffect, useCallback } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { recomputeLeadScores } from '@/lib/apify';
import { useLeads } from '@/hooks/useLeads';
import { useTasks } from '@/hooks/useTasks';
import { SUPABASE_CONFIG_HINT } from '@/lib/supabase';
import { getDisplayLeadsForView } from '@/lib/leadViewUtils';
import type { Lead, LeadViewBy } from '@/types/database';
import { CRMKanban } from './CRMKanban';
import { LeadsTable } from '@/components/LeadsTable';
import { FilterBar } from '@/components/FilterBar';
import { LeadCardPopup } from './LeadCardPopup';

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
    if (!raw) return { viewMode: 'table' };
    const parsed = JSON.parse(raw) as Partial<CRMPreferences>;
    return {
      viewMode: parsed.viewMode === 'kanban' ? 'kanban' : 'table',
      marked_as_lead_only: parsed.marked_as_lead_only === true ? true : undefined,
      view_by: parsed.view_by === 'company' ? 'company' : 'person',
    };
  } catch {
    return { viewMode: 'table' };
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

export function CRMView() {
  const [initialPrefs] = useState(() => getCRMPreferences());

  const {
    leads,
    isLoading,
    error,
    updateLeadStatus,
    updateLead,
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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const { tasks, updateTaskStatus, updateTaskTitle, deleteTask, createTask, refreshTasks } = useTasks();

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
    if (filters.marked_as_lead_only === true) count++;
    if (filters.view_by) count++;
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
          <label className="flex items-center gap-2 text-sm text-vloom-text cursor-pointer">
            <input
              type="checkbox"
              checked={filters.marked_as_lead_only === true}
              onChange={(e) => updateFilter('marked_as_lead_only', e.target.checked ? true : undefined)}
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
            updateFilter('marked_as_lead_only', filters.marked_as_lead_only);
          }}
          activeFilterCount={activeFilterCount}
        />
      </div>

      {viewMode === 'kanban' ? (
        <CRMKanban
          leads={displayLeads}
          isLoading={isLoading}
          onStatusChange={updateLeadStatus}
          onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
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
          onDelete={() => {}}
          onStatusChange={(lead, status) => updateLeadStatus(lead.id, status)}
          onToggleShare={() => {}}
          onViewDetails={(lead) => setSelectedLead(lead)}
          onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
          groupSizeByLeadId={groupSizeByLeadId}
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
