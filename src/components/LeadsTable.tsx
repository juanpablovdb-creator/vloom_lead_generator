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
  X,
  Sparkles,
  Send,
  Trash2,
  Share2,
  Tag,
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
}

// Columnas por defecto
const DEFAULT_COLUMNS: TableColumn[] = [
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
  not_contacted: { label: 'Not contacted', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  invite_sent: { label: 'Invite sent', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  connected: { label: 'Connected', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  reply: { label: 'Reply', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  positive_reply: { label: 'Positive reply', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  negotiation: { label: 'Negotiation', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  closed: { label: 'Closed', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  lost: { label: 'Lost', className: 'bg-red-50 text-red-700 border-red-200' },
};

// Score badge coloreado
function ScoreBadge({ score }: { score: number }) {
  let colorClass = 'bg-gray-100 text-gray-600';
  
  if (score >= 80) {
    colorClass = 'bg-green-100 text-green-700';
  } else if (score >= 60) {
    colorClass = 'bg-emerald-100 text-emerald-700';
  } else if (score >= 40) {
    colorClass = 'bg-yellow-100 text-yellow-700';
  } else if (score >= 20) {
    colorClass = 'bg-orange-100 text-orange-700';
  }

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
        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
            <button
              onClick={() => { onGenerateEmail(); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-purple-500" />
              Generate Email
            </button>
            {lead.contact_email && (
              <button
                onClick={() => { onSendEmail(); setIsOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4 text-blue-500" />
                Send Email
              </button>
            )}
            <button
              onClick={() => { onEnrich(); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4 text-green-500" />
              Enrich Data
            </button>
            <button
              onClick={() => { onToggleShare(); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <Share2 className="w-4 h-4 text-indigo-500" />
              {lead.is_shared ? 'Make Private' : 'Share with Team'}
            </button>
            <hr className="my-1" />
            <div className="px-3 py-1 text-xs text-gray-500 uppercase">Change Status</div>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <button
                key={status}
                onClick={() => { onStatusChange(status as LeadStatus); setIsOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${lead.status === status ? 'bg-gray-50 font-medium' : ''}`}
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
      case 'company_name':
        return (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
              {(lead.company_name || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate max-w-[200px]">
                {lead.company_name || '—'}
              </div>
              {lead.company_url && (
                <a
                  href={lead.company_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
                >
                  {new URL(lead.company_url).hostname}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        );

      case 'contact_name':
        return (
          <div className="min-w-0">
            <div className="font-medium text-gray-900 truncate">
              {lead.contact_name || '—'}
            </div>
            {lead.contact_title && (
              <div className="text-xs text-gray-500 truncate max-w-[150px]">
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
                <span className="text-sm text-gray-600 truncate max-w-[180px]">
                  {lead.contact_email}
                </span>
              </>
            ) : (
              <span className="text-gray-400 text-sm">—</span>
            )}
            {lead.contact_linkedin_url && (
              <a
                href={lead.contact_linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700"
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
            <div className="text-sm text-gray-900 truncate max-w-[200px]">
              {lead.job_title || '—'}
            </div>
            {lead.job_url && (
              <a
                href={lead.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                View post <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        );

      case 'created_at':
        return (
          <span className="text-sm text-gray-600">
            {new Date(value as string).toLocaleDateString()}
          </span>
        );

      default:
        return (
          <span className="text-sm text-gray-600 truncate max-w-[150px] block">
            {value?.toString() || '—'}
          </span>
        );
    }
  };

  if (isLoading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Table header with column picker */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <span className="text-sm text-gray-600">
              {selectedIds.size} selected
            </span>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
          >
            <Filter className="w-4 h-4" />
            Columns
          </button>
          {showColumnPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColumnPicker(false)} />
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                {columns.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={() => toggleColumn(col.key as string)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{col.label}</span>
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
            <tr className="bg-gray-50/50">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={isAllSelected ? onClearSelection : onSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              {visibleColumns.map(column => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column)}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
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
          <tbody className="divide-y divide-gray-100">
            {leads.map(lead => (
              <tr
                key={lead.id}
                className={`hover:bg-gray-50/50 transition-colors ${
                  selectedIds.has(lead.id) ? 'bg-blue-50/50' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(lead.id)}
                    onChange={() => onToggleSelection(lead.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No leads found</h3>
          <p className="text-gray-500 text-center max-w-sm">
            Start by searching for job posts or adjust your filters to see more results.
          </p>
        </div>
      )}
    </div>
  );
}
