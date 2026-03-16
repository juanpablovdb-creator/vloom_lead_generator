// =====================================================
// Leadflow Vloom - KPI tracking by week (Mon–Sun)
// =====================================================
// "Invite sent" (Companies) = week when the lead was moved to invite_sent (CRM).
// All metrics show Companies. Click a number to see the list for that metric.
// Optional filter by channel to see KPIs per channel.

import { useMemo, useState, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLeads } from '@/hooks/useLeads';
import {
  computeKPIsByWeek,
  formatWeekRange,
  FUNNEL_STAGES_FROM_HISTORY,
  type StagesEverReachedByLeadId,
  type WeekKPI,
} from '@/lib/kpiUtils';
import { supabase } from '@/lib/supabase';
import { SUPABASE_CONFIG_HINT } from '@/lib/supabase';
import type { Lead } from '@/types/database';

const DEFAULT_NUM_WEEKS = 4;

const CHANNEL_OPTIONS = [
  { value: 'LinkedIn', label: 'LinkedIn' },
  { value: 'Website', label: 'Website' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Event', label: 'Event' },
  { value: 'Cold outreach', label: 'Cold outreach' },
  { value: 'Email', label: 'Email' },
  { value: 'Youtube Jobs', label: 'Youtube Jobs' },
  { value: 'Other', label: 'Other' },
];

/** Format count with rate vs denominator: "12 (24.00%)" for funnel rows. */
function countWithRate(count: number, denominator: number): string {
  const rate = denominator > 0 ? ((count / denominator) * 100).toFixed(2) : '0.00';
  return `${count} (${rate}%)`;
}

function formatTwoDecimals(v: number): string {
  return v.toFixed(2);
}

function leadLabel(lead: Lead): string {
  const name = lead.contact_name?.trim() || lead.company_name?.trim() || '—';
  const company = lead.company_name?.trim();
  return company && name !== company ? `${name} · ${company}` : name;
}

type PopoverState = { rowLabel: string; weekLabel: string; leads: Lead[] } | null;

interface KpiCellProps {
  cell: string | number;
  leads: Lead[];
  rowLabel: string;
  weekLabel: string;
  onOpenList: (state: PopoverState) => void;
}

function KpiCell({ cell, leads, rowLabel, weekLabel, onOpenList }: KpiCellProps) {
  const content =
    typeof cell === 'number' ? (
      <span>{formatTwoDecimals(cell)}</span>
    ) : (() => {
      const m = String(cell).match(/^\s*(\d+(?:\.\d+)?)\s*\(([^)]+)\)\s*$/);
      if (m) {
        const count = formatTwoDecimals(Number(m[1]));
        const rate = `(${m[2]})`;
        return (
          <span className="inline-flex flex-col items-center">
            <span>{count}</span>
            <span className="text-xs italic text-vloom-muted">{rate}</span>
          </span>
        );
      }
      const n = Number(cell);
      if (!Number.isNaN(n) && String(cell).trim() !== '') {
        return <span>{formatTwoDecimals(n)}</span>;
      }
      return <span>{cell}</span>;
    })();

  return (
    <td className="px-4 py-2.5 text-center text-sm text-vloom-text border-b border-vloom-border tabular-nums align-top min-w-[7rem]">
      <button
        type="button"
        onClick={() => leads.length > 0 && onOpenList({ rowLabel, weekLabel, leads })}
        className={`w-full rounded px-1 py-0.5 -my-0.5 hover:bg-vloom-accent/10 focus:outline-none focus:ring-1 focus:ring-vloom-accent inline-flex flex-col items-center justify-center gap-0.5 ${leads.length === 0 ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <span className="inline-flex flex-col items-center gap-0.5">
          {content}
          {leads.length > 0 && (
            <ChevronDown className="w-3.5 h-3.5 text-vloom-muted flex-shrink-0" aria-hidden />
          )}
        </span>
      </button>
    </td>
  );
}

interface RowProps {
  label: string;
  cells: (string | number)[];
  weeks: WeekKPI[];
  leadKey: keyof Pick<
    WeekKPI,
    | 'peopleContactedLeads'
    | 'connectedLeads'
    | 'repliesLeads'
    | 'positiveRepliesLeads'
    | 'opportunityLeads'
    | 'closedLeads'
    | 'lostLeads'
    | 'disqualifiedLeads'
  >;
  highlight?: 'positive' | 'negative' | 'neutral';
  onOpenList: (state: PopoverState) => void;
}

function KpiRow({ label, cells, weeks, leadKey, highlight, onOpenList }: RowProps) {
  const rowBg =
    highlight === 'positive'
      ? 'bg-emerald-500/10'
      : highlight === 'negative'
        ? 'bg-red-500/10'
        : '';
  const stickyBg = 'bg-vloom-surface';
  return (
    <tr className={rowBg}>
      <td
        className={`sticky left-0 z-[1] ${stickyBg} px-4 py-2.5 text-left text-sm font-medium text-vloom-text border-b border-r border-vloom-border whitespace-nowrap min-w-[14rem]`}
      >
        {label}
      </td>
      {cells.map((cell, i) => (
        <KpiCell
          key={i}
          cell={cell}
          leads={weeks[i]?.[leadKey] ?? []}
          rowLabel={label}
          weekLabel={weeks[i]?.weekLabel ?? ''}
          onOpenList={onOpenList}
        />
      ))}
    </tr>
  );
}

function WeekColumnHeader({ week }: { week: WeekKPI }) {
  const label = formatWeekRange(week.monday, week.sunday);
  return (
    <th className="px-4 py-2.5 text-center text-xs font-medium text-vloom-muted uppercase tracking-wider border-b border-vloom-border whitespace-nowrap min-w-[7rem]">
      {label}
    </th>
  );
}

/** First time each lead was moved to invite_sent (from lead_status_history). */
function useFirstInviteSentByLead(): Map<string, string> | null {
  const [map, setMap] = useState<Map<string, string> | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('lead_status_history')
      .select('lead_id, changed_at')
      .eq('to_status', 'invite_sent')
      .order('changed_at', { ascending: true });
    if (error) return;
    const byLead = new Map<string, string>();
    for (const row of (data ?? []) as { lead_id: string; changed_at: string }[]) {
      if (!byLead.has(row.lead_id)) byLead.set(row.lead_id, row.changed_at);
    }
    setMap(byLead);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return map;
}

/** For each lead, the set of stages they have ever been in (from lead_status_history). */
function useStagesEverReachedByLead(): StagesEverReachedByLeadId | null {
  const [map, setMap] = useState<StagesEverReachedByLeadId | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('lead_status_history')
      .select('lead_id, to_status')
      .in('to_status', [...FUNNEL_STAGES_FROM_HISTORY]);
    if (error) return;
    const byLead = new Map<string, Set<string>>();
    for (const row of (data ?? []) as { lead_id: string; to_status: string }[]) {
      let set = byLead.get(row.lead_id);
      if (!set) {
        set = new Set();
        byLead.set(row.lead_id, set);
      }
      set.add(row.to_status);
    }
    setMap(byLead);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return map;
}

const KPI_LEADS_CHUNK = 250;

/** Fetch only leads that have a row in lead_status_history (invite_sent), so cohort week is accurate. */
function useLeadsForKPI(
  firstInviteSentByLeadId: Map<string, string> | null,
  channelFilter: string[] | undefined
): { leads: Lead[]; isLoading: boolean } {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client || !firstInviteSentByLeadId) {
      setLeads([]);
      return;
    }
    const leadIds = Array.from(firstInviteSentByLeadId.keys());
    if (leadIds.length === 0) {
      setLeads([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const run = async () => {
      const all: Lead[] = [];
      for (let i = 0; i < leadIds.length; i += KPI_LEADS_CHUNK) {
        if (cancelled) return;
        const chunk = leadIds.slice(i, i + KPI_LEADS_CHUNK);
        let query = client
          .from('leads')
          .select('*')
          .in('id', chunk)
          .eq('is_marked_as_lead', true);
        if (channelFilter && channelFilter.length > 0) {
          query = query.in('channel', channelFilter);
        }
        const { data, error } = await query;
        if (error || cancelled) return;
        all.push(...((data ?? []) as Lead[]));
      }
      if (!cancelled) setLeads(all);
    };

    run().finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [firstInviteSentByLeadId, channelFilter?.join(',') ?? '']);

  return { leads, isLoading };
}

export function KPITrackingView() {
  const [numWeeks, setNumWeeks] = useState(DEFAULT_NUM_WEEKS);
  const [listPopover, setListPopover] = useState<PopoverState>(null);
  const [channelOpen, setChannelOpen] = useState(false);

  const { error, filters, updateFilter } = useLeads({
    pageSize: 1,
    initialFilters: { marked_as_lead_only: true },
  });

  const selectedChannels = filters.channel ?? [];
  const channelLabel =
    selectedChannels.length === 0
      ? 'All channels'
      : selectedChannels.length === 1
        ? selectedChannels[0]
        : `${selectedChannels.length} channels`;

  const firstInviteSentByLeadId = useFirstInviteSentByLead();
  const stagesEverReachedByLeadId = useStagesEverReachedByLead();
  const { leads: kpiLeads, isLoading } = useLeadsForKPI(
    firstInviteSentByLeadId,
    filters.channel
  );

  const snapshot = useMemo(
    () =>
      computeKPIsByWeek(
        kpiLeads,
        numWeeks,
        firstInviteSentByLeadId,
        stagesEverReachedByLeadId
      ),
    [kpiLeads, numWeeks, firstInviteSentByLeadId, stagesEverReachedByLeadId]
  );

  if (error) {
    const isNotConfigured =
      error.includes('Configure Supabase') || error.includes('VITE_SUPABASE');
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-lg font-semibold text-vloom-text mb-4">KPI tracking</h1>
        <div className="bg-vloom-surface border border-vloom-border rounded-lg p-4 text-vloom-muted text-sm space-y-2">
          <p>{error}</p>
          {isNotConfigured && <p className="text-xs mt-2">{SUPABASE_CONFIG_HINT}</p>}
        </div>
      </div>
    );
  }

  const { weeks } = snapshot;

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-lg font-semibold text-vloom-text">KPI tracking</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* Channel filter */}
          <div className="relative">
            <label className="block text-xs font-medium text-vloom-muted uppercase tracking-wider mb-1">
              Channel
            </label>
            <button
              type="button"
              onClick={() => setChannelOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-vloom-border bg-vloom-bg text-vloom-text text-sm min-w-[10rem] justify-between"
              aria-expanded={channelOpen}
              aria-haspopup="listbox"
            >
              <span>{channelLabel}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${channelOpen ? 'rotate-180' : ''}`} />
            </button>
            {channelOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  aria-hidden
                  onClick={() => setChannelOpen(false)}
                />
                <ul
                  role="listbox"
                  className="absolute left-0 top-full mt-1 z-50 py-1 w-56 rounded-lg border border-vloom-border bg-vloom-surface shadow-lg max-h-60 overflow-y-auto"
                >
                  <li role="option">
                    <button
                      type="button"
                      onClick={() => {
                        updateFilter('channel', undefined);
                        setChannelOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-vloom-text hover:bg-vloom-accent/10"
                    >
                      All channels
                    </button>
                  </li>
                  {CHANNEL_OPTIONS.map((opt) => {
                    const isSelected = selectedChannels.includes(opt.value);
                    return (
                      <li key={opt.value} role="option" aria-selected={isSelected}>
                        <button
                          type="button"
                          onClick={() => {
                            const next = isSelected
                              ? selectedChannels.filter((c) => c !== opt.value)
                              : [...selectedChannels, opt.value];
                            updateFilter('channel', next.length > 0 ? next : undefined);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-vloom-text hover:bg-vloom-accent/10 flex items-center gap-2"
                        >
                          <span className="inline-flex w-4 h-4 items-center justify-center rounded border border-vloom-border">
                            {isSelected ? '✓' : null}
                          </span>
                          {opt.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-vloom-text">
            <span className="text-vloom-muted">Weeks:</span>
            <select
              value={numWeeks}
              onChange={(e) => setNumWeeks(Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg border border-vloom-border bg-vloom-bg text-vloom-text text-sm"
            >
              {[4, 6, 8, 12, 16, 24].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="text-xs text-vloom-muted mb-4">
        Funnel: Invite sent (week when moved to Invite sent in CRM) → Connected → Reply → Positive
        reply → Negotiation → Closed. Only leads with a recorded move to Invite Sent are included.
        Each row shows count and rate vs Invite sent. Click a number to see the list. Use the Channel
        filter to see KPIs by channel.
      </p>

      {listPopover && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kpi-list-title"
          onClick={() => setListPopover(null)}
        >
          <div
            className="bg-vloom-surface border border-vloom-border rounded-lg shadow-xl max-w-md w-full max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-vloom-border">
              <h2 id="kpi-list-title" className="text-sm font-semibold text-vloom-text">
                {listPopover.rowLabel} — {listPopover.weekLabel}
              </h2>
              <button
                type="button"
                onClick={() => setListPopover(null)}
                className="p-1 rounded text-vloom-muted hover:bg-vloom-border hover:text-vloom-text"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <ul className="overflow-y-auto px-4 py-2 flex-1 text-sm text-vloom-text divide-y divide-vloom-border">
              {listPopover.leads.length === 0 ? (
                <li className="py-2 text-vloom-muted">No companies</li>
              ) : (
                listPopover.leads.map((lead) => (
                  <li key={lead.id} className="py-2">
                    {leadLabel(lead)}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}

      {(firstInviteSentByLeadId === null || isLoading) ? (
        <div className="text-sm text-vloom-muted">Loading…</div>
      ) : (
        <div className="flex justify-center">
          <div className="overflow-x-auto rounded-lg border border-vloom-border bg-vloom-surface w-max max-w-full">
            <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-vloom-surface px-4 py-2.5 text-left text-xs font-medium text-vloom-muted uppercase tracking-wider border-b border-r border-vloom-border min-w-[14rem]">
                  KPI
                </th>
                {weeks.map((w) => (
                  <WeekColumnHeader key={w.weekKey} week={w} />
                ))}
              </tr>
            </thead>
            <tbody>
              <KpiRow
                label="Invite sent (Companies)"
                cells={weeks.map((w) => w.peopleContacted)}
                weeks={weeks}
                leadKey="peopleContactedLeads"
                onOpenList={setListPopover}
              />
              <KpiRow
                label="Connected (accepted) · Companies · rate vs Invite sent"
                cells={weeks.map((w) =>
                  countWithRate(w.connected, w.peopleContacted)
                )}
                weeks={weeks}
                leadKey="connectedLeads"
                onOpenList={setListPopover}
              />
              <KpiRow
                label="Replies · Companies · rate vs Invite sent"
                cells={weeks.map((w) =>
                  countWithRate(w.replies, w.peopleContacted)
                )}
                weeks={weeks}
                leadKey="repliesLeads"
                onOpenList={setListPopover}
              />
              <KpiRow
                label="Positive replies · Companies · rate vs Invite sent"
                cells={weeks.map((w) =>
                  countWithRate(w.positiveReplies, w.peopleContacted)
                )}
                weeks={weeks}
                leadKey="positiveRepliesLeads"
                highlight="positive"
                onOpenList={setListPopover}
              />
              <KpiRow
                label="Negotiation (Companies) · rate vs Invite sent"
                cells={weeks.map((w) =>
                  countWithRate(w.opportunity, w.peopleContacted)
                )}
                weeks={weeks}
                leadKey="opportunityLeads"
                highlight="positive"
                onOpenList={setListPopover}
              />
              <KpiRow
                label="Closed (won) · Companies · rate vs Invite sent"
                cells={weeks.map((w) =>
                  countWithRate(w.closed, w.peopleContacted)
                )}
                weeks={weeks}
                leadKey="closedLeads"
                highlight="positive"
                onOpenList={setListPopover}
              />
              <KpiRow
                label="Lost · Companies · rate vs Invite sent"
                cells={weeks.map((w) =>
                  countWithRate(w.lost, w.peopleContacted)
                )}
                weeks={weeks}
                leadKey="lostLeads"
                highlight="negative"
                onOpenList={setListPopover}
              />
              <KpiRow
                label="Disqualified · Companies · rate vs Invite sent"
                cells={weeks.map((w) =>
                  countWithRate(w.disqualified, w.peopleContacted)
                )}
                weeks={weeks}
                leadKey="disqualifiedLeads"
                onOpenList={setListPopover}
              />
            </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && firstInviteSentByLeadId !== null && kpiLeads.length > 0 && (
        <p className="mt-2 text-xs text-vloom-muted">
          Only leads with recorded &quot;Invite Sent&quot; date (from CRM moves). Counts match the pipeline.
        </p>
      )}
    </div>
  );
}
