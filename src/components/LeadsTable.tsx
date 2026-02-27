// =====================================================
// Leadflow Vloom - LeadsTable Component (Clay-style)
// =====================================================
import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MoreHorizontal,
  Mail,
  Linkedin,
  ExternalLink,
  Check,
  Sparkles,
  Send,
  Trash2,
  Share2,
  Filter,
  Search,
  RefreshCw,
} from 'lucide-react';
import type { Lead, LeadStatus, LeadSort, TableColumn } from '@/types/database';

interface LeadsTableProps {
  leads: Lead[];
  isLoading: boolean;
  sort: LeadSort;
  onSortChange: (sort: LeadSort) => void;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  isAllSelected: boolean;
  onGenerateEmail: (lead: Lead) => void;
  onSendEmail: (lead: Lead) => void;
  onEnrich: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onToggleShare: (lead: Lead) => void;
  onViewDetails: (lead: Lead) => void;
  onMarkAsLead: (lead: Lead, value: boolean) => void;
  /** When viewing by company, number of leads (contacts) in that company group. */
  groupSizeByLeadId?: Record<string, number>;
  /** Optional action to show in the header when there are selected rows (e.g. "Send to leads" button). */
  selectionAction?: React.ReactNode;
}

// Default columns (enriched company fields + enrichment_data columns)
const DEFAULT_COLUMNS: TableColumn[] = [
  { key: 'company_name', label: 'Company', visible: true, sortable: true },
  { key: 'job_title', label: 'Job Title', visible: true, sortable: true },
  { key: 'company_size', label: 'Size', visible: true, sortable: true },
  { key: 'company_industry', label: 'Industry', visible: true, sortable: true },
  { key: 'company_location', label: 'Location', visible: true, sortable: false },
  { key: 'company_url', label: 'Website', visible: true, sortable: false },
  { key: 'company_description', label: 'Company description', visible: true, sortable: false },
  { key: 'enrichment_followerCount', label: 'Followers', visible: true, sortable: false },
  { key: 'enrichment_foundedOn', label: 'Founded', visible: true, sortable: false },
  { key: 'enrichment_employeeCountRange', label: 'Employee range', visible: true, sortable: false },
  { key: 'enrichment_tagline', label: 'Tagline', visible: true, sortable: false },
  { key: 'enrichment_phone', label: 'Phone', visible: true, sortable: false },
  { key: 'contact_name', label: 'Contact', visible: true, sortable: true },
  { key: 'contact_email', label: 'Email', visible: true, sortable: false },
  { key: 'score', label: 'Score', visible: true, sortable: true },
  { key: 'status', label: 'Status', visible: true, sortable: true },
  { key: 'job_source', label: 'Source', visible: false, sortable: true },
  { key: 'last_enriched_at', label: 'Enriched', visible: true, sortable: true },
  { key: 'created_at', label: 'Imported', visible: true, sortable: true },
];

// Status badges (CRM pipeline)
const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  backlog: { label: 'Backlog', className: 'bg-vloom-border/50 text-vloom-muted border-vloom-border' },
  not_contacted: { label: 'Not contacted', className: 'bg-vloom-border/50 text-vloom-muted border-vloom-border' },
  invite_sent: { label: 'Invite sent', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  connected: { label: 'Connected', className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  reply: { label: 'Reply', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  positive_reply: { label: 'Positive reply', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  negotiation: { label: 'Negotiation', className: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  closed: { label: 'Closed', className: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  lost: { label: 'Lost', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

// Score badge (dark-mode friendly)
function ScoreBadge({ score }: { score: number }) {
  let colorClass = 'bg-vloom-border/50 text-vloom-muted';
  if (score >= 80) colorClass = 'bg-emerald-500/20 text-emerald-400';
  else if (score >= 60) colorClass = 'bg-emerald-500/15 text-emerald-300';
  else if (score >= 40) colorClass = 'bg-amber-500/20 text-amber-400';
  else if (score >= 20) colorClass = 'bg-orange-500/20 text-orange-400';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {score.toFixed(0)}
    </span>
  );
}

// Status badge
function StatusBadge({ status }: { status: LeadStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'bg-vloom-border/50 text-vloom-muted border-vloom-border' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}

/** Format enrichment_data values for display (e.g. foundedOn {year,month,day} -> "2015", employeeCountRange {start,end} -> "11-50"). */
function formatEnrichmentValue(key: string, v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x !== null && 'name' in x ? (x as { name: string }).name : String(x))).join(', ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (key === 'foundedOn' && ('year' in o || 'month' in o)) {
      const y = o.year;
      const m = o.month;
      const d = o.day;
      if (y != null && m != null && d != null) return `${String(d).padStart(2, '0')}/${String(Number(m) + 1).padStart(2, '0')}/${y}`;
      if (y != null && m != null) return `${Number(m) + 1}/${y}`;
      if (y != null) return String(y);
      return '';
    }
    if (key === 'employeeCountRange' && ('start' in o || 'end' in o)) {
      const start = o.start;
      const end = o.end;
      if (start != null && end != null) return `${start}–${end}`;
      if (start != null) return `${start}+`;
      if (end != null) return `≤${end}`;
      return '';
    }
    return JSON.stringify(v);
  }
  return String(v);
}

// Card expandida: misma info en vertical a la izquierda, actividad a la derecha
function LeadRowCard({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const rawCompany = lead.company_name;
  const companyStr =
    rawCompany == null || rawCompany === '' || rawCompany === '{}' || (typeof rawCompany === 'object' && Object.keys(rawCompany).length === 0)
      ? ''
      : typeof rawCompany === 'string'
        ? rawCompany.trim()
        : String(rawCompany).trim();
  const contactStr = typeof lead.contact_name === 'string' ? lead.contact_name.trim() : '';
  const jobStr = typeof lead.job_title === 'string' ? lead.job_title.trim() : '';
  const displayName = companyStr || contactStr || jobStr || '—';
  const formatDate = (s: string | null) =>
    s ? new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const industryDisplay =
    typeof lead.company_industry === 'string' && lead.company_industry.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(lead.company_industry);
            return typeof parsed === 'object' && parsed !== null && 'name' in parsed ? String(parsed.name) : lead.company_industry;
          } catch {
            return lead.company_industry;
          }
        })()
      : lead.company_industry || '—';

  const activityItems: { label: string; date: string }[] = [];
  if (lead.created_at) activityItems.push({ label: 'Lead imported', date: formatDate(lead.created_at) });
  if (lead.last_enriched_at) activityItems.push({ label: 'Enriched', date: formatDate(lead.last_enriched_at) });
  if (lead.updated_at) activityItems.push({ label: 'Last updated', date: formatDate(lead.updated_at) });
  if (activityItems.length === 0) activityItems.push({ label: 'No activity', date: '' });

  // Extra enrichment fields from LinkedIn Company actor (enrichment_data)
  const enrich = lead.enrichment_data as Record<string, unknown> | null | undefined;
  const enrichmentDisplayKeys: { key: string; label: string }[] = [
    { key: 'tagline', label: 'Tagline' },
    { key: 'followerCount', label: 'Follower count' },
    { key: 'foundedOn', label: 'Founded' },
    { key: 'employeeCountRange', label: 'Employee count range' },
    { key: 'phone', label: 'Phone' },
    { key: 'specialities', label: 'Specialities' },
    { key: 'fundingData', label: 'Funding data' },
    { key: 'callToActionUrl', label: 'Call to action URL' },
    { key: 'jobSearchUrl', label: 'Job search URL' },
    { key: 'universalName', label: 'Universal name' },
    { key: 'pageType', label: 'Page type' },
    { key: 'pageVerified', label: 'Page verified' },
  ];
  const enrichmentRows =
    enrich && typeof enrich === 'object'
      ? enrichmentDisplayKeys
          .map(({ key, label }) => {
            const v = enrich[key];
            const strVal = formatEnrichmentValue(key, v);
            if (strVal === '') return null;
            return { label, value: strVal.length > 200 ? `${strVal.slice(0, 200)}…` : strVal };
          })
          .filter(Boolean) as { label: string; value: string }[]
      : [];

  const field = (label: string, value: React.ReactNode) => (
    <div className="py-2 border-b border-vloom-border/50 last:border-0">
      <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm text-vloom-text">{value ?? '—'}</div>
    </div>
  );

  return (
    <div className="flex border-t border-vloom-border bg-vloom-surface">
      <div className="flex-1 min-w-0 p-4 overflow-y-auto max-h-[420px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-vloom-text truncate">{displayName}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded border border-vloom-border hover:bg-vloom-border/50 text-vloom-muted hover:text-vloom-text"
            title="Close"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-0">
          {field('Company', companyStr || '—')}
          {field('Job Title', lead.job_title)}
          {field('Size', lead.company_size)}
          {field('Industry', industryDisplay)}
          {field('Location', lead.company_location)}
          {field('Website', lead.company_url ? (
            <a href={lead.company_url} target="_blank" rel="noopener noreferrer" className="text-vloom-accent hover:underline">
              {lead.company_url}
            </a>
          ) : null)}
          {field('Company description', lead.company_description ? (
            <p className="text-sm text-vloom-text whitespace-pre-wrap">{lead.company_description}</p>
          ) : null)}
          {field('Contact', lead.contact_name)}
          {field('Email', lead.contact_email)}
          {field('Score', <ScoreBadge score={lead.score} />)}
          {field('Status', <StatusBadge status={lead.status} />)}
          {field('Enriched', lead.last_enriched_at ? formatDate(lead.last_enriched_at) : null)}
          {field('Imported', lead.created_at ? formatDate(lead.created_at) : null)}
          {enrichmentRows.length > 0 && (
            <div className="pt-2 mt-2 border-t border-vloom-border">
              <div className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-2">Enrichment details</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {enrichmentRows.map((row) => (
                  <div key={row.label} className="min-w-0">
                    <div className="text-xs text-vloom-muted truncate">{row.label}</div>
                    <div className="text-sm text-vloom-text break-words">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="w-72 flex-shrink-0 border-l border-vloom-border p-4 bg-vloom-border/10">
        <h4 className="text-xs font-medium text-vloom-muted uppercase tracking-wider mb-3">Activity</h4>
        <ul className="space-y-3">
          {activityItems.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-vloom-accent/60 mt-1.5" />
              <div>
                <div className="text-vloom-text font-medium">{item.label}</div>
                {item.date ? <div className="text-xs text-vloom-muted">{item.date}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Dropdown menu para acciones
function ActionMenu({ 
  lead, 
  onGenerateEmail,
  onSendEmail,
  onEnrich,
  onDelete,
  onStatusChange,
  onToggleShare,
}: {
  lead: Lead;
  onGenerateEmail: () => void;
  onSendEmail: () => void;
  onEnrich: () => void;
  onDelete: () => void;
  onStatusChange: (status: LeadStatus) => void;
  onToggleShare: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded hover:bg-vloom-border/50 text-vloom-muted hover:text-vloom-text"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-1 w-48 bg-vloom-surface rounded-lg shadow-lg border border-vloom-border py-1 z-20">
            <button
              onClick={() => { onGenerateEmail(); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-vloom-border/30 text-vloom-text flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-purple-500" />
              Generate Email
            </button>
            {lead.contact_email && (
              <button
                onClick={() => { onSendEmail(); setIsOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-vloom-border/30 text-vloom-text flex items-center gap-2"
              >
                <Send className="w-4 h-4 text-blue-500" />
                Send Email
              </button>
            )}
            <button
              onClick={() => { onEnrich(); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-vloom-border/30 text-vloom-text flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4 text-green-500" />
              Enrich Data
            </button>
            <button
              onClick={() => { onToggleShare(); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-vloom-border/30 text-vloom-text flex items-center gap-2"
            >
              <Share2 className="w-4 h-4 text-indigo-500" />
              {lead.is_shared ? 'Make Private' : 'Share'}
            </button>
            <hr className="my-1" />
            <div className="px-3 py-1 text-xs text-vloom-muted uppercase">Change Status</div>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <button
                key={status}
                onClick={() => { onStatusChange(status as LeadStatus); setIsOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-vloom-border/30 ${lead.status === status ? 'bg-vloom-accent/15 font-medium text-vloom-accent' : 'text-vloom-text'}`}
              >
                {config.label}
              </button>
            ))}
            <hr className="my-1" />
            <button
              onClick={() => { onDelete(); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function LeadsTable({
  leads,
  isLoading,
  sort,
  onSortChange,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  isAllSelected,
  onGenerateEmail,
  onSendEmail,
  onEnrich,
  onDelete,
  onStatusChange,
  onToggleShare,
  onViewDetails,
  onMarkAsLead,
  groupSizeByLeadId = {},
  selectionAction,
}: LeadsTableProps) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [expandedRowLeadId, setExpandedRowLeadId] = useState<string | null>(null);

  const visibleColumns = useMemo(
    () => columns.filter(col => col.visible),
    [columns]
  );

  const toggleColumn = (key: string) => {
    setColumns(cols =>
      cols.map(col =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const handleSort = (column: TableColumn) => {
    if (!column.sortable) return;
    
    onSortChange({
      column: column.key,
      direction: sort.column === column.key && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  const renderCell = (lead: Lead, column: TableColumn) => {
    if (typeof column.key === 'string' && column.key.startsWith('enrichment_')) {
      const enrichKey = column.key.replace('enrichment_', '');
      const enrich = lead.enrichment_data as Record<string, unknown> | null | undefined;
      const v = enrich?.[enrichKey];
      const str = formatEnrichmentValue(enrichKey, v);
      return (
        <span className="text-sm text-vloom-text truncate block max-w-[180px]" title={str || undefined}>
          {str || '—'}
        </span>
      );
    }

    const value = lead[column.key as keyof Lead];

    switch (column.key) {
      case 'is_marked_as_lead':
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsLead(lead, !lead.is_marked_as_lead);
            }}
            className={`p-1.5 rounded border transition-colors ${
              lead.is_marked_as_lead
                ? 'border-vloom-accent bg-vloom-accent/10 text-vloom-accent'
                : 'border-vloom-border bg-vloom-surface hover:bg-vloom-border/30 text-vloom-muted'
            }`}
            title={lead.is_marked_as_lead ? 'Remove from leads' : 'Mark as lead'}
          >
            <Check className={`w-4 h-4 ${lead.is_marked_as_lead ? '' : 'opacity-40'}`} />
          </button>
        );

      case 'company_name': {
        // Same fallback as CRMCard so list and Kanban show the same “name”
        const rawCompany = lead.company_name;
        const companyStr =
          rawCompany == null || rawCompany === '' || rawCompany === '{}' || (typeof rawCompany === 'object' && Object.keys(rawCompany).length === 0)
            ? ''
            : typeof rawCompany === 'string'
              ? rawCompany.trim()
              : String(rawCompany).trim();
        const contactStr = typeof lead.contact_name === 'string' ? lead.contact_name.trim() : '';
        const jobStr = typeof lead.job_title === 'string' ? lead.job_title.trim() : '';
        const nameStr = companyStr || contactStr || jobStr || '';
        const name = nameStr || '—';
        const groupSize = groupSizeByLeadId[lead.id];
        const nameWithCount = groupSize && groupSize > 1 ? `${name} (${groupSize})` : name;
        const initial = nameStr ? nameStr[0].toUpperCase() : '?';
        return (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-vloom-border/50 flex items-center justify-center text-xs font-medium text-vloom-muted">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-vloom-text truncate max-w-[200px]">
                {nameWithCount}
              </div>
              {lead.company_url && (() => {
                try {
                  const url = new URL(lead.company_url);
                  return (
                    <a
                      href={lead.company_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-vloom-muted hover:text-vloom-accent flex items-center gap-1"
                    >
                      {url.hostname}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  );
                } catch {
                  const href = String(lead.company_url || '').trim();
                  if (href.startsWith('http://') || href.startsWith('https://')) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-vloom-muted hover:text-vloom-accent flex items-center gap-1"
                      >
                        Link <ExternalLink className="w-3 h-3" />
                      </a>
                    );
                  }
                  return null;
                }
              })()}
            </div>
          </div>
        );
      }

      case 'company_industry': {
        const raw = lead.company_industry;
        if (!raw) return <span className="text-sm text-vloom-muted">—</span>;
        let display: string;
        if (typeof raw === 'string' && raw.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(raw) as { name?: string };
            display = parsed?.name ?? raw;
          } catch {
            display = raw;
          }
        } else {
          display = String(raw);
        }
        return (
          <span className="text-sm text-vloom-text truncate max-w-[180px] block" title={display}>
            {display || '—'}
          </span>
        );
      }

      case 'company_location':
        return (
          <span className="text-sm text-vloom-muted truncate max-w-[200px] block" title={lead.company_location ?? ''}>
            {lead.company_location || '—'}
          </span>
        );

      case 'company_url':
        if (!lead.company_url) return <span className="text-sm text-vloom-muted">—</span>;
        try {
          const url = new URL(lead.company_url);
          return (
            <a
              href={lead.company_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-vloom-accent hover:underline truncate max-w-[180px] block"
            >
              {url.hostname}
              <ExternalLink className="w-3 h-3 inline ml-0.5" />
            </a>
          );
        } catch {
          return (
            <a
              href={lead.company_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-vloom-accent hover:underline truncate max-w-[180px] block"
            >
              Link <ExternalLink className="w-3 h-3 inline ml-0.5" />
            </a>
          );
        }

      case 'company_description': {
        const desc = lead.company_description;
        const hasContent = desc && String(desc).trim().length > 0;
        const descStr = hasContent ? String(desc).trim() : '';
        const previewMaxChars = 80;
        const preview = descStr.length <= previewMaxChars ? descStr : descStr.slice(0, previewMaxChars) + '…';
        return (
          <span className="text-xs text-vloom-text truncate block max-w-[280px]" title={descStr || undefined}>
            {descStr ? preview : '—'}
          </span>
        );
      }

      case 'last_enriched_at': {
        const date = lead.last_enriched_at ? new Date(lead.last_enriched_at) : null;
        return (
          <span className="text-sm text-vloom-muted">
            {date ? date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
          </span>
        );
      }

      case 'contact_name':
        return (
          <div className="min-w-0">
            <div className="font-medium text-vloom-text truncate">
              {lead.contact_name || '—'}
            </div>
            {lead.contact_title && (
              <div className="text-xs text-vloom-muted truncate max-w-[150px]">
                {lead.contact_title}
              </div>
            )}
          </div>
        );

      case 'contact_email':
        return (
          <div className="flex items-center gap-2">
            {lead.contact_email ? (
              <>
                <Mail className="w-4 h-4 text-green-500" />
                <span className="text-sm text-vloom-text truncate max-w-[180px]">
                  {lead.contact_email}
                </span>
              </>
            ) : (
              <span className="text-vloom-muted text-sm">—</span>
            )}
            {lead.contact_linkedin_url && (
              <a
                href={lead.contact_linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-vloom-accent hover:opacity-90"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            )}
          </div>
        );

      case 'score':
        return <ScoreBadge score={lead.score} />;

      case 'status':
        return <StatusBadge status={lead.status} />;

      case 'job_title':
        return (
          <div className="min-w-0">
            <div className="text-sm text-vloom-text truncate max-w-[200px]">
              {lead.job_title || '—'}
            </div>
            {lead.job_url && (
              <a
                href={lead.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-vloom-accent hover:underline flex items-center gap-1"
              >
                View post <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        );

      case 'created_at': {
        const date = value ? new Date(value as string) : null;
        const isNew =
          date && (Date.now() - date.getTime() < 48 * 60 * 60 * 1000);
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-vloom-muted">
              {date ? date.toLocaleDateString(undefined, { dateStyle: 'short' }) : '—'}
            </span>
            {isNew && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-vloom-accent/20 text-vloom-accent">
                New
              </span>
            )}
          </div>
        );
      }

      default:
        return (
          <span className="text-sm text-vloom-muted truncate max-w-[150px] block">
            {value?.toString() || '—'}
          </span>
        );
    }
  };

  if (isLoading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vloom-accent" />
      </div>
    );
  }

  return (
    <div className="bg-vloom-surface rounded-xl border border-vloom-border overflow-hidden">
      {/* Table header with column picker */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-vloom-border bg-vloom-border/20">
        <div className="flex items-center gap-3 flex-wrap">
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm font-medium text-vloom-text">
                {selectedIds.size} selected
              </span>
              {selectionAction}
            </>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-vloom-muted hover:text-vloom-text hover:bg-vloom-border/50 rounded-md"
          >
            <Filter className="w-4 h-4" />
            Columns
          </button>
          {showColumnPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColumnPicker(false)} />
              <div className="absolute right-0 mt-1 w-48 bg-vloom-surface rounded-lg shadow-lg border border-vloom-border py-2 z-20">
                {columns.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-vloom-border/30 cursor-pointer text-vloom-text"
                  >
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={() => toggleColumn(col.key as string)}
                      className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent"
                    />
                    <span className="text-sm">{col.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-vloom-border/20">
              <th className="w-9 px-2 py-3" aria-label="Expandir fila" />
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={isAllSelected ? onClearSelection : onSelectAll}
                  className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent"
                />
              </th>
              {visibleColumns.map(column => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column)}
                  className={`px-4 py-3 text-left text-xs font-medium text-vloom-muted uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-vloom-border/30' : ''
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {column.sortable && sort.column === column.key && (
                      sort.direction === 'asc' 
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-vloom-border">
            {leads.map(lead => (
              <React.Fragment key={lead.id}>
                <tr
                  className={`hover:bg-vloom-border/20 transition-colors ${
                    selectedIds.has(lead.id) ? 'bg-vloom-accent/10' : ''
                  }`}
                >
                  <td className="w-9 px-2 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setExpandedRowLeadId(prev => prev === lead.id ? null : lead.id)}
                      className="p-1 rounded hover:bg-vloom-border/50 text-vloom-muted hover:text-vloom-text"
                      title={expandedRowLeadId === lead.id ? 'Cerrar' : 'Ver detalle'}
                    >
                      {expandedRowLeadId === lead.id ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => onToggleSelection(lead.id)}
                      className="rounded border-vloom-border text-vloom-accent focus:ring-vloom-accent"
                    />
                  </td>
                  {visibleColumns.map(column => (
                    <td
                      key={column.key}
                      className="px-4 py-3 cursor-pointer"
                      onClick={() => onViewDetails(lead)}
                    >
                      {renderCell(lead, column)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <ActionMenu
                      lead={lead}
                      onGenerateEmail={() => onGenerateEmail(lead)}
                      onSendEmail={() => onSendEmail(lead)}
                      onEnrich={() => onEnrich(lead)}
                      onDelete={() => onDelete(lead)}
                      onStatusChange={(status) => onStatusChange(lead, status)}
                      onToggleShare={() => onToggleShare(lead)}
                    />
                  </td>
                </tr>
                {expandedRowLeadId === lead.id && (
                  <tr className="bg-vloom-border/10">
                    <td colSpan={2 + visibleColumns.length + 1} className="p-0 align-top">
                      <LeadRowCard lead={lead} onClose={() => setExpandedRowLeadId(null)} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {leads.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className="w-16 h-16 rounded-full bg-vloom-border/30 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-vloom-muted" />
          </div>
          <h3 className="text-lg font-medium text-vloom-text mb-1">No leads found</h3>
          <p className="text-vloom-muted text-center max-w-sm">
            Start by searching for job posts or adjust your filters to see more results.
          </p>
        </div>
      )}

    </div>
  );
}
