// =====================================================
// Leadflow Vloom - Task presets (Tasks board)
// =====================================================

export const TASK_PRESET_OPTIONS = [
  { id: 'follow_up', title: 'Follow up' },
  { id: 'send_quote', title: 'Send Quote' },
  { id: 'send_sample', title: 'Send Sample' },
  { id: 'follow_up_sample', title: 'Follow up on Sample' },
  { id: 'follow_up_new_projects', title: 'Follow up on new projects' },
] as const;

export type TaskPresetId = (typeof TASK_PRESET_OPTIONS)[number]['id'];

export const NURTURING_FOLLOW_UP_TITLE = 'Follow up';
export const NURTURING_TASK_TYPE = 'follow_up_nurturing';

/** One month from now (local date noon → ISO). */
export function oneMonthFromNowIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export function formatBudget(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function sumLeadBudgets(leads: { budget?: number | null }[]): number {
  return leads.reduce((acc, l) => {
    const n = typeof l.budget === 'number' ? l.budget : Number(l.budget);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}
