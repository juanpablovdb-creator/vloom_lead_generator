// =====================================================
// Leadflow Vloom - First contact date per lead (history + field)
// =====================================================

import { useCallback, useEffect, useState } from 'react';
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

/** Earliest invite_sent per lead from history; fallback dates for funnel leads without history. */
export function useFirstContactDatesMap(refreshKey = 0): Map<string, string> | null {
  const [map, setMap] = useState<Map<string, string> | null>(null);

  const fetchDates = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    try {
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

      const byLead = new Map<string, string>();
      for (const row of historyRows) {
        if (!byLead.has(row.lead_id)) byLead.set(row.lead_id, row.changed_at);
      }

      const funnelLeads = await fetchAllPages<{
        id: string;
        created_at: string;
        updated_at: string;
        first_contacted_at: string | null;
      }>(async (from, to) => {
        const res = await client
          .from('leads')
          .select('id, created_at, updated_at, first_contacted_at')
          .eq('is_marked_as_lead', true)
          .neq('status', 'disqualified')
          .in('status', FUNNEL_STATUSES)
          .range(from, to);
        return {
          data: res.data as {
            id: string;
            created_at: string;
            updated_at: string;
            first_contacted_at: string | null;
          }[] | null,
          error: res.error,
        };
      });

      for (const row of funnelLeads) {
        if (row.first_contacted_at) {
          byLead.set(row.id, row.first_contacted_at);
        } else if (!byLead.has(row.id)) {
          byLead.set(row.id, row.updated_at ?? row.created_at);
        }
      }

      setMap(byLead);
    } catch {
      setMap(new Map());
    }
  }, []);

  useEffect(() => {
    fetchDates();
  }, [fetchDates, refreshKey]);

  return map;
}

/** Resolve display/filter date: DB field first, then history/fallback map. */
export function resolveFirstContactAt(
  lead: { id: string; first_contacted_at: string | null },
  byLeadId: Map<string, string> | null | undefined
): string | null {
  return lead.first_contacted_at ?? byLeadId?.get(lead.id) ?? null;
}
