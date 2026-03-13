// =====================================================
// Leadflow Vloom - KPI week and cohort aggregation
// =====================================================
// Weeks run Monday–Sunday. "People contacted" is attributed to the week when
// the lead was moved to invite_sent (CRM). Other metrics use that same cohort.

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

/**
 * Week key for "People contacted": prefer the week when the lead was first moved to invite_sent (CRM).
 * Falls back to created_at if no invite_sent history (e.g. legacy data or lead not yet moved).
 */
export function getPeopleContactedWeekKey(
  lead: Lead,
  firstInviteSentAtByLeadId: Map<string, string> | null
): string {
  if (firstInviteSentAtByLeadId) {
    const at = firstInviteSentAtByLeadId.get(lead.id);
    if (at) return getWeekKey(parseDate(at));
  }
  return getFirstContactWeekKey(lead);
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
  peopleContacted: number;
  connected: number;
  replies: number;
  positiveReplies: number;
  opportunity: number;
  closed: number;
  lost: number;
  disqualified: number;
  /** Lists of leads per metric (for drill-down in UI). */
  peopleContactedLeads: Lead[];
  connectedLeads: Lead[];
  repliesLeads: Lead[];
  positiveRepliesLeads: Lead[];
  opportunityLeads: Lead[];
  closedLeads: Lead[];
  lostLeads: Lead[];
  disqualifiedLeads: Lead[];
}

export interface KPISnapshot {
  weeks: WeekKPI[];
  /** Ordered week keys (newest first or by range). */
  weekKeys: string[];
}

/**
 * Build KPI snapshot from leads. "People contacted" is attributed to the week when
 * the lead was first moved to invite_sent (from lead_status_history), or created_at if unknown.
 * Downstream metrics (connected, reply, etc.) use that same cohort.
 */
export function computeKPIsByWeek(
  leads: Lead[],
  numWeeks: number = 12,
  firstInviteSentAtByLeadId?: Map<string, string> | null
): KPISnapshot {
  const now = new Date();
  const weekKeysSet = new Set<string>();
  const leadsByWeek = new Map<string, Lead[]>();

  for (const lead of leads) {
    const key = getPeopleContactedWeekKey(lead, firstInviteSentAtByLeadId ?? null);
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

    const peopleContactedLeads = cohort;
    const connectedLeads = cohort.filter((l) => hasReachedStatus(l, 'connected'));
    const repliesLeads = cohort.filter((l) => hasReachedStatus(l, 'reply'));
    const positiveRepliesLeads = cohort.filter((l) => hasReachedStatus(l, 'positive_reply'));
    const opportunityLeads = cohort.filter((l) => hasReachedStatus(l, 'negotiation'));
    const closedLeads = cohort.filter((l) => (l.status as LeadStatus) === 'closed');
    const lostLeads = cohort.filter((l) => (l.status as LeadStatus) === 'lost');
    const disqualifiedLeads = cohort.filter((l) => (l.status as LeadStatus) === 'disqualified');

    const weekLabel = `${formatShort(monday)} – ${formatShort(sunday)}`;

    return {
      weekKey,
      weekLabel,
      monday,
      sunday,
      peopleContacted: peopleContactedLeads.length,
      connected: connectedLeads.length,
      replies: repliesLeads.length,
      positiveReplies: positiveRepliesLeads.length,
      opportunity: opportunityLeads.length,
      closed: closedLeads.length,
      lost: lostLeads.length,
      disqualified: disqualifiedLeads.length,
      peopleContactedLeads,
      connectedLeads,
      repliesLeads,
      positiveRepliesLeads,
      opportunityLeads,
      closedLeads,
      lostLeads,
      disqualifiedLeads,
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
