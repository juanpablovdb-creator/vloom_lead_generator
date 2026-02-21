// =====================================================
// Vloom Lead Generator - Main app content (sidebar + section views)
// =====================================================
import { useState, useCallback } from 'react';
import { AppLayout } from '@/components/Layout';
import type { SectionId, DiscoverySubId } from '@/components/Layout';
import { HomePage, LeadSource } from '@/pages/HomePage';
import { SearchConfigPage } from '@/pages/SearchConfigPage';
import { CRMView } from '@/components/CRM';

type View = 'app' | 'search-config';

export function AppContent() {
  const [section, setSection] = useState<SectionId>('discovery');
  const [discoverySub, setDiscoverySub] = useState<DiscoverySubId>('new-search');
  const [view, setView] = useState<View>('app');
  const [selectedSource, setSelectedSource] = useState<LeadSource | null>(null);

  const handleNavigate = useCallback((s: SectionId, sub?: DiscoverySubId) => {
    setSection(s);
    if (s === 'discovery' && sub) setDiscoverySub(sub);
    else if (s === 'discovery') setDiscoverySub(sub ?? 'new-search');
  }, []);

  const handleSelectSource = useCallback((source: LeadSource) => {
    setSelectedSource(source);
    setView('search-config');
  }, []);

  const handleBackFromSearchConfig = useCallback(() => {
    setSelectedSource(null);
    setView('app');
  }, []);

  const handleSearch = useCallback(async (_source: LeadSource, _params: Record<string, unknown>) => {
    // TODO: run Apify, then go to Discovery > Leads lists
    setView('app');
    setSection('discovery');
    setDiscoverySub('leads-lists');
    setSelectedSource(null);
  }, []);

  // Full-page search config (same as before when user picks a source from New Search)
  if (view === 'search-config' && selectedSource) {
    return (
      <SearchConfigPage
        source={selectedSource}
        onBack={handleBackFromSearchConfig}
        onSearch={handleSearch}
      />
    );
  }

  return (
    <AppLayout
      activeSection={section}
      activeDiscoverySub={discoverySub}
      onNavigate={handleNavigate}
    >
      {section === 'tasks' && <TasksPlaceholder />}
      {section === 'discovery' && discoverySub === 'new-search' && (
        <DiscoveryNewSearchPlaceholder onSelectSource={handleSelectSource} />
      )}
      {section === 'discovery' && discoverySub === 'saved-searches' && <SavedSearchesPlaceholder />}
      {section === 'discovery' && discoverySub === 'leads-lists' && <LeadsListsPlaceholder />}
      {section === 'crm' && <CRMView />}
      {section === 'kpis' && <KPIsPlaceholder />}
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

function SavedSearchesPlaceholder() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">Saved searches</h1>
      <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
        Coming soon
      </div>
    </div>
  );
}

function LeadsListsPlaceholder() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-lg font-semibold text-vloom-text mb-4">Leads lists</h1>
      <div className="bg-vloom-surface border border-vloom-border rounded-lg p-6 text-center text-vloom-muted text-sm">
        Coming soon
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
