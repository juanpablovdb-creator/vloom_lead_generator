// =====================================================
// Vloom Lead Generator - CRM view (Kanban + Tabla + useLeads)
// =====================================================
import { useState, useMemo } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { useLeads } from '@/hooks/useLeads';
import { getDisplayLeadsForView } from '@/lib/leadViewUtils';
import type { LeadViewBy } from '@/types/database';
import { CRMKanban } from './CRMKanban';
import { LeadsTable } from '@/components/LeadsTable';

type CRMViewMode = 'kanban' | 'table';

export function CRMView() {
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
  } = useLeads({
    pageSize: 500,
    initialFilters: {},
  });

  const [viewMode, setViewMode] = useState<CRMViewMode>('table');
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
          {isNotConfigured && (
            <p className="text-xs mt-2">
              Add <code className="bg-vloom-border px-1 rounded">VITE_SUPABASE_URL</code> and{' '}
              <code className="bg-vloom-border px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your <code className="bg-vloom-border px-1 rounded">.env</code> file.
            </p>
          )}
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
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <CRMKanban
          leads={displayLeads}
          isLoading={isLoading}
          onStatusChange={updateLeadStatus}
          onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
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
          onViewDetails={() => {}}
          onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
          groupSizeByLeadId={groupSizeByLeadId}
        />
      )}
    </div>
  );
}
