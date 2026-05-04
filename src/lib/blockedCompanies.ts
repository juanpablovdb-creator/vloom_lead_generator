// =====================================================
// Companies blocked from "Send to leads" / pipeline
// =====================================================
// Matches normalization used in Supabase Edge (`linkedinJobImport.normalizeCompanyName`).
// Rows may still appear in Saved search / Discovery; UI highlights them and send path skips them.

import type { Lead } from '@/types/database';

/** Normalize company name for blocked-list matching. */
export function normalizeBlockedCompanyName(raw: string): string {
  return (raw ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Built-in blocklist (product default). Merged with `blocked_companies` per user when loaded. */
export const DEFAULT_BLOCKED_COMPANY_DISPLAY_NAMES = [
  'Twine',
  'Mercor',
  'Alignerr',
  'Crossing Hurdles',
  'Shootday',
  'Jobgether',
  'Scale Army Careers',
  'Quik Hire Staffing',
  'Bionic Talent',
  'Jobs Ai',
  'icreatives',
] as const;

export function buildDefaultBlockedCompanyNormalizedSet(): Set<string> {
  return new Set(
    DEFAULT_BLOCKED_COMPANY_DISPLAY_NAMES.map((n) => normalizeBlockedCompanyName(n)).filter((s) => s.length > 0),
  );
}

/** Primary display company string from a lead row (align with LeadsTable / CRMCard). */
export function leadCompanyDisplayString(lead: Lead): string {
  const rawCompany = lead.company_name;
  const companyStr =
    rawCompany == null ||
    rawCompany === '' ||
    rawCompany === '{}' ||
    (typeof rawCompany === 'object' && rawCompany !== null && Object.keys(rawCompany).length === 0)
      ? ''
      : typeof rawCompany === 'string'
        ? rawCompany.trim()
        : String(rawCompany).trim();
  const contactStr = typeof lead.contact_name === 'string' ? lead.contact_name.trim() : '';
  const jobStr = typeof lead.job_title === 'string' ? lead.job_title.trim() : '';
  return companyStr || contactStr || jobStr;
}

export function isLeadCompanyBlockedByNormalizedSet(lead: Lead, blockedNormalized: Set<string>): boolean {
  const display = leadCompanyDisplayString(lead);
  if (!display) return false;
  return blockedNormalized.has(normalizeBlockedCompanyName(display));
}
