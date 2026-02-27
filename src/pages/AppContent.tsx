// =====================================================
// Leadflow Vloom - Main app content (sidebar + section views)
// =====================================================
import { useState, useCallback } from 'react';
import { AppLayout } from '@/components/Layout';
import type { SectionId, DiscoverySubId } from '@/components/Layout';
import { HomePage, LeadSource } from '@/pages/HomePage';
import { SearchConfigPage } from '@/pages/SearchConfigPage';
import { CRMView } from '@/components/CRM';
import { TasksView } from '@/components/TasksView';
import { LeadsTable } from '@/components/LeadsTable';
import { runJobSearchViaEdge, recomputeLeadScores } from '@/lib/apify';
import { SavedSearchesView } from '@/components/SavedSearchesView';
import { useSavedSearches } from '@/hooks/useSavedSearches';
import { useLeads } from '@/hooks/useLeads';

type View = 'app' | 'search-config';

type LastSearchResult =
  | { ok: true; scrapingJobId: string; imported: number; skipped: number; totalFromApify: number }
  | { ok: false; error: string }
  | null;

export interface AppContentProps {
  userEmail?: string | null;
  onSignOut?: () => void;
}

export function AppContent({ userEmail, onSignOut }: AppContentProps = {}) {
  const [section, setSection] = useState<SectionId>('discovery');
  const [discoverySub, setDiscoverySub] = useState<DiscoverySubId>('new-search');
  const [view, setView] = useState<View>('app');
  const [selectedSource, setSelectedSource] = useState<LeadSource | null>(null);
  const [lastSearchResult, setLastSearchResult] = useState<LastSearchResult>(null);
  const { createSavedSearch } = useSavedSearches();

  const handleNavigate = useCallback((s: SectionId, sub?: DiscoverySubId) => {
    setSection(s);
    if (s === 'discovery') {
      setDiscoverySub(sub ?? 'new-search');
      // Show section content (e.g. Saved searches) instead of staying on Search config
      setView('app');
    }
  }, []);

  const handleSelectSource = useCallback((source: LeadSource) => {
    setSelectedSource(source);
    setView('search-config');
  }, []);

  const handleBackFromSearchConfig = useCallback(() => {
    setSelectedSource(null);
    setLastSearchResult(null);
    setView('app');
  }, []);

  const handleSearch = useCallback(async (source: LeadSource, params: Record<string, unknown>) => {
    try {
      const result = await runJobSearchViaEdge({
        actorId: source.apifyActorId,
        input: params,
      });
      setLastSearchResult({
        ok: true,
        scrapingJobId: result.scrapingJobId,
        imported: result.imported,
        skipped: result.skipped,
        totalFromApify: result.totalFromApify,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err);
      const errStr = typeof msg === 'string' ? msg : String(err);
      const isSchemaCache = /team_id|schema cache|could not find.*column/i.test(errStr);
      const schemaHint =
        isSchemaCache
          ? "\n\n---\n1) Pause project then Restore (Project Settings → General). Wait 2–3 min until STATUS is stable. 2) In SQL Editor run the script: supabase/migrations/009_ensure_no_team_id_reload_schema.sql. Wait 30–60 sec, then try again."
          : "";
      setLastSearchResult({
        ok: false,
        error: errStr + schemaHint,
      });
    }
  }, []);

  // Always show sidebar; search config opens inside main content
  return (
    <AppLayout
      activeSection={section}
      activeDiscoverySub={discoverySub}
      onNavigate={handleNavigate}
      userEmail={userEmail}
      onSignOut={onSignOut}
    >
      {view === 'search-config' && selectedSource ? (
        <SearchConfigPage
          source={selectedSource}
          onBack={handleBackFromSearchConfig}
          onSearch={handleSearch}
          lastSearchResult={lastSearchResult}
          onDismissResult={() => setLastSearchResult(null)}
          onSaveSearch={createSavedSearch}
        />
      ) : (
        <>
      {section === 'tasks' && (
        <TasksView onNavigateToLead={() => setSection('crm')} />
      )}
      {section === 'discovery' && discoverySub === 'new-search' && (
        <DiscoveryNewSearchPlaceholder onSelectSource={handleSelectSource} />
      )}
      {section === 'discovery' && discoverySub === 'saved-searches' && (
        <SavedSearchesView
          onRunComplete={(result) => {
            setLastSearchResult({
              ok: true,
              scrapingJobId: result.scrapingJobId,
              imported: result.imported,
              skipped: result.skipped,
              totalFromApify: result.totalFromApify,
            });
            setSection('discovery');
            setDiscoverySub('leads-lists');
          }}
          onRunError={(message) => {
            setLastSearchResult({ ok: false, error: message });
            setSection('discovery');
            setDiscoverySub('leads-lists');
          }}
        />
      )}
      {section === 'discovery' && discoverySub === 'leads-lists' && (
        <LeadsListView lastSearchResult={lastSearchResult} onDismissResult={() => setLastSearchResult(null)} />
      )}
      {section === 'crm' && <CRMView />}
      {section === 'kpis' && <KPIsPlaceholder />}
        </>
      )}
    </AppLayout>
  );
}

function DiscoveryNewSearchPlaceholder({ onSelectSource }: { onSelectSource: (s: LeadSource) => void }) {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">New Search</h1>
      <HomePage onSelectSource={onSelectSource} embedded />
    </div>
  );
}

function LeadsListView({
  lastSearchResult,
  onDismissResult,
}: {
  lastSearchResult: LastSearchResult;
  onDismissResult: () => void;
}) {
  const {
    leads,
    totalCount,
    isLoading,
    error,
    filters,
    updateFilter,
    sort,
    setSort,
    pagination,
    setPage,
    refreshLeads,
    updateLead,
    updateLeadStatus,
    deleteLead,
    deleteLeads,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
  } = useLeads({
    initialFilters: { marked_as_lead_only: true },
    pageSize: 25,
  });

  const [recomputingScores, setRecomputingScores] = useState(false);
  const handleRecomputeScores = useCallback(async () => {
    setRecomputingScores(true);
    try {
      await recomputeLeadScores();
      await refreshLeads();
    } finally {
      setRecomputingScores(false);
    }
  }, [refreshLeads]);

  const noop = () => {};
  const handleDeleteLead = useCallback(
    async (lead: { id: string }) => {
      await deleteLead(lead.id);
    },
    [deleteLead]
  );
  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await deleteLeads(ids);
    clearSelection();
  }, [selectedIds, deleteLeads, clearSelection]);

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-lg font-semibold text-vloom-text mb-4">Leads</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 p-4 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-lg font-semibold text-vloom-text">Leads</h1>
        <label className="flex items-center gap-2 text-sm text-vloom-text cursor-pointer">
          <input
            type="checkbox"
            checked={filters.marked_as_lead_only === true}
            onChange={(e) => updateFilter('marked_as_lead_only', e.target.checked ? true : undefined)}
            className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent"
          />
          Marked leads only
        </label>
      </div>

      {lastSearchResult && (
        <div
          className={`mb-4 rounded-lg border p-4 text-sm ${
            lastSearchResult.ok
              ? 'border-green-200 bg-green-50 dark:bg-green-500/10 text-green-800 dark:text-green-200'
              : 'border-red-200 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-200'
          }`}
        >
          {lastSearchResult.ok ? (
            <>
              <p className="font-medium">Search finished.</p>
              <p className="mt-1">
                {lastSearchResult.imported} new jobs imported, {lastSearchResult.skipped} already in your list (not
                re-enriched). Total from Apify: {lastSearchResult.totalFromApify}.
              </p>
            </>
          ) : (
            <p>{lastSearchResult.error}</p>
          )}
          <button
            type="button"
            onClick={onDismissResult}
            className="mt-2 text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="rounded-xl border border-vloom-border bg-vloom-surface overflow-hidden">
        <div className="p-3 border-b border-vloom-border flex items-center justify-between">
          <span className="text-sm font-medium text-vloom-text">
            {totalCount} lead{totalCount !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRecomputeScores}
              disabled={recomputingScores}
              className="text-xs text-vloom-muted hover:text-vloom-text disabled:opacity-50"
            >
              {recomputingScores ? 'Recalculating…' : 'Recalculate scores'}
            </button>
            <span className="text-vloom-muted">·</span>
            <button
              type="button"
              onClick={() => refreshLeads()}
              className="text-xs text-vloom-muted hover:text-vloom-text"
            >
              Refresh
            </button>
          </div>
        </div>
        <LeadsTable
          leads={leads}
          isLoading={isLoading}
          sort={sort}
          onSortChange={setSort}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          isAllSelected={isAllSelected}
          onGenerateEmail={noop}
          onSendEmail={noop}
          onEnrich={noop}
          onDelete={(lead) => handleDeleteLead(lead)}
          onStatusChange={(lead, status) => updateLeadStatus(lead.id, status)}
          onToggleShare={noop}
          onViewDetails={noop}
          onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
          selectionAction={
            selectedIds.size > 0 ? (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-medium"
              >
                Delete selected ({selectedIds.size})
              </button>
            ) : undefined
          }
        />
        {totalCount > pagination.pageSize && (
          <div className="p-3 border-t border-vloom-border flex items-center justify-between text-sm text-vloom-muted">
            <span>
              Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
              {Math.min(pagination.page * pagination.pageSize, totalCount)} of {totalCount}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-2 py-1 rounded hover:bg-vloom-border disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-2 py-1 bg-vloom-border rounded">{pagination.page}</span>
              <button
                type="button"
                onClick={() => setPage(pagination.page + 1)}
                disabled={pagination.page * pagination.pageSize >= totalCount}
                className="px-2 py-1 rounded hover:bg-vloom-border disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KPIsPlaceholder() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">KPIs</h1>
      <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
        Coming soon
      </div>
    </div>
  );
}
