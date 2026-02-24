// =====================================================
// LEADFLOW - Lead view helpers (by company vs by person)
// =====================================================
import type { Lead } from '@/types/database';
import type { LeadViewBy } from '@/types/database';

/**
 * Returns leads to display and an optional map of lead id -> group size
 * (when view_by is 'company', one row per company; groupSizeByLeadId gives count per company).
 */
export function getDisplayLeadsForView(
  leads: Lead[],
  viewBy: LeadViewBy | undefined
): { displayLeads: Lead[]; groupSizeByLeadId: Record<string, number> } {
  if (viewBy !== 'company') {
    return { displayLeads: leads, groupSizeByLeadId: {} };
  }
  const byCompany = new Map<string, Lead[]>();
  for (const lead of leads) {
    const key = (lead.company_name || '').trim() || '—';
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(lead);
  }
  const displayLeads: Lead[] = [];
  const groupSizeByLeadId: Record<string, number> = {};
  for (const [, group] of byCompany) {
    const first = group[0];
    displayLeads.push(first);
    if (group.length > 1) groupSizeByLeadId[first.id] = group.length;
  }
  return { displayLeads, groupSizeByLeadId };
}
