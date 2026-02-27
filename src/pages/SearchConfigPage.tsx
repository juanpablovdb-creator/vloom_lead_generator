// =====================================================
// Leadflow Vloom - Search Configuration Page
// =====================================================
// Each Actor's parameters are defined here and must match the
// inputs of the corresponding Apify Actor. Docs: https://apify.com/store
// =====================================================

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Search,
  Loader2,
  Info,
  Sparkles,
  Clock,
  MapPin,
  Hash,
  Filter,
  Briefcase,
  Save,
  X,
  ChevronDown,
} from 'lucide-react';
import type { LeadSource } from './HomePage';
import { useLeads } from '@/hooks/useLeads';
import { LeadsTable } from '@/components/LeadsTable';
import { supabase } from '@/lib/supabase';

// =====================================================
// APIFY ACTOR INPUT SCHEMAS
// These parameters must match each Actor's inputs.
// Reference: https://apify.com/{actor-id}/input-schema
// =====================================================

interface ActorInputField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'location' | 'locations';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
  helpText?: string;
  icon?: React.ReactNode;
}

// Predefined locations (USA, Canada, Europe) to avoid typos and save credits when testing
const LOCATION_OPTIONS = [
  'United States',
  'Canada',
  'Remote',
  'United Kingdom',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Netherlands',
  'Belgium',
  'Ireland',
  'Portugal',
  'Switzerland',
  'Austria',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Poland',
  'Czech Republic',
  'Romania',
  'Greece',
  'Hungary',
  'Ukraine',
  'Croatia',
  'Bulgaria',
  'Slovakia',
  'Slovenia',
  'Lithuania',
  'Latvia',
  'Estonia',
  'Luxembourg',
  'Malta',
  'Cyprus',
  'Iceland',
];

// Multi-select dropdown for locations (styled, with chips)
function LocationsMultiSelect({
  options,
  value,
  onChange,
  placeholder,
  className,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', onOutside);
      return () => document.removeEventListener('mousedown', onOutside);
    }
  }, [open]);

  const toggle = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  const remove = (optValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optValue));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${className} flex items-center justify-between gap-2 text-left min-h-[52px] cursor-pointer`}
      >
        <span className="flex-1 flex flex-wrap gap-1.5">
          {value.length === 0 ? (
            <span className="text-vloom-muted">{placeholder}</span>
          ) : (
            value.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-vloom-accent/15 text-vloom-accent text-sm"
              >
                {v}
                <button
                  type="button"
                  onClick={(e) => remove(v, e)}
                  className="hover:bg-vloom-accent/25 rounded p-0.5"
                  aria-label={`Remove ${v}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))
          )}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-vloom-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-vloom-border bg-vloom-surface shadow-lg max-h-64 overflow-y-auto">
          <div className="p-2">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-vloom-border/30 cursor-pointer text-sm text-vloom-text"
              >
                <input
                  type="checkbox"
                  checked={value.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent/50"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Apify Actor input configuration
const ACTOR_INPUT_SCHEMAS: Record<string, ActorInputField[]> = {
  // HarvestAPI LinkedIn Job Search - harvestapi/linkedin-job-search
  // Docs: https://apify.com/harvestapi/linkedin-job-search
  'harvestapi/linkedin-job-search': [
    {
      key: 'jobTitles',
      label: 'Job titles / Keywords',
      type: 'text',
      placeholder: 'Video Editor, Motion Designer, Content Creator...',
      required: true,
      helpText: 'One or more job titles. Separate multiple with commas.',
      icon: <Search className="w-4 h-4" />,
    },
    {
      key: 'locations',
      label: 'Locations',
      type: 'locations',
      required: false,
      options: LOCATION_OPTIONS.map((loc) => ({ value: loc, label: loc })),
      defaultValue: '',
      helpText: 'Optional. Select one or more (Ctrl/Cmd+click). USA, Canada, Europe. No typing needed.',
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      key: 'postedLimit',
      label: 'Date posted',
      type: 'select',
      options: [
        { value: 'Past 1 hour', label: 'Past 1 hour' },
        { value: 'Past 24 hours', label: 'Past 24 hours' },
        { value: 'Past Week', label: 'Past week' },
        { value: 'Past Month', label: 'Past month' },
      ],
      defaultValue: 'Past 1 hour',
      helpText: 'Only jobs posted in this period. Use "Past 1 hour" for quick tests to save credits.',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      key: 'maxItems',
      label: 'Max results',
      type: 'number',
      placeholder: '500',
      defaultValue: 500,
      helpText: 'Maximum number of jobs to fetch. Use 500 to scrape all jobs for the selected period (e.g. past 24 hours).',
      icon: <Hash className="w-4 h-4" />,
    },
    {
      key: 'sort',
      label: 'Sort by',
      type: 'select',
      options: [
        { value: 'date', label: 'Most recent' },
        { value: 'relevance', label: 'Relevance' },
      ],
      defaultValue: 'date',
      icon: <Filter className="w-4 h-4" />,
    },
  ],

  // Legacy: bebity/linkedin-jobs-scraper
  'bebity/linkedin-jobs-scraper': [
    {
      key: 'searchQueries',
      label: 'Keywords',
      type: 'text',
      placeholder: 'Video Editor, Motion Designer, Content Creator...',
      required: true,
      helpText: 'Job titles or keywords to search for. Separate multiple with commas.',
      icon: <Search className="w-4 h-4" />,
    },
    {
      key: 'location',
      label: 'Location',
      type: 'location',
      placeholder: 'United States, Remote, New York...',
      required: false,
      helpText: 'Leave empty for worldwide results',
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      key: 'publishedAt',
      label: 'Date Posted',
      type: 'select',
      options: [
        { value: 'anyTime', label: 'Any time' },
        { value: 'pastMonth', label: 'Past month' },
        { value: 'pastWeek', label: 'Past week' },
        { value: 'past24Hours', label: 'Past 24 hours' },
      ],
      defaultValue: 'pastWeek',
      helpText: 'Filter by when the job was posted',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      key: 'experienceLevel',
      label: 'Experience Level',
      type: 'select',
      options: [
        { value: '', label: 'All levels' },
        { value: 'internship', label: 'Internship' },
        { value: 'entryLevel', label: 'Entry level' },
        { value: 'associate', label: 'Associate' },
        { value: 'midSeniorLevel', label: 'Mid-Senior level' },
        { value: 'director', label: 'Director' },
        { value: 'executive', label: 'Executive' },
      ],
      defaultValue: '',
      icon: <Briefcase className="w-4 h-4" />,
    },
    {
      key: 'rows',
      label: 'Max Results',
      type: 'number',
      placeholder: '50',
      defaultValue: 50,
      helpText: 'Maximum number of jobs to scrape (more = higher cost)',
      icon: <Hash className="w-4 h-4" />,
    },
  ],

  // Indeed Scraper - misceres/indeed-scraper
  // Docs: https://apify.com/misceres/indeed-scraper
  'misceres/indeed-scraper': [
    {
      key: 'position',
      label: 'Job Title / Keywords',
      type: 'text',
      placeholder: 'Video Editor',
      required: true,
      helpText: 'The position or keywords to search for',
      icon: <Search className="w-4 h-4" />,
    },
    {
      key: 'location',
      label: 'Location',
      type: 'location',
      placeholder: 'New York, NY',
      required: false,
      helpText: 'City, state, or country',
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      key: 'maxItems',
      label: 'Max Results',
      type: 'number',
      placeholder: '50',
      defaultValue: 50,
      helpText: 'Maximum number of listings to scrape',
      icon: <Hash className="w-4 h-4" />,
    },
  ],

  // Glassdoor Jobs Scraper - epctex/glassdoor-jobs-scraper
  // Docs: https://apify.com/epctex/glassdoor-jobs-scraper
  'epctex/glassdoor-jobs-scraper': [
    {
      key: 'keyword',
      label: 'Keywords',
      type: 'text',
      placeholder: 'Video Editor',
      required: true,
      helpText: 'Job title or keywords',
      icon: <Search className="w-4 h-4" />,
    },
    {
      key: 'location',
      label: 'Location',
      type: 'location',
      placeholder: 'Los Angeles, CA',
      required: false,
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      key: 'maxItems',
      label: 'Max Results',
      type: 'number',
      placeholder: '50',
      defaultValue: 50,
      icon: <Hash className="w-4 h-4" />,
    },
  ],
};

// =====================================================
// COMPONENT
// =====================================================

type LastSearchResult =
  | { ok: true; scrapingJobId: string; imported: number; skipped: number; totalFromApify: number }
  | { ok: false; error: string }
  | null;

/** Table of leads for a single run (used after Start Search). */
function SearchResultsTable({ scrapingJobId }: { scrapingJobId: string }) {
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
    initialFilters: { scraping_job_id: scrapingJobId },
    pageSize: 25,
  });

  if (error) {
    return (
      <div className="rounded-xl border border-vloom-border bg-vloom-surface p-4 text-sm text-red-600">{error}</div>
    );
  }

  const noop = () => {};
  return (
    <div className="rounded-xl border border-vloom-border bg-vloom-surface overflow-hidden">
      <div className="p-3 border-b border-vloom-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-vloom-text">Results ({totalCount})</h3>
        <button
          type="button"
          onClick={() => refreshLeads()}
          className="text-xs text-vloom-muted hover:text-vloom-text"
        >
          Refresh
        </button>
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
        onDelete={noop}
        onStatusChange={(lead, status) => updateLeadStatus(lead.id, status)}
        onToggleShare={noop}
        onViewDetails={noop}
        onMarkAsLead={(lead, value) => updateLead(lead.id, { is_marked_as_lead: value })}
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

function RefreshSessionButton({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const handleRefresh = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      if (data?.session) {
        onSuccess();
      } else {
        throw new Error('No session');
      }
    } catch {
      setLoading(false);
    }
    setLoading(false);
  };
  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={loading}
      className="mt-3 px-3 py-1.5 rounded-lg bg-amber-200/80 dark:bg-amber-500/30 hover:bg-amber-300/80 dark:hover:bg-amber-500/50 font-medium text-amber-900 dark:text-amber-100 disabled:opacity-50"
    >
      {loading ? 'Actualizando…' : 'Actualizar sesión y volver a intentar'}
    </button>
  );
}

interface SearchConfigPageProps {
  source: LeadSource;
  onBack: () => void;
  onSearch: (source: LeadSource, params: Record<string, unknown>) => Promise<void>;
  lastSearchResult?: LastSearchResult | null;
  onDismissResult?: () => void;
  onSaveSearch?: (params: { name: string; actor_id: string; input: Record<string, unknown> }) => Promise<unknown>;
}

export function SearchConfigPage({
  source,
  onBack,
  onSearch,
  lastSearchResult = null,
  onDismissResult,
  onSaveSearch,
}: SearchConfigPageProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveName, setSaveName] = useState('');
  const [savingSearch, setSavingSearch] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSearchId, setSavedSearchId] = useState<string | null>(null);

  const inputSchema = useMemo(
    () => ACTOR_INPUT_SCHEMAS[source.apifyActorId] || [],
    [source.apifyActorId]
  );

  // Initialize default values
  React.useEffect(() => {
    const defaults: Record<string, unknown> = {};
    inputSchema.forEach((field) => {
      if (field.defaultValue !== undefined) {
        defaults[field.key] = field.defaultValue;
      }
    });
    setFormData(defaults);
  }, [source.apifyActorId, inputSchema]);

  const handleChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    // Clear error when user types
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    inputSchema.forEach((field) => {
      if (field.required && !formData[field.key]) {
        newErrors[field.key] = `${field.label} is required`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSearching(true);
    try {
      await onSearch(source, formData);
    } finally {
      setIsSearching(false);
    }
  };

  const renderField = (field: ActorInputField) => {
    const value = formData[field.key] ?? '';
    const error = errors[field.key];

    const baseInputClass = `
      w-full pl-10 pr-4 py-3 border rounded-xl text-vloom-text placeholder-vloom-muted
      focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent transition-all bg-vloom-surface
      ${error ? 'border-red-400 bg-red-50' : 'border-vloom-border'}
    `;

    return (
      <div key={field.key} className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-vloom-text">
          {field.label}
          {field.required && <span className="text-red-500">*</span>}
        </label>
        
        <div className="relative">
          {field.icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-vloom-muted">
              {field.icon}
            </div>
          )}

          {field.type === 'select' ? (
            <select
              value={value as string}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className={baseInputClass}
            >
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : field.type === 'locations' ? (
            <LocationsMultiSelect
              options={field.options ?? []}
              value={(value as string) ? (value as string).split(',').map((s: string) => s.trim()).filter(Boolean) : []}
              onChange={(selected) => handleChange(field.key, selected.join(', '))}
              placeholder="Select locations..."
              className={baseInputClass}
            />
          ) : field.type === 'number' ? (
            <input
              type="number"
              value={value as number}
              onChange={(e) => handleChange(field.key, parseInt(e.target.value) || 0)}
              placeholder={field.placeholder}
              min={1}
              max={500}
              className={baseInputClass}
            />
          ) : (
            <input
              type="text"
              value={value as string}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className={baseInputClass}
            />
          )}
        </div>

        {/* Help text or error */}
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : field.helpText ? (
          <p className="text-sm text-vloom-muted flex items-start gap-1">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {field.helpText}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-vloom-bg">
      <header className="border-b border-vloom-border bg-vloom-surface sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-14">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-vloom-muted hover:text-vloom-text -ml-2 px-2 py-1 rounded-lg hover:bg-vloom-border/50"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-start gap-4 mb-8">
          <div className={`w-12 h-12 rounded-lg ${source.bgColor} ${source.color} flex items-center justify-center flex-shrink-0`}>
            {source.icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-vloom-text">{source.name}</h1>
            <p className="text-vloom-muted">{source.description}</p>
            <code className="mt-2 inline-block text-xs font-mono text-vloom-muted bg-vloom-border/50 px-2 py-1 rounded">
              {source.apifyActorId}
            </code>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-vloom-surface rounded-xl border border-vloom-border p-6 space-y-6">
            <div className="flex items-center gap-2 text-sm font-medium text-vloom-muted uppercase tracking-wide">
              <Filter className="w-4 h-4" />
              Search Parameters
            </div>

            {inputSchema.map(renderField)}

            {inputSchema.length === 0 && (
              <div className="text-center py-8 text-vloom-muted">
                <p>No input schema defined for this actor.</p>
                <p className="text-sm mt-1">Add it in ACTOR_INPUT_SCHEMAS</p>
              </div>
            )}
          </div>

          <div className="bg-vloom-border/30 border border-vloom-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-vloom-muted flex-shrink-0 mt-0.5" />
              <div className="text-sm text-vloom-text">
                <p className="font-medium">Estimated cost</p>
                <p className="text-vloom-muted mt-1">
                  ~$0.10 - $0.50 depending on results. Apify compute credits.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSearching}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-vloom-accent text-white font-medium rounded-xl hover:bg-vloom-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Start Search
              </>
            )}
          </button>
        </form>

        {/* Results after search: stay on same page */}
        {lastSearchResult && (
          <div className="mt-8 space-y-4">
            {lastSearchResult.ok ? (
              <>
                <div className="rounded-xl border p-4 flex items-center justify-between gap-4 bg-green-500/10 border-green-500/30 text-green-800 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-200">
                  <p className="text-sm">
                    <span className="font-medium">{lastSearchResult.imported} new</span> imported,{' '}
                    {lastSearchResult.skipped} already in list. Total from Apify: {lastSearchResult.totalFromApify}.
                  </p>
                  {onDismissResult && (
                    <button
                      type="button"
                      onClick={onDismissResult}
                      className="p-1.5 rounded-lg text-vloom-muted hover:bg-vloom-border/50 hover:text-vloom-text"
                      aria-label="Dismiss"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {onSaveSearch && (
                  <div className="rounded-xl border border-vloom-border bg-vloom-surface p-4">
                    <h3 className="text-sm font-medium text-vloom-text mb-3">Save this search</h3>
                    <p className="text-xs text-vloom-muted mb-3">
                      Every run is saved automatically in Saved searches. Optionally give a custom name to re-run easily (e.g. &quot;Video Editors Daily&quot;).
                    </p>
                    {savedSearchId ? (
                      <p className="text-sm text-vloom-accent">Saved. It will appear in Saved searches.</p>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <input
                          type="text"
                          value={saveName}
                          onChange={(e) => setSaveName(e.target.value)}
                          placeholder="Search name"
                          className="flex-1 min-w-[200px] px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg"
                        />
                        <button
                          type="button"
                          disabled={!saveName.trim() || savingSearch}
                          onClick={async () => {
                            setSavingSearch(true);
                            setSaveError(null);
                            try {
                              const id = await onSaveSearch({
                                name: saveName.trim(),
                                actor_id: source.apifyActorId,
                                input: formData,
                              });
                              setSavedSearchId(id as string);
                            } catch (e) {
                              setSaveError(e instanceof Error ? e.message : String(e));
                            } finally {
                              setSavingSearch(false);
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-vloom-accent text-white rounded-lg text-sm hover:bg-vloom-accent-hover disabled:opacity-50"
                        >
                          {savingSearch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save search
                        </button>
                      </div>
                    )}
                    {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
                  </div>
                )}

                <SearchResultsTable key={lastSearchResult.scrapingJobId} scrapingJobId={lastSearchResult.scrapingJobId} />
              </>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 p-4 text-red-800 dark:text-red-200 text-sm flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line">{lastSearchResult.error}</p>
                  {onDismissResult && /reload schema|schema cache/i.test(lastSearchResult.error) && (
                    <button
                      type="button"
                      onClick={onDismissResult}
                      className="mt-3 px-3 py-1.5 rounded-lg bg-red-200/80 dark:bg-red-500/30 hover:bg-red-300/80 dark:hover:bg-red-500/50 font-medium"
                    >
                      Try again
                    </button>
                  )}
                  {onDismissResult && /Sesión caducada|Sesión no reconocida|sign in again|logged in/i.test(lastSearchResult.error) && (
                    <RefreshSessionButton onSuccess={onDismissResult} />
                  )}
                </div>
                {onDismissResult && (
                  <button
                    type="button"
                    onClick={onDismissResult}
                    className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 shrink-0 self-start sm:self-center"
                    aria-label="Dismiss"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 p-4 bg-vloom-border/30 rounded-xl space-y-2">
          <p className="text-xs text-vloom-muted">
            These fields are sent to the job source. Results are saved to your leads list. Everything runs inside this app.
          </p>
          {source.apifyActorId === 'harvestapi/linkedin-job-search' && (
            <details className="text-xs text-vloom-muted">
              <summary className="cursor-pointer hover:text-vloom-text">How these fields are used (LinkedIn Jobs)</summary>
              <ul className="mt-2 pl-4 list-disc space-y-0.5">
                <li>Job titles / Keywords → <code className="bg-vloom-border/50 px-1 rounded">jobTitles</code></li>
                <li>Locations → <code className="bg-vloom-border/50 px-1 rounded">locations</code></li>
                <li>Date posted → <code className="bg-vloom-border/50 px-1 rounded">postedLimit</code></li>
                <li>Max results → <code className="bg-vloom-border/50 px-1 rounded">maxItems</code></li>
                <li>Sort by → <code className="bg-vloom-border/50 px-1 rounded">sort</code></li>
              </ul>
            </details>
          )}
        </div>
      </main>
    </div>
  );
}
