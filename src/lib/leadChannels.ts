/**
 * Canonical channel labels for leads.
 *
 * Important: we store labels as strings in DB (`leads.channel`), so these constants must remain stable.
 */
export const LINKEDIN_JOB_POST_CHANNEL = 'LinkedIn Job Post';
export const LINKEDIN_POST_FEEDS_CHANNEL = 'LinkedIn Post Feeds';

export const LEAD_CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: LINKEDIN_JOB_POST_CHANNEL, label: LINKEDIN_JOB_POST_CHANNEL },
  { value: LINKEDIN_POST_FEEDS_CHANNEL, label: LINKEDIN_POST_FEEDS_CHANNEL },
  { value: 'Website', label: 'Website' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Event', label: 'Event' },
  { value: 'Cold outreach', label: 'Cold outreach' },
  { value: 'Email', label: 'Email' },
  { value: 'Youtube Jobs', label: 'Youtube Jobs' },
  { value: 'Other', label: 'Other' },
];

/** Best-effort normalization for legacy/typo channel values. */
export function normalizeLeadChannel(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  if (lower === 'linkedin job post' || lower === 'linkedin job posts') return LINKEDIN_JOB_POST_CHANNEL;
  if (lower === 'linkedin job post feeds') return LINKEDIN_POST_FEEDS_CHANNEL;
  if (lower === 'linkedin post feeds' || lower === 'linkedin post feed' || lower === 'linkedin post-feed') {
    return LINKEDIN_POST_FEEDS_CHANNEL;
  }
  // Legacy value: before we split channels, we stored "LinkedIn".
  // Default it to Job Post so it becomes one of the two canonical LinkedIn channels.
  if (lower === 'linkedin') return LINKEDIN_JOB_POST_CHANNEL;

  // Keep as-is for custom channels (avoid unexpected data loss)
  return s;
}
