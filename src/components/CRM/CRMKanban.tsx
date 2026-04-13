// =====================================================
// Leadflow Vloom - CRM Kanban (pipeline)
// =====================================================
import { useCallback, useMemo, useState } from 'react';
import { CRMCard } from './CRMCard';
import type { Lead, LeadStatus } from '@/types/database';

function stageDotColor(status: LeadStatus): string {
  switch (status) {
    case 'backlog':
      return 'hsl(var(--stage-backlog))';
    case 'not_contacted':
      return 'hsl(var(--stage-not-contacted))';
    case 'invite_sent':
      return 'hsl(var(--stage-first-contact))';
    case 'connected':
      return 'hsl(var(--stage-connected))';
    case 'reply':
      return 'hsl(var(--stage-reply))';
    case 'positive_reply':
      return 'hsl(var(--stage-positive-reply))';
    case 'negotiation':
      return 'hsl(var(--stage-negotiation))';
    case 'closed':
      return 'hsl(var(--stage-closed))';
    case 'lost':
      return 'hsl(var(--stage-lost))';
    case 'disqualified':
      return 'hsl(var(--stage-disqualified))';
    default:
      return 'hsl(var(--muted-foreground))';
  }
}

const PIPELINE_STAGES: { id: LeadStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'not_contacted', label: 'Not contacted' },
  { id: 'invite_sent', label: 'First contact' },
  { id: 'connected', label: 'Connected' },
  { id: 'reply', label: 'Reply' },
  { id: 'positive_reply', label: 'Positive reply' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'closed', label: 'Closed' },
  { id: 'lost', label: 'Lost' },
  { id: 'disqualified', label: 'Disqualified' },
];

interface CRMKanbanProps {
  leads: Lead[];
  isLoading: boolean;
  onStatusChange: (leadId: string, status: LeadStatus) => Promise<void>;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => Promise<void>;
  onOpenLead?: (lead: Lead) => void;
}

export function CRMKanban({
  leads,
  isLoading,
  onStatusChange,
  onUpdateLead,
  onOpenLead,
}: CRMKanbanProps) {
  const [, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | null>(null);

  const leadsByStatus = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.id, []);
    for (const lead of leads) {
      const status = lead.status as LeadStatus;
      const targetStatus = map.has(status) ? status : 'backlog';
      // Backlog column: only show leads the user marked as lead
      if (targetStatus === 'backlog' && !lead.is_marked_as_lead) continue;
      map.get(targetStatus)!.push(lead);
    }
    return map;
  }, [leads]);

  const handleDragStart = useCallback((_e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    _e.dataTransfer.effectAllowed = 'move';
    _e.dataTransfer.setData('text/plain', lead.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedLead(null);
    setDragOverColumn(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, newStatus: LeadStatus) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverColumn(null);
      setDraggedLead(null);
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      await onStatusChange(id, newStatus);
    },
    [onStatusChange]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-vloom-muted text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-4 h-[80vh]"
      onDragEnd={handleDragEnd}
    >
      {PIPELINE_STAGES.map(({ id, label }) => (
        <div
          key={id}
          onDragOver={(e) => handleDragOver(e, id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, id)}
          className="flex-shrink-0 w-72 flex flex-col"
        >
          <div className="flex items-center gap-2 mb-3 px-1 flex-shrink-0">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stageDotColor(id) }} />
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{label}</h3>
            <span className="text-xs text-muted-foreground ml-auto">({leadsByStatus.get(id)?.length ?? 0})</span>
          </div>
          <div
            className={`space-y-3 flex-1 overflow-y-auto pr-1 min-h-[120px] rounded-lg border transition-colors ${
              dragOverColumn === id ? 'border-primary bg-primary/5' : 'border-transparent bg-background/20'
            } p-2`}
            onDragOver={(e) => handleDragOver(e, id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, id)}
          >
            {(leadsByStatus.get(id) ?? []).map((lead) => (
              <CRMCard
                key={lead.id}
                lead={lead}
                onDragStart={handleDragStart}
                onUpdateLead={onUpdateLead}
                onOpen={onOpenLead}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
