import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildDefaultBlockedCompanyNormalizedSet,
  normalizeBlockedCompanyName,
} from '@/lib/blockedCompanies';

/** Defaults + user's `blocked_companies.company_name_normalized` rows (read-only). */
export function useMergedBlockedCompanyNormalizedSet(): Set<string> {
  const [merged, setMerged] = useState(() => buildDefaultBlockedCompanyNormalizedSet());

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!supabase) return;
      const base = buildDefaultBlockedCompanyNormalizedSet();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id || cancelled) {
        if (!cancelled) setMerged(base);
        return;
      }
      const { data, error } = await supabase
        .from('blocked_companies')
        .select('company_name_normalized')
        .eq('user_id', user.id);
      if (error || cancelled) {
        if (!cancelled) setMerged(base);
        return;
      }
      const next = new Set(base);
      for (const row of (data ?? []) as { company_name_normalized?: string | null }[]) {
        const n = normalizeBlockedCompanyName(row.company_name_normalized ?? '');
        if (n) next.add(n);
      }
      if (!cancelled) setMerged(next);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return merged;
}

