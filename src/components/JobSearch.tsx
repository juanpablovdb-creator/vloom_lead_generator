// =====================================================
// Leadflow Vloom - JobSearch Component
// =====================================================
import React, { useState } from 'react';
import {
  Search,
  MapPin,
  Calendar,
  Loader2,
  Briefcase,
  Building2,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface JobSearchProps {
  onSearch: (params: JobSearchParams) => Promise<void>;
  isSearching: boolean;
}

export interface JobSearchParams {
  query: string;
  location: string;
  source: 'linkedin' | 'indeed' | 'glassdoor' | 'all';
  datePosted: 'past24Hours' | 'pastWeek' | 'pastMonth' | 'any';
  limit: number;
}

const SOURCES = [
  { value: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { value: 'indeed', label: 'Indeed', icon: '🔍' },
  { value: 'glassdoor', label: 'Glassdoor', icon: '🚪' },
  { value: 'all', label: 'All Sources', icon: '🌐' },
];

const DATE_OPTIONS = [
  { value: 'past24Hours', label: 'Last 24 hours' },
  { value: 'pastWeek', label: 'Past week' },
  { value: 'pastMonth', label: 'Past month' },
  { value: 'any', label: 'Any time' },
];

const QUICK_SEARCHES = [
  'Video Editor',
  'Motion Designer',
  'Content Creator',
  'Video Producer',
  'Post Production',
  'VFX Artist',
];

export function JobSearch({ onSearch, isSearching }: JobSearchProps) {
  const [query, setQuery] = useState('Video Editor');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState<'linkedin' | 'indeed' | 'glassdoor' | 'all'>('linkedin');
  const [datePosted, setDatePosted] = useState<'past24Hours' | 'pastWeek' | 'pastMonth' | 'any'>('pastWeek');
  const [limit, setLimit] = useState(50);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    await onSearch({
      query: query.trim(),
      location: location.trim(),
      source,
      datePosted,
      limit,
    });
  };

  const handleQuickSearch = (term: string) => {
    setQuery(term);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
          <Briefcase className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Search Job Posts</h2>
          <p className="text-sm text-gray-500">Find companies hiring for specific roles</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Main search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Job title, e.g. Video Editor, Motion Designer..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
          />
        </div>

        {/* Quick search chips */}
        <div className="flex flex-wrap gap-2">
          {QUICK_SEARCHES.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => handleQuickSearch(term)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                query === term
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
              }`}
            >
              {term}
            </button>
          ))}
        </div>

        {/* Location and source */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location (optional)"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
            />
          </div>

          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 appearance-none cursor-pointer"
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.icon} {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Advanced options toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          Advanced options
        </button>

        {/* Advanced options */}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                Date Posted
              </label>
              <select
                value={datePosted}
                onChange={(e) => setDatePosted(e.target.value as typeof datePosted)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              >
                {DATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Max Results
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              >
                <option value={25}>25 results</option>
                <option value={50}>50 results</option>
                <option value={100}>100 results</option>
                <option value={200}>200 results</option>
              </select>
            </div>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Find Job Posts
            </>
          )}
        </button>
      </form>

      {/* Info text */}
      <p className="mt-4 text-xs text-gray-500 text-center">
        Powered by Apify. Each search uses ~0.1-0.5 USD in compute credits depending on results.
      </p>
    </div>
  );
}
