// =====================================================
// LEADFLOW - LeadsTable Component (Clay-style)
// =====================================================
import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
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
}

// Columnas por defecto
const DEFAULT_COLUMNS: TableColumn[] = [
  { key: 'is_marked_as_lead', label: 'Lead', visible: true, sortable: false },
  { key: 'company_name', label: 'Company', visible: true, sortable: true },
  { key: 'job_title', label: 'Job Title', visible: true, sortable: true },
  { key: 'contact_name', label: 'Contact', visible: true, sortable: true },
  { key: 'contact_email', label: 'Email', visible: true, sortable: false },
  { key: 'company_size', label: 'Size', visible: true, sortable: true },
  { key: 'company_industry', label: 'Industry', visible: true, sortable: true },
  { key: 'score', label: 'Score', visible: true, sortable: true },
  { key: 'status', label: 'Status', visible: true, sortable: true },
  { key: 'job_source', label: 'Source', visible: false, sortable: true },
  { key: 'created_at', label: 'Added', visible: false, sortable: true },
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
              {lead.is_shared ? 'Make Private' : 'Share with Team'}
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
}: LeadsTableProps) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

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
    const value = lead[column.key];

    switch (column.key) {
      case 'is_marked_as_lead':
        return (
          <button
            type="button"
            onClick={() => onMarkAsLead(lead, !lead.is_marked_as_lead)}
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
        const groupSize = groupSizeByLeadId[lead.id];
        const name = lead.company_name || '—';
        const nameWithCount = groupSize && groupSize > 1 ? `${name} (${groupSize})` : name;
        return (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-vloom-border/50 flex items-center justify-center text-xs font-medium text-vloom-muted">
              {(lead.company_name || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-vloom-text truncate max-w-[200px]">
                {nameWithCount}
              </div>
              {lead.company_url && (
                <a
                  href={lead.company_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-vloom-muted hover:text-vloom-accent flex items-center gap-1"
                >
                  {new URL(lead.company_url).hostname}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
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

      case 'created_at':
        return (
          <span className="text-sm text-vloom-muted">
            {new Date(value as string).toLocaleDateString()}
          </span>
        );

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
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-sm text-vloom-muted">
              {selectedIds.size} selected
            </span>
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
              <tr
                key={lead.id}
                className={`hover:bg-vloom-border/20 transition-colors ${
                  selectedIds.has(lead.id) ? 'bg-vloom-accent/10' : ''
                }`}
              >
                <td className="px-4 py-3">
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
