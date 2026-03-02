// =====================================================
// Leadflow Vloom - CRM card (Kanban)
// =====================================================
import { useState } from 'react';
import { Check } from 'lucide-react';
import type { Lead } from '@/types/database';
import { supabase } from '@/lib/supabase';

interface CRMCardProps {
  lead: Lead;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onMarkAsLead?: (lead: Lead, value: boolean) => void;
  onUpdateLead?: (id: string, updates: Partial<Lead>) => Promise<void>;
}

export function CRMCard({ lead, onDragStart, onMarkAsLead, onUpdateLead }: CRMCardProps) {
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string>(lead.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  const companyName = lead.company_name || 'No name';
  const parts: string[] = [];
  if (lead.company_location) parts.push(lead.company_location);
  if (lead.job_title) parts.push(lead.job_title);
  if (lead.contact_name && lead.contact_name !== lead.company_name) parts.push(lead.contact_name);
  if (lead.company_industry && !parts.includes(lead.company_industry)) parts.push(lead.company_industry);
  const subLine = parts.slice(0, 3).join(' · ') || null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      className="bg-vloom-surface border border-vloom-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-vloom-accent/40 transition-colors min-h-[120px] flex flex-col gap-1"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-vloom-text truncate">{companyName}</p>
          {subLine && <p className="text-[11px] text-vloom-muted truncate mt-0.5 leading-tight">{subLine}</p>}
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
      <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-vloom-muted">
        {lead.job_title && (
          <p>
            <span className="font-medium text-vloom-text">Role: </span>
            {lead.job_title}
          </p>
        )}
        {lead.company_location && (
          <p>
            <span className="font-medium text-vloom-text">Location: </span>
            {lead.company_location}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="font-medium text-vloom-text">Score: {lead.score}</span>
          {lead.tags && lead.tags.length > 0 && <span>{lead.tags.length} tags</span>}
        </div>
        {lead.notes && (
          <p className="mt-0.5 text-[11px] text-vloom-text/80 line-clamp-2">
            {lead.notes}
          </p>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-vloom-border/60 flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex-1 inline-flex items-center justify-center rounded-md border border-vloom-border px-2 py-1.5 text-[11px] font-medium text-vloom-text hover:border-vloom-accent hover:text-vloom-accent bg-vloom-surface/80"
          onClick={(e) => {
            e.stopPropagation();
            setIsNotesOpen(true);
          }}
        >
          Notes
        </button>
        <button
          type="button"
          className="flex-1 inline-flex items-center justify-center rounded-md border border-vloom-border px-2 py-1.5 text-[11px] font-medium text-vloom-text hover:border-vloom-accent hover:text-vloom-accent bg-vloom-surface/80"
          onClick={(e) => {
            e.stopPropagation();
            setIsTaskOpen(true);
          }}
        >
          Tasks
        </button>
      </div>

      {isNotesOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            e.stopPropagation();
            setIsNotesOpen(false);
          }}
        >
          <div
            className="w-full max-w-xs rounded-lg bg-vloom-surface border border-vloom-border p-3 text-[11px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-vloom-text text-xs">Notes</span>
              <button
                type="button"
                className="text-[11px] text-vloom-muted hover:text-vloom-text"
                onClick={() => setIsNotesOpen(false)}
              >
                Close
              </button>
            </div>
            <textarea
              className="w-full h-20 rounded-md border border-vloom-border bg-vloom-surface text-[11px] text-vloom-text px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-vloom-accent"
              placeholder="Write a quick note about this lead…"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="px-2 py-1 text-[11px] text-vloom-muted hover:text-vloom-text"
                onClick={() => setIsNotesOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingNotes || !onUpdateLead}
                className="px-3 py-1 rounded-md bg-vloom-accent text-[11px] text-white disabled:opacity-60"
                onClick={async () => {
                  if (!onUpdateLead) return;
                  setSavingNotes(true);
                  try {
                    await onUpdateLead(lead.id, { notes: notesDraft.trim() === '' ? null : notesDraft.trim() });
                    setIsNotesOpen(false);
                  } finally {
                    setSavingNotes(false);
                  }
                }}
              >
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isTaskOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            e.stopPropagation();
            setIsTaskOpen(false);
          }}
        >
          <div
            className="w-full max-w-xs rounded-lg bg-vloom-surface border border-vloom-border p-3 text-[11px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-vloom-text text-xs">New task</span>
              <button
                type="button"
                className="text-[11px] text-vloom-muted hover:text-vloom-text"
                onClick={() => setIsTaskOpen(false)}
              >
                Close
              </button>
            </div>
            <input
              type="text"
              className="w-full rounded-md border border-vloom-border bg-vloom-surface text-[11px] text-vloom-text px-2 py-1 focus:outline-none focus:ring-1 focus:ring-vloom-accent"
              placeholder="E.g. Call this lead on Monday"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="px-2 py-1 text-[11px] text-vloom-muted hover:text-vloom-text"
                onClick={() => setIsTaskOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingTask || !supabase}
                className="px-3 py-1 rounded-md bg-vloom-accent text-[11px] text-white disabled:opacity-60"
                onClick={async () => {
                  if (!supabase) return;
                  const title = (taskTitle || '').trim() || `Task for ${companyName}`;
                  setSavingTask(true);
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await supabase.from('tasks').insert({
                      user_id: lead.user_id,
                      lead_id: lead.id,
                      title,
                      status: 'pending',
                    } as any);
                    setTaskTitle('');
                    setIsTaskOpen(false);
                  } finally {
                    setSavingTask(false);
                  }
                }}
              >
                {savingTask ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
