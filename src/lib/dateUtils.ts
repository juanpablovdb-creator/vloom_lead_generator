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

/** Format an ISO date string for <input type="date"> value (YYYY-MM-DD in local timezone). */
export function isoToDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
