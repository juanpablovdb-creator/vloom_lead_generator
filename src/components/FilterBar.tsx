// =====================================================
// LEADFLOW - FilterBar Component
// =====================================================
import React, { useState } from 'react';
import {
  Filter,
  X,
  ChevronDown,
  Check,
  Mail,
  Linkedin,
  Building2,
  Tag,
  Calendar,
  Sliders,
} from 'lucide-react';
import type { LeadFilters, LeadStatus } from '@/types/database';

interface FilterBarProps {
  filters: LeadFilters;
  onFilterChange: <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'not_contacted', label: 'Not contacted' },
  { value: 'invite_sent', label: 'Invite sent' },
  { value: 'connected', label: 'Connected' },
  { value: 'reply', label: 'Reply' },
  { value: 'positive_reply', label: 'Positive reply' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed', label: 'Closed' },
  { value: 'lost', label: 'Lost' },
];

const SOURCE_OPTIONS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'glassdoor', label: 'Glassdoor' },
];

const COMPANY_SIZE_OPTIONS = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

// Dropdown component reutilizable
function FilterDropdown({
  label,
  icon: Icon,
  options,
  selectedValues,
  onChange,
  multiSelect = true,
}: {
  label: string;
  icon: React.ElementType;
  options: { value: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  multiSelect?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (value: string) => {
    if (multiSelect) {
      if (selectedValues.includes(value)) {
        onChange(selectedValues.filter(v => v !== value));
      } else {
        onChange([...selectedValues, value]);
      }
    } else {
      onChange([value]);
      setIsOpen(false);
    }
  };

  const hasSelection = selectedValues.length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
          hasSelection
            ? 'border-vloom-accent/40 bg-vloom-accent/10 text-vloom-accent'
            : 'border-vloom-border bg-vloom-surface text-vloom-text hover:bg-vloom-bg'
        }`}
      >
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
        {hasSelection && (
          <span className="ml-1 px-1.5 py-0.5 bg-vloom-accent/10 text-vloom-accent rounded text-xs font-medium">
            {selectedValues.length}
          </span>
        )}
        <ChevronDown className="w-4 h-4 ml-1" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-2 w-56 bg-vloom-surface rounded-lg shadow-lg border border-vloom-border py-2 z-20 max-h-64 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleToggle(option.value)}
                className="w-full px-3 py-2 text-left text-sm text-vloom-text hover:bg-vloom-bg flex items-center justify-between"
              >
                <span className={selectedValues.includes(option.value) ? 'text-vloom-accent font-medium' : 'text-vloom-text'}>
                  {option.label}
                </span>
                {selectedValues.includes(option.value) && (
                  <Check className="w-4 h-4 text-vloom-accent" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Toggle button para filtros booleanos
function ToggleFilter({
  label,
  icon: Icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ElementType;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
}) {
  const getNextValue = () => {
    if (value === undefined) return true;
    if (value === true) return false;
    return undefined;
  };

  return (
    <button
      onClick={() => onChange(getNextValue())}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        value === true
          ? 'border-green-200 bg-green-50 text-green-700'
          : value === false
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-vloom-border bg-vloom-surface text-vloom-text hover:bg-vloom-bg'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">{label}</span>
      {value !== undefined && (
        <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${
          value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {value ? 'Yes' : 'No'}
        </span>
      )}
    </button>
  );
}

export function FilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  activeFilterCount,
}: FilterBarProps) {
  const [showScoreFilter, setShowScoreFilter] = useState(false);

  return (
    <div className="bg-vloom-surface rounded-xl border border-vloom-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-vloom-muted" />
          <span className="font-medium text-vloom-text">Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-vloom-accent/10 text-vloom-accent rounded-full text-xs font-medium">
              {activeFilterCount} active
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={onClearFilters}
            className="text-sm text-vloom-muted hover:text-vloom-text flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange('search', e.target.value || undefined)}
            placeholder="Search leads..."
            className="w-full pl-3 pr-8 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent bg-vloom-surface"
          />
          {filters.search && (
            <button
              onClick={() => onFilterChange('search', undefined)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-vloom-muted hover:text-vloom-text"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status dropdown */}
        <FilterDropdown
          label="Status"
          icon={Tag}
          options={STATUS_OPTIONS}
          selectedValues={filters.status || []}
          onChange={(values) => onFilterChange('status', values.length > 0 ? values as LeadStatus[] : undefined)}
        />

        {/* Source dropdown */}
        <FilterDropdown
          label="Source"
          icon={Building2}
          options={SOURCE_OPTIONS}
          selectedValues={filters.source || []}
          onChange={(values) => onFilterChange('source', values.length > 0 ? values : undefined)}
        />

        {/* Company size dropdown */}
        <FilterDropdown
          label="Company Size"
          icon={Building2}
          options={COMPANY_SIZE_OPTIONS}
          selectedValues={filters.company_size || []}
          onChange={(values) => onFilterChange('company_size', values.length > 0 ? values : undefined)}
        />

        {/* Has email toggle */}
        <ToggleFilter
          label="Has Email"
          icon={Mail}
          value={filters.has_email}
          onChange={(value) => onFilterChange('has_email', value)}
        />

        {/* Has LinkedIn toggle */}
        <ToggleFilter
          label="Has LinkedIn"
          icon={Linkedin}
          value={filters.has_linkedin}
          onChange={(value) => onFilterChange('has_linkedin', value)}
        />

        {/* Score filter */}
        <div className="relative">
          <button
            onClick={() => setShowScoreFilter(!showScoreFilter)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              filters.score_min !== undefined || filters.score_max !== undefined
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-vloom-border bg-vloom-surface text-vloom-text hover:bg-vloom-bg'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="text-sm font-medium">Score</span>
            {(filters.score_min !== undefined || filters.score_max !== undefined) && (
              <span className="ml-1 px-1.5 py-0.5 bg-vloom-accent/10 text-vloom-accent rounded text-xs font-medium">
                {filters.score_min ?? 0}-{filters.score_max ?? 100}
              </span>
            )}
            <ChevronDown className="w-4 h-4 ml-1" />
          </button>

          {showScoreFilter && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowScoreFilter(false)} />
              <div className="absolute left-0 mt-2 w-64 bg-vloom-surface rounded-lg shadow-lg border border-vloom-border p-4 z-20">
                <label className="block text-sm font-medium text-vloom-text mb-2">
                  Score Range
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={filters.score_min ?? ''}
                    onChange={(e) => onFilterChange('score_min', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Min"
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-surface"
                  />
                  <span className="text-vloom-muted">-</span>
                  <input
                    type="number"
                    value={filters.score_max ?? ''}
                    onChange={(e) => onFilterChange('score_max', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Max"
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-surface"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  {[
                    { label: '80+', min: 80, max: 100 },
                    { label: '60+', min: 60, max: 100 },
                    { label: '40+', min: 40, max: 100 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        onFilterChange('score_min', preset.min);
                        onFilterChange('score_max', preset.max);
                      }}
                      className="px-2 py-1 text-xs bg-vloom-border hover:bg-vloom-border rounded text-vloom-muted"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Show shared toggle */}
        <button
          onClick={() => onFilterChange('show_shared', !filters.show_shared)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            filters.show_shared
              ? 'border-vloom-accent/40 bg-vloom-accent/10 text-vloom-accent'
              : 'border-vloom-border bg-vloom-surface text-vloom-text hover:bg-vloom-bg'
          }`}
        >
          <span className="text-sm font-medium">Show Team Leads</span>
        </button>
      </div>
    </div>
  );
}
