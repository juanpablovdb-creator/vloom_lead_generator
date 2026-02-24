// =====================================================
// Vloom Lead Generator - CRM card (Kanban)
// =====================================================
import { Check } from 'lucide-react';
import type { Lead } from '@/types/database';

interface CRMCardProps {
  lead: Lead;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onMarkAsLead?: (lead: Lead, value: boolean) => void;
}

export function CRMCard({ lead, onDragStart, onMarkAsLead }: CRMCardProps) {
  const title = lead.contact_name || lead.company_name || lead.job_title || 'No name';
  const sub = [lead.company_name, lead.job_title].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const subLine = sub.slice(0, 2).join(' · ') || null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      className="bg-vloom-surface border border-vloom-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-vloom-accent/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-vloom-text truncate">{title}</p>
          {subLine && <p className="text-xs text-vloom-muted truncate mt-0.5">{subLine}</p>}
        </div>
        {onMarkAsLead && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsLead(lead, !lead.is_marked_as_lead);
            }}
            className={`flex-shrink-0 p-1 rounded border transition-colors ${
              lead.is_marked_as_lead
                ? 'border-vloom-accent bg-vloom-accent/10 text-vloom-accent'
                : 'border-vloom-border hover:bg-vloom-border/30 text-vloom-muted'
            }`}
            title={lead.is_marked_as_lead ? 'Remove from leads' : 'Mark as lead'}
          >
            <Check className={`w-3.5 h-3.5 ${lead.is_marked_as_lead ? '' : 'opacity-40'}`} />
          </button>
        )}
      </div>
    </div>
  );
}
