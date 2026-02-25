// =====================================================
// Leadflow Vloom - Saved searches list + Run + New saved search
// =====================================================
import { useState, useCallback } from 'react';
import { Play, Plus, Loader2, Trash2 } from 'lucide-react';
import { useSavedSearches } from '@/hooks/useSavedSearches';
import { runJobSearchViaEdge } from '@/lib/apify';
import type { RunLinkedInSearchResult } from '@/lib/apify';
import { supabase } from '@/lib/supabase';

const LINKEDIN_ACTOR_ID = 'harvestapi/linkedin-job-search';

export interface SavedSearchesViewProps {
  onRunComplete: (result: RunLinkedInSearchResult) => void;
  onRunError: (message: string) => void;
}

export function SavedSearchesView({ onRunComplete, onRunError }: SavedSearchesViewProps) {
  const { savedSearches, isLoading, error, createSavedSearch, deleteSavedSearch, updateSavedSearch } =
    useSavedSearches();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
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

      {isLoading ? (
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
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-vloom-text truncate">{s.name}</p>
                  <p className="text-sm text-vloom-muted truncate">{summary || 'LinkedIn Jobs'}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
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
                  <div>
                    <p className="font-medium text-vloom-text">{s.name}</p>
                    <p className="text-xs text-vloom-muted">{s.actor_id}</p>
                  </div>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
