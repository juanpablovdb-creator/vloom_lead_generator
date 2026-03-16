// =====================================================
// Leadflow Vloom - CRM Kanban (pipeline)
// =====================================================
import { useCallback, useMemo, useState } from 'react';
import { CRMCard } from './CRMCard';
import type { Lead, LeadStatus } from '@/types/database';

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
  const [_draggedLead, setDraggedLead] = useState<Lead | null>(null);
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
      className="flex gap-3 overflow-x-auto pb-4 h-[80vh]"
      onDragEnd={handleDragEnd}
    >
      {PIPELINE_STAGES.map(({ id, label }) => (
        <div
          key={id}
          onDragOver={(e) => handleDragOver(e, id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, id)}
          className={`flex-shrink-0 w-64 min-w-[14rem] h-full flex flex-col rounded-lg border transition-colors ${
            dragOverColumn === id
              ? 'border-vloom-accent bg-vloom-accent/5'
              : 'border-vloom-border bg-vloom-surface/50'
          }`}
        >
          <div className="p-2 border-b border-vloom-border flex-shrink-0">
            <span className="text-xs font-medium text-vloom-muted uppercase tracking-wide">
              {label}
            </span>
            <span className="ml-1.5 text-xs text-vloom-muted">
              ({leadsByStatus.get(id)?.length ?? 0})
            </span>
          </div>
          <div
            className="p-2 space-y-2 flex-1 overflow-y-auto min-h-[120px]"
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
