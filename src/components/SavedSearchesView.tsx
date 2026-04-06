// =====================================================
// Leadflow Vloom - Saved searches list + Run + View outputs
// =====================================================
import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Loader2, Trash2, ArrowLeft, List, Pencil, Check, X } from 'lucide-react';
import { useSavedSearches } from '@/hooks/useSavedSearches';
import { useLeads } from '@/hooks/useLeads';
import { LeadsTable } from '@/components/LeadsTable';
import { runJobSearchViaEdge, runLinkedInPostFeedViaEdge, sendSelectedToLeadsAndEnrich, recomputeLeadScores } from '@/lib/apify';
import type { RunLinkedInSearchResult } from '@/lib/apify';
import type { Lead, LeadStatus } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { Send } from 'lucide-react';

const LINKEDIN_ACTOR_ID = 'harvestapi/linkedin-job-search';
const LINKEDIN_POST_FEED_ACTOR_ID = 'harvestapi/linkedin-post-search';
/** Minimum time between automatic re-runs for a saved search (ms). */
const AUTORUN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const NON_DISQUALIFIED_STATUSES: LeadStatus[] = [
  'backlog',
  'not_contacted',
  'invite_sent',
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'closed',
  'lost',
] as const;

export interface SavedSearchesViewProps {
  onRunComplete: (result: RunLinkedInSearchResult) => void;
  onRunError: (message: string) => void;
}

/** Table of leads for a saved search (all runs of that search). */
function SavedSearchResultsTable({
  savedSearchId,
  searchName,
  onBack,
}: {
  savedSearchId: string;
  searchName: string;
  onBack: () => void;
}) {
  const {
    leads,
    totalCount,
    isLoading,
    error,
    sort,
    setSort,
    pagination,
    setPage,
    refreshLeads,
    updateLead,
    updateLeadStatus,
    updateFilter,
    filters,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
  } = useLeads({
    initialFilters: {
      saved_search_id: savedSearchId,
      status: [...NON_DISQUALIFIED_STATUSES],
    },
    pageSize: 500,
  });

  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);

  const isSessionError =
    sendMessage?.type === 'error' &&
    /Session expired|sign in again|Invalid JWT|401|unauthorized/i.test(sendMessage.text);

  const handleRefreshSession = useCallback(async () => {
    if (!supabase) return;
    setRefreshingSession(true);
    try {
      const { error } = await supabase.auth.refreshSession();
      if (!error) setSendMessage(null);
    } finally {
      setRefreshingSession(false);
    }
  }, []);

  const viewingDisqualified = filters.status?.length === 1 && filters.status[0] === 'disqualified';

  const switchToDisqualified = useCallback(() => {
    updateFilter('status', ['disqualified']);
    clearSelection();
  }, [updateFilter, clearSelection]);

  const switchToResults = useCallback(() => {
    updateFilter('status', NON_DISQUALIFIED_STATUSES.length > 0 ? [...NON_DISQUALIFIED_STATUSES] : undefined);
    clearSelection();
  }, [updateFilter, clearSelection]);

  /** Row/cell click toggles selection — same as checkbox (onViewDetails was noop, so clicks did nothing). */
  const handleRowCellActivate = useCallback(
    (lead: Lead) => {
      toggleSelection(lead.id);
    },
    [toggleSelection]
  );

  const handleRestoreSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSendMessage(null);
    setSending(true);
    try {
      await Promise.all(ids.map((id) => updateLeadStatus(id, 'backlog')));
      clearSelection();
      refreshLeads();
      setSendMessage({ type: 'success', text: `${ids.length} lead${ids.length === 1 ? '' : 's'} restored to Backlog.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSendMessage({ type: 'error', text: msg });
    } finally {
      setSending(false);
    }
  }, [selectedIds, clearSelection, refreshLeads, updateLeadStatus]);

  const handleRecomputeScores = useCallback(async () => {
    setSendMessage(null);
    setRecomputing(true);
    try {
      const { updated, total } = await recomputeLeadScores();
      refreshLeads();
      setSendMessage({
        type: 'success',
        text: total === 0 ? 'No leads to recalculate.' : `Scores recalculated: ${updated} of ${total} leads.`,
      });
    } catch (err) {
      setSendMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setRecomputing(false);
    }
  }, [refreshLeads]);

  const handleSendToLeads = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSendMessage(null);
    setSending(true);
    try {
      const { sent, enriched, personaCompaniesProcessed, personaLeadsCreated } = await sendSelectedToLeadsAndEnrich(ids);
      clearSelection();
      refreshLeads();
      const parts = [`${sent} sent to Leads.`, `${enriched} compan${enriched === 1 ? 'y' : 'ies'} enriched with LinkedIn data.`];
      if (personaCompaniesProcessed != null && personaCompaniesProcessed > 0) {
        parts.push(
          `Persona enrichment ran for ${personaCompaniesProcessed} compan${personaCompaniesProcessed === 1 ? 'y' : 'ies'}.`
        );
        if (personaLeadsCreated != null && personaLeadsCreated > 0) {
          parts.push(`${personaLeadsCreated} new contact${personaLeadsCreated === 1 ? '' : 's'} added.`);
        }
      }
      setSendMessage({ type: 'success', text: parts.join(' ') });
    } catch (err) {
      setSendMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSending(false);
    }
  }, [selectedIds, clearSelection, refreshLeads]);

  const handleDisqualifySelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSendMessage(null);
    setSending(true);
    try {
      await Promise.all(ids.map((id) => updateLeadStatus(id, 'disqualified')));
      clearSelection();
      refreshLeads();
      setSendMessage({
        type: 'success',
        text: `${ids.length} lead${ids.length === 1 ? '' : 's'} marked as Disqualified and removed from this list.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === 'object' && err != null && 'message' in err ? String((err as { message: unknown }).message) : String(err));
      setSendMessage({ type: 'error', text: msg });
    } finally {
      setSending(false);
    }
  }, [selectedIds, clearSelection, refreshLeads, updateLeadStatus]);

  const noop = () => {};

  if (error) {
    return (
      <div className="rounded-xl border border-vloom-border bg-vloom-surface p-4 text-sm text-red-600">
        {error}
        <button type="button" onClick={onBack} className="mt-2 block text-xs underline">
          Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-vloom-border bg-vloom-surface overflow-hidden">
      <div className="p-3 border-b border-vloom-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-vloom-muted hover:text-vloom-text"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to list
          </button>
          <span className="text-vloom-muted">·</span>
          <h3 className="text-sm font-medium text-vloom-text">Results for “{searchName}” ({totalCount})</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleRecomputeScores}
            disabled={recomputing}
            className="text-xs text-vloom-muted hover:text-vloom-text disabled:opacity-50"
          >
            {recomputing ? 'Recalculating…' : 'Recalculate scores'}
          </button>
          <span className="text-vloom-muted">·</span>
          <button
            type="button"
            onClick={() => refreshLeads()}
            className="text-xs text-vloom-muted hover:text-vloom-text"
          >
            Refresh
          </button>
          <span className="text-vloom-muted">·</span>
          {viewingDisqualified ? (
            <button
              type="button"
              onClick={switchToResults}
              className="text-xs text-vloom-accent hover:underline"
            >
              Back to results
            </button>
          ) : (
            <button
              type="button"
              onClick={switchToDisqualified}
              className="text-xs text-vloom-muted hover:text-vloom-text"
            >
              Disqualified
            </button>
          )}
        </div>
      </div>

      {viewingDisqualified && selectedIds.size > 0 && (
        <div className="px-3 py-2 border-b border-vloom-border bg-amber-500/10 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-vloom-text">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={handleRestoreSelected}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-vloom-accent text-white text-sm font-medium hover:bg-vloom-accent-hover disabled:opacity-50"
          >
            Restore to Backlog
          </button>
        </div>
      )}

      {!viewingDisqualified && selectedIds.size > 0 && (
        <div className="px-3 py-2 border-b border-vloom-border bg-vloom-accent/10 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-vloom-text">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSendToLeads}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-vloom-accent text-white text-sm font-medium hover:bg-vloom-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send to leads
            </button>
            <button
              type="button"
              onClick={handleDisqualifySelected}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-vloom-border text-sm text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Mark as Disqualified
            </button>
          </div>
        </div>
      )}

      {sendMessage && (
        <div
          className={`px-3 py-2 border-b border-vloom-border text-sm flex flex-col gap-2 ${
            sendMessage.type === 'success'
              ? 'bg-green-500/10 text-green-800 dark:text-green-200'
              : 'bg-red-500/10 text-red-800 dark:text-red-200'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0">
              {typeof sendMessage.text === 'string' ? sendMessage.text : String(sendMessage.text ?? '')}
            </span>
            {isSessionError && (
              <button
                type="button"
                onClick={handleRefreshSession}
                disabled={refreshingSession}
                className="px-2 py-1 rounded bg-amber-200/80 dark:bg-amber-500/30 hover:bg-amber-300/80 dark:hover:bg-amber-500/50 font-medium text-amber-900 dark:text-amber-100 text-xs disabled:opacity-50"
              >
                {refreshingSession ? 'Refreshing…' : 'Refresh session'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSendMessage(null)}
              className="text-xs underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
          {isSessionError && (
            <p className="text-xs opacity-90">
              If refreshing does not fix it, the Supabase gateway may be rejecting the token. Redeploy the enrichment
              functions (this repo includes `verify_jwt = false` in their function config):{' '}
              <code className="bg-black/10 dark:bg-white/10 px-1 rounded block mt-1">
                npx supabase functions deploy enrich-lead-companies
              </code>
              <code className="bg-black/10 dark:bg-white/10 px-1 rounded block mt-0.5">
                npx supabase functions deploy enrich-lead-personas
              </code>
              <span className="block mt-1">
                If you still see <code className="bg-black/10 dark:bg-white/10 px-1 rounded">Invalid JWT</code>, deploy
                with <code className="bg-black/10 dark:bg-white/10 px-1 rounded">--no-verify-jwt</code>.
              </span>
            </p>
          )}
        </div>
      )}

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
        onDelete={noop}
        onStatusChange={(lead, status) => updateLeadStatus(lead.id, status)}
        onToggleShare={noop}
        onViewDetails={handleRowCellActivate}
        onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
        selectionAction={
          selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              {viewingDisqualified ? (
                <button
                  type="button"
                  onClick={handleRestoreSelected}
                  disabled={sending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-vloom-accent text-white text-sm font-medium hover:bg-vloom-accent-hover disabled:opacity-50"
                >
                  Restore to Backlog
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSendToLeads}
                    disabled={sending}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-vloom-accent text-white text-sm font-medium hover:bg-vloom-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Send to leads
                  </button>
                  <button
                    type="button"
                    onClick={handleDisqualifySelected}
                    disabled={sending}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-vloom-border text-sm text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Mark as Disqualified
                  </button>
                </>
              )}
            </div>
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
  );
}

export function SavedSearchesView({ onRunComplete, onRunError }: SavedSearchesViewProps) {
  const { savedSearches, isLoading, error, deleteSavedSearch, updateSavedSearch, refetch } =
    useSavedSearches();
  const [editingSearchId, setEditingSearchId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [viewingSearchId, setViewingSearchId] = useState<string | null>(null);
  /** Prevents overlapping manual Run and background autorun. */
  const runLockRef = useRef(false);

  const handleRun = useCallback(
    async (id: string, actorId: string) => {
      if (runLockRef.current) return;
      runLockRef.current = true;
      setRunningId(id);
      try {
        const result =
          actorId === LINKEDIN_POST_FEED_ACTOR_ID
            ? await runLinkedInPostFeedViaEdge({ savedSearchId: id })
            : await runJobSearchViaEdge({ actorId, savedSearchId: id });
        if (supabase) {
          await supabase
            .from('saved_searches')
            .update({ autorun_last_run_at: new Date().toISOString() } as never)
            .eq('id', id);
          await refetch();
        }
        onRunComplete(result);
      } catch (err) {
        onRunError(err instanceof Error ? err.message : String(err));
      } finally {
        setRunningId(null);
        runLockRef.current = false;
      }
    },
    [onRunComplete, onRunError, refetch]
  );

  // While this view is open: re-run saved searches with Autorun on at most once per cooldown.
  useEffect(() => {
    if (!supabase || isLoading) return;

    const tick = async () => {
      if (runLockRef.current) return;
      const supported = savedSearches.filter(
        (s) => s.actor_id === LINKEDIN_ACTOR_ID || s.actor_id === LINKEDIN_POST_FEED_ACTOR_ID
      );
      const due = supported.filter((s) => {
        if (!s.autorun) return false;
        const last = s.autorun_last_run_at ? new Date(s.autorun_last_run_at).getTime() : 0;
        return Date.now() - last >= AUTORUN_COOLDOWN_MS;
      });
      if (due.length === 0) return;

      for (const s of due) {
        if (runLockRef.current) break;
        runLockRef.current = true;
        setRunningId(s.id);
        try {
          const result =
            s.actor_id === LINKEDIN_POST_FEED_ACTOR_ID
              ? await runLinkedInPostFeedViaEdge({ savedSearchId: s.id })
              : await runJobSearchViaEdge({ actorId: s.actor_id, savedSearchId: s.id });
          await supabase
            .from('saved_searches')
            .update({ autorun_last_run_at: new Date().toISOString() } as never)
            .eq('id', s.id);
          await refetch();
          console.info('[autorun] completed', s.name, 'imported', result.imported);
        } catch (e) {
          console.error('[autorun] failed', s.id, e);
        } finally {
          setRunningId(null);
          runLockRef.current = false;
        }
      }
    };

    void tick();
    const interval = setInterval(tick, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isLoading, savedSearches, refetch]);

  const supportedSearches = savedSearches.filter(
    (s) => s.actor_id === LINKEDIN_ACTOR_ID || s.actor_id === LINKEDIN_POST_FEED_ACTOR_ID
  );
  const otherSearches = savedSearches.filter(
    (s) => s.actor_id !== LINKEDIN_ACTOR_ID && s.actor_id !== LINKEDIN_POST_FEED_ACTOR_ID
  );

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">Saved searches</h1>
      <p className="text-sm text-vloom-muted mb-4">
        Re-run a saved search with one click. Supported: LinkedIn Jobs and LinkedIn Post Feeds (HarvestAPI).
      </p>

      {!supabase && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm mb-4">
          Supabase is not configured. Saved searches require a connected database.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 p-4 text-sm mb-4">{error}</div>
      )}

      {viewingSearchId ? (
        (() => {
          const viewing = supportedSearches.find((s) => s.id === viewingSearchId) ?? otherSearches.find((s) => s.id === viewingSearchId);
          if (!viewing) return null;
          return (
            <SavedSearchResultsTable
              savedSearchId={viewingSearchId}
              searchName={viewing.name}
              onBack={() => setViewingSearchId(null)}
            />
          );
        })()
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-vloom-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading saved searches...
        </div>
      ) : supportedSearches.length === 0 && otherSearches.length === 0 ? (
        <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
          No saved searches yet. Run a search from New Search and it will be saved for later.
        </div>
      ) : (
        <ul className="space-y-2">
          {supportedSearches.map((s) => {
            const jobTitles = (s.input?.jobTitles as string[] | string) ?? [];
            const searchQueries = (s.input?.searchQueries as string[] | string) ?? [];
            const summaryFromJobTitles =
              Array.isArray(jobTitles) ? jobTitles.join(', ') : typeof jobTitles === 'string' ? jobTitles : '';
            const summaryFromQueries =
              Array.isArray(searchQueries) ? searchQueries.join(', ') : typeof searchQueries === 'string' ? searchQueries : '';
            const summary = summaryFromJobTitles || summaryFromQueries;
            const isRunning = runningId === s.id;
            const isEditing = editingSearchId === s.id;
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-4 p-4 rounded-lg border border-vloom-border bg-vloom-surface"
              >
                <div className="min-w-0 flex-1 text-left">
                  {isEditing ? (
                    <div className="font-medium text-vloom-text flex items-center gap-2 flex-wrap">
                      <List className="w-4 h-4 flex-shrink-0 text-vloom-muted" />
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          // Prevent any parent key handlers / accidental "activate button" behavior.
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const name = editingName.trim();
                            if (name) {
                              updateSavedSearch(s.id, { name });
                              setEditingSearchId(null);
                            }
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingSearchId(null);
                            setEditingName('');
                          }
                        }}
                        className="flex-1 min-w-[120px] px-2 py-0.5 rounded border border-vloom-border bg-vloom-bg text-vloom-text text-sm"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const name = editingName.trim();
                          if (name) {
                            updateSavedSearch(s.id, { name });
                            setEditingSearchId(null);
                          }
                        }}
                        className="p-1 rounded hover:bg-vloom-border/50 text-vloom-accent"
                        title="Save name"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSearchId(null);
                          setEditingName('');
                        }}
                        className="p-1 rounded hover:bg-vloom-border/50 text-vloom-muted"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setViewingSearchId(s.id)}
                      className="w-full text-left hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-vloom-accent/30 rounded"
                    >
                      <p className="font-medium text-vloom-text truncate flex items-center gap-2">
                        <List className="w-4 h-4 flex-shrink-0 text-vloom-muted" />
                        {s.name}
                      </p>
                      <p className="text-sm text-vloom-muted truncate mt-0.5">
                        {summary || (s.actor_id === LINKEDIN_POST_FEED_ACTOR_ID ? 'LinkedIn Post Feeds' : 'LinkedIn Jobs')}
                      </p>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSearchId(s.id);
                      setEditingName(s.name);
                    }}
                    className="p-1.5 rounded hover:bg-vloom-border/50 text-vloom-muted hover:text-vloom-text"
                    title="Rename"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <label
                    className="flex items-center gap-2 text-sm text-vloom-muted cursor-pointer"
                    title="While this screen is open, re-runs about once per 24 hours. Uses last run time (including manual Run)."
                  >
                    <span>Autorun</span>
                    <input
                      type="checkbox"
                      checked={Boolean(s.autorun)}
                      onChange={(e) => updateSavedSearch(s.id, { autorun: e.target.checked })}
                      className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRun(s.id, s.actor_id)}
                    disabled={isRunning}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-vloom-accent text-white text-sm hover:bg-vloom-accent-hover disabled:opacity-50"
                  >
                    {isRunning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Run
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSavedSearch(s.id)}
                    className="p-1.5 rounded-lg text-vloom-muted hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
          {otherSearches.length > 0 && (
            <>
              <li className="text-sm text-vloom-muted pt-2">Other actors (run not supported yet):</li>
              {otherSearches.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-lg border border-vloom-border bg-vloom-surface opacity-75"
                >
                  <div className="min-w-0 flex-1">
                    {editingSearchId === s.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const name = editingName.trim();
                              if (name) {
                                updateSavedSearch(s.id, { name });
                                setEditingSearchId(null);
                              }
                            }
                            if (e.key === 'Escape') {
                              setEditingSearchId(null);
                              setEditingName('');
                            }
                          }}
                          className="flex-1 min-w-[120px] px-2 py-0.5 rounded border border-vloom-border bg-vloom-bg text-vloom-text text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const name = editingName.trim();
                            if (name) {
                              updateSavedSearch(s.id, { name });
                              setEditingSearchId(null);
                            }
                          }}
                          className="p-1 rounded hover:bg-vloom-border/50 text-vloom-accent"
                          title="Save name"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSearchId(null);
                            setEditingName('');
                          }}
                          className="p-1 rounded hover:bg-vloom-border/50 text-vloom-muted"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <p className="font-medium text-vloom-text">{s.name}</p>
                    )}
                    {editingSearchId !== s.id && (
                      <p className="text-xs text-vloom-muted">{s.actor_id}</p>
                    )}
                  </div>
                  {editingSearchId !== s.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSearchId(s.id);
                        setEditingName(s.name);
                      }}
                      className="p-1.5 rounded hover:bg-vloom-border/50 text-vloom-muted hover:text-vloom-text"
                      title="Rename"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
