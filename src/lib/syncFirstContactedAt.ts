// =====================================================
// Leadflow Vloom - Backfill leads.first_contacted_at from history
// =====================================================

import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseFetchAll';
import type { LeadStatus } from '@/types/database';

const FUNNEL_STATUSES: LeadStatus[] = [
  'invite_sent',
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'closed',
  'lost',
];

const UPDATE_CHUNK = 40;

/**
 * Set first_contacted_at on leads that are in the funnel but have NULL,
 * using lead_status_history (invite_sent) or updated_at/created_at as fallback.
 */
export async function syncMissingFirstContactedAt(): Promise<number> {
  const client = supabase;
  if (!client) return 0;

  const historyRows = await fetchAllPages<{ lead_id: string; changed_at: string }>(
    async (from, to) => {
      const res = await client
        .from('lead_status_history')
        .select('lead_id, changed_at')
        .eq('to_status', 'invite_sent')
        .order('changed_at', { ascending: true })
        .range(from, to);
      return {
        data: res.data as { lead_id: string; changed_at: string }[] | null,
        error: res.error,
      };
    }
  );

  const historyByLead = new Map<string, string>();
  for (const row of historyRows) {
    if (!historyByLead.has(row.lead_id)) historyByLead.set(row.lead_id, row.changed_at);
  }

  const missing = await fetchAllPages<{
    id: string;
    created_at: string;
    updated_at: string;
  }>(async (from, to) => {
    const res = await client
      .from('leads')
      .select('id, created_at, updated_at')
      .eq('is_marked_as_lead', true)
      .is('first_contacted_at', null)
      .in('status', FUNNEL_STATUSES)
      .range(from, to);
    return {
      data: res.data as { id: string; created_at: string; updated_at: string }[] | null,
      error: res.error,
    };
  });

  if (missing.length === 0) return 0;

  const updates: { id: string; first_contacted_at: string }[] = [];
  for (const lead of missing) {
    const at = historyByLead.get(lead.id) ?? lead.updated_at ?? lead.created_at;
    updates.push({ id: lead.id, first_contacted_at: at });
  }

  for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK);
    await Promise.all(
      chunk.map((row) =>
        client
          .from('leads')
          .update({ first_contacted_at: row.first_contacted_at } as never)
          .eq('id', row.id)
      )
    );
  }

  return updates.length;
}
