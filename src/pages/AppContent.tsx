// =====================================================
// Leadflow Vloom - Main app content (sidebar + section views)
// =====================================================
import { useState, useCallback } from 'react';
import { AppLayout } from '@/components/Layout';
import type { SectionId, DiscoverySubId } from '@/components/Layout';
import { HomePage, LeadSource } from '@/pages/HomePage';
import { SearchConfigPage } from '@/pages/SearchConfigPage';
import { CRMView } from '@/components/CRM';
import { runJobSearchViaEdge } from '@/lib/apify';
import { SavedSearchesView } from '@/components/SavedSearchesView';
import { useSavedSearches } from '@/hooks/useSavedSearches';

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
      if (/team_id|schema cache/i.test(errStr)) {
        setLastSearchResult({
          ok: false,
          error: 'Database schema cache is stale after removing teams. In Supabase Dashboard → SQL Editor run: NOTIFY pgrst, \'reload schema\'; then try again.',
        });
      } else {
        setLastSearchResult({ ok: false, error: errStr });
      }
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
      {section === 'tasks' && <TasksPlaceholder />}
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
        <LeadsListsPlaceholder lastSearchResult={lastSearchResult} onDismissResult={() => setLastSearchResult(null)} />
      )}
      {section === 'crm' && <CRMView />}
      {section === 'kpis' && <KPIsPlaceholder />}
        </>
      )}
    </AppLayout>
  );
}

function TasksPlaceholder() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">Tasks</h1>
      <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
        Coming soon
      </div>
    </div>
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

function LeadsListsPlaceholder({
  lastSearchResult,
  onDismissResult,
}: {
  lastSearchResult: LastSearchResult;
  onDismissResult: () => void;
}) {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">Leads lists</h1>
      {lastSearchResult && (
        <div
          className={`mb-4 rounded-lg border p-4 text-sm ${
            lastSearchResult.ok
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
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
      <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
        Full leads table and filters: coming soon. Run a search from New Search to import jobs first.
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
