// =====================================================
// Leadflow Vloom - Saved searches list + Run + New saved search + View outputs
// =====================================================
import { useState, useCallback } from 'react';
import { Play, Plus, Loader2, Trash2, ArrowLeft, List, Pencil, Check, X } from 'lucide-react';
import { useSavedSearches } from '@/hooks/useSavedSearches';
import { useLeads } from '@/hooks/useLeads';
import { LeadsTable } from '@/components/LeadsTable';
import { runJobSearchViaEdge, sendSelectedToLeadsAndEnrich, recomputeLeadScores } from '@/lib/apify';
import type { RunLinkedInSearchResult } from '@/lib/apify';
import { supabase } from '@/lib/supabase';
import { Send } from 'lucide-react';

const LINKEDIN_ACTOR_ID = 'harvestapi/linkedin-job-search';

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
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
  } = useLeads({
    initialFilters: { saved_search_id: savedSearchId },
    pageSize: 25,
  });

  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recomputing, setRecomputing] = useState(false);

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
      const { sent, enriched } = await sendSelectedToLeadsAndEnrich(ids);
      clearSelection();
      refreshLeads();
      setSendMessage({
        type: 'success',
        text: `${sent} sent to Leads. ${enriched} compan${enriched === 1 ? 'y' : 'ies'} enriched with LinkedIn data.`,
      });
    } catch (err) {
      setSendMessage({
        type: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSending(false);
    }
  }, [selectedIds, clearSelection, refreshLeads]);

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
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="px-3 py-2 border-b border-vloom-border bg-vloom-accent/10 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-vloom-text">
            {selectedIds.size} selected
          </span>
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
        </div>
      )}

      {sendMessage && (
        <div
          className={`px-3 py-2 border-b border-vloom-border text-sm ${
            sendMessage.type === 'success'
              ? 'bg-green-500/10 text-green-800 dark:text-green-200'
              : 'bg-red-500/10 text-red-800 dark:text-red-200'
          }`}
        >
          {sendMessage.text}
          <button
            type="button"
            onClick={() => setSendMessage(null)}
            className="ml-2 text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
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
        onViewDetails={noop}
        onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
        selectionAction={
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
  const { savedSearches, isLoading, error, createSavedSearch, deleteSavedSearch, updateSavedSearch } =
    useSavedSearches();
  const [editingSearchId, setEditingSearchId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [viewingSearchId, setViewingSearchId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newJobTitles, setNewJobTitles] = useState('');
  const [newLocations, setNewLocations] = useState('');
  const [newPostedLimit, setNewPostedLimit] = useState<'Past 1 hour' | 'Past 24 hours' | 'Past Week' | 'Past Month'>('Past 1 hour');
  const [newMaxItems, setNewMaxItems] = useState(500);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleRun = useCallback(
    async (id: string, actorId: string) => {
      setRunningId(id);
      try {
        const result = await runJobSearchViaEdge({ actorId, savedSearchId: id });
        onRunComplete(result);
      } catch (err) {
        onRunError(err instanceof Error ? err.message : String(err));
      } finally {
        setRunningId(null);
      }
    },
    [onRunComplete, onRunError]
  );

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    const jobTitles = newJobTitles
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name || jobTitles.length === 0) {
      setCreateError('Name and at least one job title are required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createSavedSearch({
        name,
        actor_id: LINKEDIN_ACTOR_ID,
        input: {
          jobTitles,
          locations: newLocations ? newLocations.split(',').map((s) => s.trim()).filter(Boolean) : [],
          postedLimit: newPostedLimit,
          maxItems: newMaxItems,
          sort: 'date',
        },
      });
      setShowNewForm(false);
      setNewName('');
      setNewJobTitles('');
      setNewLocations('');
      setNewPostedLimit('Past 1 hour');
      setNewMaxItems(24);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [
    newName,
    newJobTitles,
    newLocations,
    newPostedLimit,
    newMaxItems,
    createSavedSearch,
  ]);

  const linkedInSearches = savedSearches.filter((s) => s.actor_id === LINKEDIN_ACTOR_ID);
  const otherSearches = savedSearches.filter((s) => s.actor_id !== LINKEDIN_ACTOR_ID);

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">Saved searches</h1>
      <p className="text-sm text-vloom-muted mb-4">
        Re-run a saved search with one click. Only LinkedIn Jobs (HarvestAPI) runs are supported for now.
      </p>

      {!supabase && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 p-4 text-sm mb-4">
          Supabase is not configured. Saved searches require a connected database.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 p-4 text-sm mb-4">{error}</div>
      )}

      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-vloom-border bg-vloom-surface text-vloom-text hover:bg-vloom-border/30 text-sm"
        >
          <Plus className="w-4 h-4" />
          New saved search
        </button>
      </div>

      {showNewForm && (
        <div className="mb-6 p-4 rounded-xl border border-vloom-border bg-vloom-surface space-y-3">
          <h2 className="text-sm font-medium text-vloom-text">Create saved search</h2>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Search name (e.g. Video Editors Daily)"
            className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg"
          />
          <input
            type="text"
            value={newJobTitles}
            onChange={(e) => setNewJobTitles(e.target.value)}
            placeholder="Job titles, comma-separated"
            className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg"
          />
          <input
            type="text"
            value={newLocations}
            onChange={(e) => setNewLocations(e.target.value)}
            placeholder="Locations (optional), comma-separated"
            className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg"
          />
          <select
            value={newPostedLimit}
            onChange={(e) => setNewPostedLimit(e.target.value as typeof newPostedLimit)}
            className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg"
          >
            <option value="Past 1 hour">Past 1 hour</option>
            <option value="Past 24 hours">Past 24 hours</option>
            <option value="Past Week">Past week</option>
            <option value="Past Month">Past month</option>
          </select>
          <input
            type="number"
            min={1}
            max={500}
            value={newMaxItems}
            onChange={(e) => setNewMaxItems(Number(e.target.value) || 24)}
            className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg"
          />
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-vloom-accent text-white rounded-lg text-sm hover:bg-vloom-accent-hover disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="px-4 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {viewingSearchId ? (
        (() => {
          const viewing = linkedInSearches.find((s) => s.id === viewingSearchId) ?? otherSearches.find((s) => s.id === viewingSearchId);
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
      ) : linkedInSearches.length === 0 && otherSearches.length === 0 ? (
        <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
          No saved searches yet. Create one above or run a search from New Search and save it for later.
        </div>
      ) : (
        <ul className="space-y-2">
          {linkedInSearches.map((s) => {
            const jobTitles = (s.input?.jobTitles as string[] | string) ?? [];
            const summary =
              Array.isArray(jobTitles) ? jobTitles.join(', ') : typeof jobTitles === 'string' ? jobTitles : '';
            const isRunning = runningId === s.id;
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-4 p-4 rounded-lg border border-vloom-border bg-vloom-surface"
              >
                <button
                  type="button"
                  onClick={() => setViewingSearchId(s.id)}
                  className="min-w-0 flex-1 text-left hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-vloom-accent/30 rounded"
                >
                  {editingSearchId === s.id ? (
                    <p className="font-medium text-vloom-text flex items-center gap-2 flex-wrap">
                      <List className="w-4 h-4 flex-shrink-0 text-vloom-muted" />
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
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
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-[120px] px-2 py-0.5 rounded border border-vloom-border bg-vloom-bg text-vloom-text text-sm"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSearchId(null);
                          setEditingName('');
                        }}
                        className="p-1 rounded hover:bg-vloom-border/50 text-vloom-muted"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </p>
                  ) : (
                    <p className="font-medium text-vloom-text truncate flex items-center gap-2">
                      <List className="w-4 h-4 flex-shrink-0 text-vloom-muted" />
                      {s.name}
                    </p>
                  )}
                  {editingSearchId !== s.id && (
                    <p className="text-sm text-vloom-muted truncate mt-0.5">{summary || 'LinkedIn Jobs'}</p>
                  )}
                </button>
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
                    title="When on, this search will be eligible for automatic re-runs (scheduling coming soon)"
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
