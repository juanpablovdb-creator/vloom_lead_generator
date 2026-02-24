// =====================================================
// LEADFLOW - Search Configuration Page
// =====================================================
// Los parámetros de cada Actor se definen aquí y deben coincidir
// con los inputs del Actor de Apify correspondiente.
// Documentación: https://apify.com/store
// =====================================================

import React, { useState } from 'react';
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
} from 'lucide-react';
import type { LeadSource } from './HomePage';

// =====================================================
// APIFY ACTOR INPUT SCHEMAS
// Estos parámetros deben coincidir con los inputs de cada Actor
// Referencia: https://apify.com/{actor-id}/input-schema
// =====================================================

interface ActorInputField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'location';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
  helpText?: string;
  icon?: React.ReactNode;
}

// Configuración de inputs por Actor de Apify
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
      type: 'text',
      placeholder: 'United States, Remote, New York...',
      required: false,
      helpText: 'Optional. Separate multiple with commas. Use full names (e.g. United Kingdom).',
      icon: <MapPin className="w-4 h-4" />,
    },
    {
      key: 'postedLimit',
      label: 'Date posted',
      type: 'select',
      options: [
        { value: 'Past 24 hours', label: 'Past 24 hours' },
        { value: 'Past Week', label: 'Past week' },
        { value: 'Past Month', label: 'Past month' },
      ],
      defaultValue: 'Past 24 hours',
      helpText: 'Only jobs posted in this period (ideal for daily run).',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      key: 'maxItems',
      label: 'Max results',
      type: 'number',
      placeholder: '24',
      defaultValue: 24,
      helpText: 'Maximum number of jobs to fetch (e.g. 24 for daily run).',
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

interface SearchConfigPageProps {
  source: LeadSource;
  onBack: () => void;
  onSearch: (source: LeadSource, params: Record<string, unknown>) => Promise<void>;
}

export function SearchConfigPage({ source, onBack, onSearch }: SearchConfigPageProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const inputSchema = ACTOR_INPUT_SCHEMAS[source.apifyActorId] || [];

  // Initialize default values
  React.useEffect(() => {
    const defaults: Record<string, unknown> = {};
    inputSchema.forEach((field) => {
      if (field.defaultValue !== undefined) {
        defaults[field.key] = field.defaultValue;
      }
    });
    setFormData(defaults);
  }, [source.apifyActorId]);

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

        <div className="mt-8 p-4 bg-vloom-border/30 rounded-xl">
          <p className="text-xs text-vloom-muted font-mono">
            Inputs map to the Apify Actor schema.{' '}
            <a
              href={`https://apify.com/${source.apifyActorId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-vloom-accent hover:underline"
            >
              View Actor →
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
