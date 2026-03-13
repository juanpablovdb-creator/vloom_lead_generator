// =====================================================
// Leadflow Vloom - Personas view (tab below Tasks)
// =====================================================
// Target profiles for people enrichment (harvestapi/linkedin-company-employees).
// Company URL is taken from each lead record at enrichment time.

import { useState, useCallback, useRef, useEffect } from 'react';
import { Target, Plus, Pencil, Trash2, X, Loader2, ChevronDown } from 'lucide-react';
import { usePersonas, type CreatePersonaInput, type UpdatePersonaInput } from '@/hooks/usePersonas';
import type { Persona } from '@/types/database';

const FUNCTION_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— Any —' },
  { value: 'HR', label: 'HR' },
  { value: 'Engineering', label: 'Engineering' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Sales', label: 'Sales' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Operations', label: 'Operations' },
  { value: 'Product', label: 'Product' },
  { value: 'Design', label: 'Design' },
  { value: 'Customer Success', label: 'Customer Success' },
  { value: 'Legal', label: 'Legal' },
  { value: 'Executive', label: 'Executive' },
];

const SENIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'Intern', label: 'Intern' },
  { value: 'Entry-level', label: 'Entry-level' },
  { value: 'Individual Contributor', label: 'Individual Contributor' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Lead', label: 'Lead' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Senior Manager', label: 'Senior Manager' },
  { value: 'Director', label: 'Director' },
  { value: 'VP', label: 'VP' },
  { value: 'C-level', label: 'C-level' },
];

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
  'Mexico',
  'Brazil',
  'Argentina',
  'Colombia',
  'Australia',
  'India',
  'Singapore',
  'Japan',
];

function parseCommaList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

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
        className={`${className} flex items-center justify-between gap-2 text-left min-h-[42px] cursor-pointer border border-vloom-border rounded-lg px-3 py-2 text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent`}
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

interface PersonaFormModalProps {
  persona: Persona | null;
  onClose: () => void;
  onCreate: (input: CreatePersonaInput) => Promise<Persona>;
  onUpdate: (id: string, input: UpdatePersonaInput) => Promise<void>;
}

function PersonaFormModal({ persona, onClose, onCreate, onUpdate }: PersonaFormModalProps) {
  const isEdit = persona !== null;
  const [name, setName] = useState(persona?.name ?? '');
  const [persona_function, setPersona_function] = useState(persona?.persona_function ?? '');
  const [seniorities, setSeniorities] = useState<string[]>(() =>
    persona?.seniority ? parseCommaList(persona.seniority) : []
  );
  const [jobTitleKeywordsText, setJobTitleKeywordsText] = useState(
    (persona?.job_title_keywords ?? []).join(', ')
  );
  const [locations, setLocations] = useState<string[]>(persona?.locations ?? []);
  const [max_items, setMax_items] = useState(
    persona?.max_items != null ? String(persona.max_items) : ''
  );
  const [is_active, setIs_active] = useState(persona?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        const job_title_keywords = parseCommaList(jobTitleKeywordsText);
        const maxStr = String(max_items).trim();
        const maxItemsNum = maxStr ? parseInt(maxStr, 10) : null;
        if (maxStr && (isNaN(maxItemsNum!) || maxItemsNum! < 0)) {
          setError('Max items must be a positive number.');
          setSubmitting(false);
          return;
        }
        if (isEdit && persona) {
          await onUpdate(persona.id, {
            name: name.trim(),
            persona_function: persona_function.trim() || null,
            seniority: seniorities.length ? seniorities.join(', ') : null,
            job_title_keywords,
            locations: locations,
            max_items: maxItemsNum ?? null,
            is_active,
          });
        } else {
          await onCreate({
            name: name.trim(),
            persona_function: persona_function.trim() || null,
            seniority: seniorities.length ? seniorities.join(', ') : null,
            job_title_keywords,
            locations: locations,
            max_items: maxItemsNum ?? null,
            is_active,
          });
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save persona');
      } finally {
        setSubmitting(false);
      }
    },
    [
      isEdit,
      persona,
      name,
      persona_function,
      seniorities,
      jobTitleKeywordsText,
      locations,
      max_items,
      is_active,
      onCreate,
      onUpdate,
      onClose,
    ]
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-vloom-surface rounded-xl border border-vloom-border shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-vloom-border sticky top-0 bg-vloom-surface">
          <h2 className="text-lg font-semibold text-vloom-text">
            {isEdit ? 'Edit persona' : 'Add persona'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HR Director"
              required
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
              Function
            </label>
            <select
              value={persona_function}
              onChange={(e) => setPersona_function(e.target.value)}
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            >
              {[
                ...FUNCTION_OPTIONS,
                ...(persona_function &&
                !FUNCTION_OPTIONS.some((o) => o.value === persona_function)
                  ? [{ value: persona_function, label: persona_function }]
                  : []),
              ].map((opt) => (
                <option key={opt.value || 'any'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
              Seniority (optional)
            </label>
            <LocationsMultiSelect
              options={[
                ...SENIORITY_OPTIONS,
                ...seniorities.filter(
                  (s) => !SENIORITY_OPTIONS.some((o) => o.value === s)
                ).map((s) => ({ value: s, label: s })),
              ]}
              value={seniorities}
              onChange={setSeniorities}
              placeholder="Select one or more seniority levels"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
              Job title keywords (comma-separated)
            </label>
            <input
              type="text"
              value={jobTitleKeywordsText}
              onChange={(e) => setJobTitleKeywordsText(e.target.value)}
              placeholder="Talent Acquisition, Recruiting, People Lead"
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
              Locations (optional)
            </label>
            <LocationsMultiSelect
              options={LOCATION_OPTIONS.map((loc) => ({ value: loc, label: loc }))}
              value={locations}
              onChange={setLocations}
              placeholder="Select one or more locations"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
              Max items per run (optional)
            </label>
            <input
              type="number"
              min={0}
              value={max_items}
              onChange={(e) => setMax_items(e.target.value)}
              placeholder="e.g. 50"
              className="w-full px-3 py-2 border border-vloom-border rounded-lg text-sm text-vloom-text bg-vloom-bg focus:ring-2 focus:ring-vloom-accent/30 focus:border-vloom-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="persona-active"
              checked={is_active}
              onChange={(e) => setIs_active(e.target.checked)}
              className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent/30"
            />
            <label htmlFor="persona-active" className="text-sm text-vloom-text">
              Active (used when enriching companies)
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-vloom-muted hover:text-vloom-text rounded-lg border border-vloom-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-2 text-sm font-medium text-white bg-vloom-accent rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save' : 'Add persona'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PersonasView() {
  const {
    personas,
    isLoading,
    error,
    createPersona,
    updatePersona,
    deletePersona,
  } = usePersonas();
  const [modalPersona, setModalPersona] = useState<Persona | null | 'add'>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deletePersona(id);
        setConfirmDeleteId(null);
      } finally {
        setDeletingId(null);
      }
    },
    [deletePersona]
  );

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-vloom-text flex items-center gap-2">
            <Target className="w-5 h-5" />
            Personas
          </h1>
          <p className="text-sm text-vloom-muted mt-0.5">
            Target profiles for people enrichment. When you send companies to leads, we find people
            matching these personas (harvestapi/linkedin-company-employees). Company URL comes from
            each record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalPersona('add')}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-vloom-accent rounded-lg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Add persona
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-vloom-muted">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : personas.length === 0 ? (
        <div className="rounded-xl border border-vloom-border bg-vloom-surface/50 p-8 text-center">
          <Target className="w-12 h-12 text-vloom-muted mx-auto mb-3" />
          <p className="text-vloom-text font-medium">No personas yet</p>
          <p className="text-sm text-vloom-muted mt-1">
            Add a persona to define who to find at each company (function, seniority, job title).
          </p>
          <button
            type="button"
            onClick={() => setModalPersona('add')}
            className="mt-4 inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-vloom-accent border border-vloom-accent rounded-lg hover:bg-vloom-accent/10"
          >
            <Plus className="w-4 h-4" />
            Add persona
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {personas.map((p) => (
            <li
              key={p.id}
              className="bg-vloom-surface border border-vloom-border rounded-lg p-4 flex flex-wrap items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-vloom-text">{p.name}</span>
                  {!p.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded bg-vloom-muted/20 text-vloom-muted">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-vloom-muted">
                  {p.persona_function && (
                    <span>Function: {p.persona_function}</span>
                  )}
                  {p.seniority && <span>Seniority: {p.seniority}</span>}
                  {p.job_title_keywords?.length > 0 && (
                    <span>Titles: {p.job_title_keywords.join(', ')}</span>
                  )}
                  {p.locations?.length > 0 && (
                    <span>Locations: {p.locations.join(', ')}</span>
                  )}
                  {p.max_items != null && <span>Max: {p.max_items}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setModalPersona(p)}
                  className="p-2 rounded-md text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/50"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {confirmDeleteId === p.id ? (
                  <span className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    >
                      {deletingId === p.id ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded text-vloom-muted hover:text-vloom-text"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(p.id)}
                    className="p-2 rounded-md text-vloom-muted hover:text-red-400 hover:bg-red-500/10"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalPersona !== null && (
        <PersonaFormModal
          persona={modalPersona === 'add' ? null : modalPersona}
          onClose={() => setModalPersona(null)}
          onCreate={createPersona}
          onUpdate={updatePersona}
        />
      )}
    </div>
  );
}
