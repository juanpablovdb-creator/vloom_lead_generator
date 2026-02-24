// =====================================================
// LEADFLOW - Main Dashboard Page
// =====================================================
import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Download,
  Upload,
  Settings,
  Users,
  BarChart3,
  Mail,
  Sparkles,
  RefreshCw,
  Trash2,
  Share2,
  ChevronDown,
} from 'lucide-react';
import { useLeads } from '@/hooks/useLeads';
import { getDisplayLeadsForView } from '@/lib/leadViewUtils';
import { LeadsTable } from '@/components/LeadsTable';
import { FilterBar } from '@/components/FilterBar';
import { JobSearch, JobSearchParams } from '@/components/JobSearch';
import { ScoringConfig } from '@/components/ScoringConfig';
import { EmailComposer } from '@/components/EmailComposer';
import type { Lead, LeadStatus, ScoreWeights, ScoringPreset, EmailTemplate } from '@/types/database';

// Mock data for development - remove when connecting to Supabase
const MOCK_TEMPLATES: EmailTemplate[] = [
  {
    id: '1',
    user_id: '',
    team_id: null,
    is_shared: true,
    name: 'Initial Outreach',
    subject: 'Quick question about {{job_title}} role',
    body_template: 'Hi {{contact_name}},\n\nI saw {{company_name}} is looking for a {{job_title}}...',
    ai_prompt: 'Focus on video editing services',
    tone: 'professional',
    created_at: '',
    updated_at: '',
  },
];

const MOCK_PRESETS: ScoringPreset[] = [
  {
    id: '1',
    user_id: '',
    team_id: null,
    name: 'Startup Focus',
    description: 'Prioritize smaller companies',
    weights: {
      has_email: 30,
      has_linkedin: 10,
      company_size_match: 30,
      industry_match: 15,
      recent_posting: 15,
    },
    target_company_sizes: ['1-10', '11-50'],
    target_industries: [],
    is_default: false,
    created_at: '',
    updated_at: '',
  },
];

type View = 'leads' | 'search' | 'scoring' | 'settings';

export default function DashboardPage() {
  const [currentView, setCurrentView] = useState<View>('leads');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);

  const {
    leads,
    totalCount,
    isLoading,
    error,
    filters,
    updateFilter,
    clearFilters,
    sort,
    setSort,
    pagination,
    setPage,
    setPageSize,
    refreshLeads,
    updateLead,
    deleteLead,
    deleteLeads,
    updateLeadStatus,
    toggleShare,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
  } = useLeads();

  // Count active filters
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

  const { displayLeads, groupSizeByLeadId } = useMemo(
    () => getDisplayLeadsForView(leads, filters.view_by),
    [leads, filters.view_by]
  );

  // Handlers
  const handleJobSearch = useCallback(async (params: JobSearchParams) => {
    setIsSearching(true);
    try {
      // This will call the Apify client
      console.log('Searching jobs with params:', params);
      // await searchJobs(params);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulated delay
      setCurrentView('leads');
      refreshLeads();
    } finally {
      setIsSearching(false);
    }
  }, [refreshLeads]);

  const handleGenerateEmail = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowEmailComposer(true);
  }, []);

  const handleSendEmail = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setShowEmailComposer(true);
  }, []);

  const handleEnrich = useCallback(async (lead: Lead) => {
    await updateLeadStatus(lead.id, 'backlog');
    // Call enrichment API
    console.log('Enriching lead:', lead.id);
  }, [updateLeadStatus]);

  const handleDelete = useCallback(async (lead: Lead) => {
    if (confirm(`Delete lead "${lead.company_name || 'Unknown'}"?`)) {
      await deleteLead(lead.id);
    }
  }, [deleteLead]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Delete ${selectedIds.size} selected leads?`)) {
      await deleteLeads(Array.from(selectedIds));
    }
  }, [selectedIds, deleteLeads]);

  const handleBulkEnrich = useCallback(async () => {
    // Enrich all selected leads
    for (const id of selectedIds) {
      await updateLeadStatus(id, 'backlog');
    }
    clearSelection();
  }, [selectedIds, updateLeadStatus, clearSelection]);

  const handleEmailGenerate = useCallback(async (params: {
    leadId: string;
    templateId?: string;
    customPrompt?: string;
    tone?: 'professional' | 'casual' | 'friendly';
  }) => {
    // Call AI email generator
    console.log('Generating email with params:', params);
    return {
      subject: `Collaboration opportunity with ${selectedLead?.company_name}`,
      body: `Hi ${selectedLead?.contact_name || 'there'},\n\nI noticed you're looking for a ${selectedLead?.job_title}...`,
    };
  }, [selectedLead]);

  const handleEmailSend = useCallback(async (params: {
    leadId: string;
    subject: string;
    body: string;
  }) => {
    // Call SendGrid
    console.log('Sending email:', params);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await updateLeadStatus(params.leadId, 'invite_sent');
  }, [updateLeadStatus]);

  const handleSaveScoring = useCallback(async (weights: ScoreWeights) => {
    console.log('Saving scoring weights:', weights);
    // Update all leads with new weights and recalculate
  }, []);

  const handleApplyPreset = useCallback((preset: ScoringPreset) => {
    console.log('Applying preset:', preset);
  }, []);

  const handleSavePreset = useCallback(async (name: string, weights: ScoreWeights) => {
    console.log('Saving preset:', name, weights);
  }, []);

  return (
    <div className="min-h-screen bg-vloom-bg">
      <header className="bg-vloom-surface border-b border-vloom-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold text-vloom-text">Vloom Lead Generator</span>
            </div>

            <nav className="flex items-center gap-1">
              {[
                { id: 'leads', label: 'Leads', icon: Users },
                { id: 'search', label: 'Find Jobs', icon: Search },
                { id: 'scoring', label: 'Scoring', icon: BarChart3 },
                { id: 'settings', label: 'Settings', icon: Settings },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setCurrentView(id as View)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === id
                      ? 'bg-vloom-accent/10 text-vloom-accent'
                      : 'text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <button className="p-2 text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/50 rounded-lg">
                <Mail className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 rounded-full bg-vloom-border flex items-center justify-center text-vloom-muted text-sm font-medium">
                U
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'leads' && (
          <div className="space-y-6">
            {/* Supabase not configured / error banner */}
            {error && (
              <div className="bg-vloom-border/30 border border-vloom-border rounded-xl p-4 flex items-start gap-3">
                <span className="text-vloom-muted text-xl">⚠️</span>
                <div className="flex-1">
                  <p className="font-medium text-vloom-text">Configuration needed</p>
                  <p className="text-sm text-vloom-muted mt-1">{error}</p>
                  <p className="text-xs text-vloom-muted mt-2">
                    Add <code className="bg-vloom-border px-1 rounded">VITE_SUPABASE_URL</code> and{' '}
                    <code className="bg-vloom-border px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to <code className="bg-vloom-border px-1 rounded">.env</code>.
                  </p>
                </div>
              </div>
            )}

            {/* Page header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-vloom-text">Leads</h1>
                <p className="text-vloom-muted">
                  {totalCount} leads total · {selectedIds.size} selected
                </p>
              </div>
              <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                  <div className="relative">
                <button
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  className="flex items-center gap-2 px-4 py-2 bg-vloom-border/50 text-vloom-text rounded-lg hover:bg-vloom-border"
                >
                      Bulk Actions
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {showBulkActions && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowBulkActions(false)} />
                        <div className="absolute right-0 mt-2 w-48 bg-vloom-surface rounded-lg shadow-lg border border-vloom-border py-2 z-20">
                          <button
                            onClick={() => { handleBulkEnrich(); setShowBulkActions(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-vloom-text hover:bg-vloom-bg flex items-center gap-2"
                          >
                            <RefreshCw className="w-4 h-4 text-green-500" />
                            Enrich Selected
                          </button>
                          <button
                            onClick={() => { /* Open bulk email */ setShowBulkActions(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-vloom-text hover:bg-vloom-bg flex items-center gap-2"
                          >
                            <Mail className="w-4 h-4 text-vloom-accent" />
                            Email Selected
                          </button>
                          <button
                            onClick={() => { /* Toggle share */ setShowBulkActions(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-vloom-text hover:bg-vloom-bg flex items-center gap-2"
                          >
                            <Share2 className="w-4 h-4 text-vloom-accent" />
                            Share with Team
                          </button>
                          <hr className="my-2" />
                          <button
                            onClick={() => { handleBulkDelete(); setShowBulkActions(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Selected
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setCurrentView('search')}
                  className="flex items-center gap-2 px-4 py-2 bg-vloom-accent text-white rounded-lg hover:bg-vloom-accent-hover"
                >
                  <Plus className="w-4 h-4" />
                  Find New Leads
                </button>
              </div>
            </div>

            {/* Filters */}
            <FilterBar
              filters={filters}
              onFilterChange={updateFilter}
              onClearFilters={clearFilters}
              activeFilterCount={activeFilterCount}
            />

            {/* Table */}
            <LeadsTable
              leads={displayLeads}
              groupSizeByLeadId={groupSizeByLeadId}
              isLoading={isLoading}
              sort={sort}
              onSortChange={setSort}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
              onSelectAll={selectAll}
              onClearSelection={clearSelection}
              isAllSelected={isAllSelected}
              onGenerateEmail={handleGenerateEmail}
              onSendEmail={handleSendEmail}
              onEnrich={handleEnrich}
              onDelete={handleDelete}
              onStatusChange={(lead, status) => updateLeadStatus(lead.id, status)}
              onToggleShare={async (lead) => toggleShare(lead.id)}
              onViewDetails={(lead) => console.log('View details:', lead)}
              onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
            />

            {/* Pagination */}
            {totalCount > pagination.pageSize && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-vloom-muted">
                  Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
                  {Math.min(pagination.page * pagination.pageSize, totalCount)} of {totalCount}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 text-sm text-vloom-muted hover:bg-vloom-border rounded disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-sm text-vloom-text bg-vloom-border rounded">
                    {pagination.page}
                  </span>
                  <button
                    onClick={() => setPage(pagination.page + 1)}
                    disabled={pagination.page * pagination.pageSize >= totalCount}
                    className="px-3 py-1.5 text-sm text-vloom-muted hover:bg-vloom-border rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'search' && (
          <div className="max-w-2xl mx-auto">
            <JobSearch onSearch={handleJobSearch} isSearching={isSearching} />
          </div>
        )}

        {currentView === 'scoring' && (
          <div className="max-w-2xl mx-auto">
            <ScoringConfig
              currentWeights={{
                has_email: 25,
                has_linkedin: 15,
                company_size_match: 20,
                industry_match: 20,
                recent_posting: 20,
              }}
              presets={MOCK_PRESETS}
              onSave={handleSaveScoring}
              onApplyPreset={handleApplyPreset}
              onSaveAsPreset={handleSavePreset}
            />
          </div>
        )}

        {currentView === 'settings' && (
          <div className="max-w-2xl mx-auto bg-vloom-surface rounded-xl border border-vloom-border p-6">
            <h2 className="text-lg font-semibold text-vloom-text mb-4">Settings</h2>
            <p className="text-vloom-muted">API keys and team settings coming soon...</p>
          </div>
        )}
      </main>

      {/* Email composer modal */}
      {showEmailComposer && selectedLead && (
        <EmailComposer
          lead={selectedLead}
          templates={MOCK_TEMPLATES}
          senderInfo={{
            name: 'Your Name',
            email: 'your@email.com',
            company: 'Your Company',
          }}
          onGenerate={handleEmailGenerate}
          onSend={handleEmailSend}
          onClose={() => {
            setShowEmailComposer(false);
            setSelectedLead(null);
          }}
        />
      )}
    </div>
  );
}
