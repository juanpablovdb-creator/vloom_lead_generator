// =====================================================
// Leadflow Vloom - KPI week and cohort aggregation
// =====================================================
// Weeks run Monday–Sunday. All card movements are attributed to the week
// when the lead was first contacted (created_at), not when the event occurred.

import type { Lead, LeadStatus } from '@/types/database';

/** Get Monday 00:00:00 local time for the week containing `date`. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const daysToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Get Sunday 23:59:59.999 local time for the week containing `date`. */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Week key for grouping: YYYY-MM-DD of Monday (local date). */
export function getWeekKey(date: Date): string {
  const start = getWeekStart(date);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse ISO date string into local Date. */
function parseDate(iso: string): Date {
  return new Date(iso);
}

/** First-contact date for attribution: when the lead entered the pipeline (created_at). */
export function getFirstContactWeekKey(lead: Lead): string {
  return getWeekKey(parseDate(lead.created_at));
}

/** Status ordering for "reached" checks (later stages imply earlier ones). */
const STATUS_ORDER: LeadStatus[] = [
  'backlog',
  'not_contacted',
  'invite_sent',
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'closed',
  'lost',
  'disqualified',
];

function hasReachedStatus(lead: Lead, target: LeadStatus): boolean {
  const current = lead.status as LeadStatus;
  const idx = STATUS_ORDER.indexOf(current);
  const targetIdx = STATUS_ORDER.indexOf(target);
  return idx >= 0 && targetIdx >= 0 && idx >= targetIdx;
}

export interface WeekKPI {
  weekKey: string;
  weekLabel: string;
  monday: Date;
  sunday: Date;
  /** People/companies first contacted (invites or added) in this week. */
  peopleContacted: number;
  /** From this cohort: accepted / connected. */
  connected: number;
  /** From this cohort: replied (reply or beyond). */
  replies: number;
  /** From this cohort: positive reply or beyond. */
  positiveReplies: number;
  /** From this cohort: opportunity (negotiation or closed). */
  opportunity: number;
  /** From this cohort: closed won. */
  closed: number;
  /** From this cohort: lost. */
  lost: number;
  /** From this cohort: disqualified. */
  disqualified: number;
}

export interface KPISnapshot {
  weeks: WeekKPI[];
  /** Ordered week keys (newest first or by range). */
  weekKeys: string[];
}

/**
 * Build KPI snapshot from leads. Each lead is attributed to the week of created_at.
 * Downstream movements (connected, reply, etc.) are counted in that same week.
 */
export function computeKPIsByWeek(leads: Lead[], numWeeks: number = 12): KPISnapshot {
  const now = new Date();
  const weekKeysSet = new Set<string>();
  const leadsByWeek = new Map<string, Lead[]>();

  for (const lead of leads) {
    const key = getFirstContactWeekKey(lead);
    weekKeysSet.add(key);
    const list = leadsByWeek.get(key) ?? [];
    list.push(lead);
    leadsByWeek.set(key, list);
  }

  // Build list of week keys: left = oldest, right = current week (today)
  const orderedKeys: string[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7 * i);
    const key = getWeekKey(d);
    orderedKeys.push(key);
  }

  const weeks: WeekKPI[] = orderedKeys.map((weekKey) => {
    const cohort = leadsByWeek.get(weekKey) ?? [];
    const monday = new Date(weekKey + 'T00:00:00');
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const peopleContacted = cohort.length;
    const connected = cohort.filter((l) => hasReachedStatus(l, 'connected')).length;
    const replies = cohort.filter((l) => hasReachedStatus(l, 'reply')).length;
    const positiveReplies = cohort.filter((l) => hasReachedStatus(l, 'positive_reply')).length;
    const opportunity = cohort.filter((l) => hasReachedStatus(l, 'negotiation')).length;
    const closed = cohort.filter((l) => (l.status as LeadStatus) === 'closed').length;
    const lost = cohort.filter((l) => (l.status as LeadStatus) === 'lost').length;
    const disqualified = cohort.filter((l) => (l.status as LeadStatus) === 'disqualified').length;

    const weekLabel = `${formatShort(monday)} – ${formatShort(sunday)}`;

    return {
      weekKey,
      weekLabel,
      monday,
      sunday,
      peopleContacted,
      connected,
      replies,
      positiveReplies,
      opportunity,
      closed,
      lost,
      disqualified,
    };
  });

  return { weeks, weekKeys: orderedKeys };
}

function formatShort(d: Date): string {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day}`;
}

/** Format week for column header: e.g. "Mar 3 – Mar 9". */
export function formatWeekRange(monday: Date, sunday: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString(undefined, opts)} – ${sunday.toLocaleDateString(undefined, opts)}`;
}
