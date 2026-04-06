// Paginate through all leads for a user so dedupe sees every job_url / job_external_id.
// PostgREST defaults (often 1000 rows) caused unique-index violations when existing keys
// were not loaded into the in-memory sets.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAGE = 1000;

export async function loadExistingLeadDedupeKeys(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ urls: Set<string>; externalIds: Set<string> }> {
  const urls = new Set<string>();
  const externalIds = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("leads")
      .select("job_url, job_external_id")
      .eq("user_id", userId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { job_url: string | null; job_external_id: string | null }[];
    for (const r of rows) {
      if (r.job_url) urls.add(r.job_url);
      if (r.job_external_id) externalIds.add(r.job_external_id);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return { urls, externalIds };
}
