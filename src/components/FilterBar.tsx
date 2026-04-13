// =====================================================
// Leadflow Vloom - FilterBar Component
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
  Sliders,
  FolderOpen,
  Users,
  Building,
  Megaphone,
} from 'lucide-react';
import type { LeadFilters, LeadStatus, LeadViewBy } from '@/types/database';
import { useSavedSearches } from '@/hooks/useSavedSearches';
import { LEAD_CHANNEL_OPTIONS } from '@/lib/leadChannels';

interface FilterBarProps {
  filters: LeadFilters;
  onFilterChange: <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'not_contacted', label: 'Not contacted' },
  { value: 'invite_sent', label: 'First contact' },
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

const CHANNEL_OPTIONS = LEAD_CHANNEL_OPTIONS;

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
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-card text-foreground hover:bg-secondary/30'
        }`}
      >
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
        {hasSelection && (
          <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
            {selectedValues.length}
          </span>
        )}
        <ChevronDown className="w-4 h-4 ml-1" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-2 w-56 bg-card rounded-lg shadow-lg border border-border py-2 z-20 max-h-64 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleToggle(option.value)}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary/30 flex items-center justify-between"
              >
                <span className={selectedValues.includes(option.value) ? 'text-primary font-medium' : 'text-foreground'}>
                  {option.label}
                </span>
                {selectedValues.includes(option.value) && (
                  <Check className="w-4 h-4 text-primary" />
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
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : value === false
          ? 'border-destructive/40 bg-destructive/10 text-foreground'
          : 'border-border bg-card text-foreground hover:bg-secondary/30'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">{label}</span>
      {value !== undefined && (
        <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${
          value ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
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
  const { savedSearches } = useSavedSearches();
  const [showSavedSearchDropdown, setShowSavedSearchDropdown] = useState(false);
  const [showViewByDropdown, setShowViewByDropdown] = useState(false);
  const [showScoreFilter, setShowScoreFilter] = useState(false);

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium text-foreground">Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
              {activeFilterCount} active
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={onClearFilters}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
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
            className="w-full pl-3 pr-8 py-2 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 bg-secondary"
          />
          {filters.search && (
            <button
              onClick={() => onFilterChange('search', undefined)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

        {/* Ver por: compañías o personas */}
        <div className="relative">
          <button
            onClick={() => setShowViewByDropdown(!showViewByDropdown)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              filters.view_by
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-card text-foreground hover:bg-secondary/30'
            }`}
          >
            {filters.view_by === 'company' ? (
              <Building className="w-4 h-4" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {filters.view_by === 'company' ? 'By companies' : 'By people'}
            </span>
            <ChevronDown className="w-4 h-4 ml-1" />
          </button>
          {showViewByDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowViewByDropdown(false)} />
              <div className="absolute left-0 mt-2 w-44 bg-card rounded-lg shadow-lg border border-border py-2 z-20">
                <button
                  onClick={() => {
                    onFilterChange('view_by', 'person' as LeadViewBy);
                    setShowViewByDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                    filters.view_by !== 'company' ? 'text-primary font-medium bg-primary/10' : 'text-foreground hover:bg-secondary/30'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  By people
                </button>
                <button
                  onClick={() => {
                    onFilterChange('view_by', 'company' as LeadViewBy);
                    setShowViewByDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                    filters.view_by === 'company' ? 'text-primary font-medium bg-primary/10' : 'text-foreground hover:bg-secondary/30'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  By companies
                </button>
              </div>
            </>
          )}
        </div>

        {/* Saved search filter: single select */}
        <div className="relative">
          <button
            onClick={() => setShowSavedSearchDropdown(!showSavedSearchDropdown)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              filters.saved_search_id
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-card text-foreground hover:bg-secondary/30'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span className="text-sm font-medium">
              {filters.saved_search_id
                ? savedSearches.find((s) => s.id === filters.saved_search_id)?.name ?? 'Saved search'
                : 'Saved search'}
            </span>
            <ChevronDown className="w-4 h-4 ml-1" />
          </button>
          {showSavedSearchDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSavedSearchDropdown(false)} />
              <div className="absolute left-0 mt-2 w-56 bg-card rounded-lg shadow-lg border border-border py-2 z-20 max-h-64 overflow-y-auto">
                <button
                  onClick={() => {
                    onFilterChange('saved_search_id', undefined);
                    setShowSavedSearchDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary/30"
                >
                  All
                </button>
                {savedSearches.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onFilterChange('saved_search_id', s.id);
                      setShowSavedSearchDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between ${
                      filters.saved_search_id === s.id ? 'text-primary font-medium bg-primary/10' : 'text-foreground hover:bg-secondary/30'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    {filters.saved_search_id === s.id && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Source dropdown */}
        <FilterDropdown
          label="Source"
          icon={Building2}
          options={SOURCE_OPTIONS}
          selectedValues={filters.source || []}
          onChange={(values) => onFilterChange('source', values.length > 0 ? values : undefined)}
        />

        {/* Channel dropdown */}
        <FilterDropdown
          label="Channel"
          icon={Megaphone}
          options={CHANNEL_OPTIONS}
          selectedValues={filters.channel || []}
          onChange={(values) => onFilterChange('channel', values.length > 0 ? values : undefined)}
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

        {/* Only rows user marked as lead */}
        <ToggleFilter
          label="Leads only"
          icon={FolderOpen}
          value={filters.marked_as_lead_only}
          onChange={(value) => onFilterChange('marked_as_lead_only', value === true ? true : undefined)}
        />

        {/* Score filter */}
        <div className="relative">
          <button
            onClick={() => setShowScoreFilter(!showScoreFilter)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              filters.score_min !== undefined || filters.score_max !== undefined
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-card text-foreground hover:bg-secondary/30'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="text-sm font-medium">Score</span>
            {(filters.score_min !== undefined || filters.score_max !== undefined) && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
                {filters.score_min ?? 0}-{filters.score_max ?? 100}
              </span>
            )}
            <ChevronDown className="w-4 h-4 ml-1" />
          </button>

          {showScoreFilter && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowScoreFilter(false)} />
              <div className="absolute left-0 mt-2 w-64 bg-card rounded-lg shadow-lg border border-border p-4 z-20">
                <label className="block text-sm font-medium text-foreground mb-2">
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
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-secondary"
                  />
                  <span className="text-muted-foreground">-</span>
                  <input
                    type="number"
                    value={filters.score_max ?? ''}
                    onChange={(e) => onFilterChange('score_max', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="Max"
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm text-foreground bg-secondary"
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
                      className="px-2 py-1 text-xs bg-secondary hover:bg-secondary/70 rounded text-muted-foreground"
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
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-card text-foreground hover:bg-secondary/30'
          }`}
        >
          <span className="text-sm font-medium">Show shared leads</span>
        </button>
      </div>
    </div>
  );
}
