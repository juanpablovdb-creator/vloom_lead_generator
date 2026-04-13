// =====================================================
// Leadflow Vloom - Date helpers for HTML date inputs (local timezone)
// =====================================================
// HTML <input type="date"> returns YYYY-MM-DD in user's local date. Using
// new Date('YYYY-MM-DD') parses as UTC midnight and can shift the day. These
// helpers treat the string as a local calendar date for consistent save/display.

/** Parse "YYYY-MM-DD" (local date from date input) as noon local time, return ISO string for DB. */
export function dateOnlyToISO(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

/** YYYY-MM-DD → start of local day as ISO (matches CRM `first_contacted_from` filter lower bound). */
export function dateOnlyStartOfDayToISO(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** YYYY-MM-DD → end of local day as ISO (matches CRM `first_contacted_to` filter upper bound). */
export function dateOnlyEndOfDayToISO(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** Same bounds as `useLeads` first-contact range (strict calendar-day window). */
export function firstContactFilterGteBound(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? dateOnlyStartOfDayToISO(raw) : raw;
}

export function firstContactFilterLteBound(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? dateOnlyEndOfDayToISO(raw) : raw;
}

/**
 * Most recent Friday in local time (if today is Friday, returns the previous Friday).
 * Same default as CRM CSV batch first-contact picker.
 */
export function lastFridayDateOnly(): string {
  const now = new Date();
  const day = now.getDay();
  const delta = (day + 2) % 7;
  const lastFri = new Date(now);
  lastFri.setDate(now.getDate() - (delta === 0 ? 7 : delta));
  const y = lastFri.getFullYear();
  const m = String(lastFri.getMonth() + 1).padStart(2, '0');
  const d = String(lastFri.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format an ISO date string for <input type="date"> value (YYYY-MM-DD in local timezone). */
export function isoToDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
