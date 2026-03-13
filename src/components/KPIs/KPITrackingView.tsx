// =====================================================
// Leadflow Vloom - KPI tracking by week (Mon–Sun)
// =====================================================
// All metrics are attributed to the week when the lead was first contacted
// (created_at), not the week when the card was moved.

import { useMemo, useState } from 'react';
import { useLeads } from '@/hooks/useLeads';
import { computeKPIsByWeek, formatWeekRange, type WeekKPI } from '@/lib/kpiUtils';
import { SUPABASE_CONFIG_HINT } from '@/lib/supabase';

const DEFAULT_NUM_WEEKS = 12;
const MAX_LEADS_FOR_KPI = 5000;

function pct(num: number, denom: number): string {
  if (denom === 0) return '0.00%';
  return ((num / denom) * 100).toFixed(2) + '%';
}

function num(v: number): string {
  return v.toFixed(2);
}

interface RowProps {
  label: string;
  cells: (string | number)[];
  highlight?: 'positive' | 'negative' | 'neutral';
}

function KpiRow({ label, cells, highlight }: RowProps) {
  const rowBg =
    highlight === 'positive'
      ? 'bg-emerald-500/10'
      : highlight === 'negative'
        ? 'bg-red-500/10'
        : '';
  const stickyBg =
    highlight === 'positive'
      ? 'bg-emerald-500/10'
      : highlight === 'negative'
        ? 'bg-red-500/10'
        : 'bg-vloom-surface';
  return (
    <tr className={rowBg}>
      <td className={`sticky left-0 z-[1] ${stickyBg} px-3 py-2 text-left text-sm font-medium text-vloom-text border-b border-r border-vloom-border whitespace-nowrap`}>
        {label}
      </td>
      {cells.map((cell, i) => (
        <td
          key={i}
          className="px-3 py-2 text-right text-sm text-vloom-text border-b border-vloom-border tabular-nums"
        >
          {typeof cell === 'number' ? num(cell) : cell}
        </td>
      ))}
    </tr>
  );
}

function WeekColumnHeader({ week }: { week: WeekKPI }) {
  const label = formatWeekRange(week.monday, week.sunday);
  return (
    <th className="px-3 py-2 text-right text-xs font-medium text-vloom-muted uppercase tracking-wider border-b border-vloom-border whitespace-nowrap">
      {label}
    </th>
  );
}

export function KPITrackingView() {
  const [numWeeks, setNumWeeks] = useState(DEFAULT_NUM_WEEKS);

  const { leads, isLoading, error } = useLeads({
    pageSize: MAX_LEADS_FOR_KPI,
    initialFilters: {},
  });

  const snapshot = useMemo(
    () => computeKPIsByWeek(leads, numWeeks),
    [leads, numWeeks]
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
        <div className="flex items-center gap-3">
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
        Weeks run Monday–Sunday. Metrics are attributed to the week when the lead was first
        contacted (entered pipeline), not when the card was moved.
      </p>

      {isLoading ? (
        <div className="text-sm text-vloom-muted">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-vloom-border bg-vloom-surface">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-vloom-surface px-3 py-2 text-left text-xs font-medium text-vloom-muted uppercase tracking-wider border-b border-r border-vloom-border w-64 min-w-[12rem]">
                  KPI
                </th>
                {weeks.map((w) => (
                  <WeekColumnHeader key={w.weekKey} week={w} />
                ))}
              </tr>
            </thead>
            <tbody>
              <KpiRow
                label="People contacted"
                cells={weeks.map((w) => w.peopleContacted)}
              />
              <KpiRow
                label="% accepted rate (connected)"
                cells={weeks.map((w) =>
                  pct(w.connected, w.peopleContacted)
                )}
              />
              <KpiRow
                label="Connected (accepted invitation)"
                cells={weeks.map((w) => w.connected)}
              />
              <KpiRow
                label="% reply rate"
                cells={weeks.map((w) => pct(w.replies, w.peopleContacted))}
              />
              <KpiRow
                label="Replies"
                cells={weeks.map((w) => w.replies)}
              />
              <KpiRow
                label="% of positive replies (from replies)"
                cells={weeks.map((w) =>
                  w.replies > 0 ? pct(w.positiveReplies, w.replies) : '0.00%'
                )}
              />
              <KpiRow
                label="Positive replies"
                cells={weeks.map((w) => w.positiveReplies)}
                highlight="positive"
              />
              <KpiRow
                label="% qualified lead rate (opportunity)"
                cells={weeks.map((w) =>
                  w.peopleContacted > 0
                    ? pct(w.opportunity, w.peopleContacted)
                    : '0.00%'
                )}
              />
              <KpiRow
                label="Opportunity (negotiation / closed)"
                cells={weeks.map((w) => w.opportunity)}
                highlight="positive"
              />
              <KpiRow
                label="% conversion rate (closed)"
                cells={weeks.map((w) =>
                  w.peopleContacted > 0 ? pct(w.closed, w.peopleContacted) : '0.00%'
                )}
              />
              <KpiRow
                label="Closed (won)"
                cells={weeks.map((w) => w.closed)}
                highlight="positive"
              />
              <KpiRow
                label="Lost"
                cells={weeks.map((w) => w.lost)}
                highlight="negative"
              />
              <KpiRow
                label="Disqualified"
                cells={weeks.map((w) => w.disqualified)}
              />
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && leads.length >= MAX_LEADS_FOR_KPI && (
        <p className="mt-2 text-xs text-vloom-muted">
          Showing KPIs for the most recent {MAX_LEADS_FOR_KPI} leads. Increase limit in code if
          needed.
        </p>
      )}
    </div>
  );
}
