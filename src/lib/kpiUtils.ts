// =====================================================
// Leadflow Vloom - KPI week and cohort aggregation
// =====================================================
// Weeks run Monday–Sunday. "Invite sent" (Companies) is attributed to the week when
// the lead was moved to invite_sent (CRM). Other metrics use that same cohort (Companies).

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
 * Week key for "Invite sent" cohort: only from lead_status_history (first move to invite_sent).
 * No fallback: leads without history are not assigned to any week, so counts are accurate.
 */
export function getPeopleContactedWeekKey(
  lead: Lead,
  firstInviteSentAtByLeadId: Map<string, string> | null
): string | null {
  if (!firstInviteSentAtByLeadId) return null;
  const at = firstInviteSentAtByLeadId.get(lead.id);
  if (!at) return null;
  return getWeekKey(parseDate(at));
}

/** Stages we track in history for funnel counts (must have been in this stage at some point). */
export const FUNNEL_STAGES_FROM_HISTORY: LeadStatus[] = [
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'closed',
  'lost',
  'disqualified',
];

/** Map: lead_id -> set of to_status values that lead has ever had (from lead_status_history). */
export type StagesEverReachedByLeadId = Map<string, Set<string>>;

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
 * Build KPI snapshot from leads. Cohort = week of first Invite Sent (from history).
 * Connected, Reply, Positive reply, etc. count only leads that have that stage in
 * lead_status_history (ever moved to that stage), not just current status — so
 * e.g. a lead in Disqualified who never was in Reply is not counted in Replies.
 */
export function computeKPIsByWeek(
  leads: Lead[],
  numWeeks: number = 12,
  firstInviteSentAtByLeadId?: Map<string, string> | null,
  stagesEverReachedByLeadId?: StagesEverReachedByLeadId | null
): KPISnapshot {
  const now = new Date();
  const weekKeysSet = new Set<string>();
  const leadsByWeek = new Map<string, Lead[]>();

  for (const lead of leads) {
    const key = getPeopleContactedWeekKey(lead, firstInviteSentAtByLeadId ?? null);
    if (key === null) continue; // Only count leads that were actually moved to Invite Sent
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

  const hasEverBeen = (leadId: string, stage: string): boolean =>
    stagesEverReachedByLeadId?.get(leadId)?.has(stage) ?? false;

  const weeks: WeekKPI[] = orderedKeys.map((weekKey) => {
    const cohort = leadsByWeek.get(weekKey) ?? [];
    const monday = new Date(weekKey + 'T00:00:00');
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const peopleContactedLeads = cohort;
    const connectedLeads = cohort.filter((l) => hasEverBeen(l.id, 'connected'));
    const repliesLeads = cohort.filter((l) => hasEverBeen(l.id, 'reply'));
    const positiveRepliesLeads = cohort.filter((l) => hasEverBeen(l.id, 'positive_reply'));
    const opportunityLeads = cohort.filter((l) => hasEverBeen(l.id, 'negotiation'));
    const closedLeads = cohort.filter((l) => hasEverBeen(l.id, 'closed'));
    const lostLeads = cohort.filter((l) => hasEverBeen(l.id, 'lost'));
    const disqualifiedLeads = cohort.filter((l) => hasEverBeen(l.id, 'disqualified'));

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
