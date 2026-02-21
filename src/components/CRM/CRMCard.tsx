// =====================================================
// Vloom Lead Generator - CRM card (Kanban)
// =====================================================
import type { Lead } from '@/types/database';

interface CRMCardProps {
  lead: Lead;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
}

export function CRMCard({ lead, onDragStart }: CRMCardProps) {
  const title = lead.contact_name || lead.company_name || lead.job_title || 'Sin nombre';
  const sub = [lead.company_name, lead.job_title].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const subLine = sub.slice(0, 2).join(' · ') || null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      className="bg-vloom-surface border border-vloom-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-vloom-accent/40 transition-colors"
    >
      <p className="text-sm font-medium text-vloom-text truncate">{title}</p>
      {subLine && <p className="text-xs text-vloom-muted truncate mt-0.5">{subLine}</p>}
    </div>
  );
}
