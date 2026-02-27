// Leadflow Vloom - Edge Function: recompute lead scores with Clay-style formula
// POST { leadIds?: string[] }. If leadIds omitted or empty, recomputes for all user's leads.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeLeadScore } from "../_shared/leadScore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIELDS =
  "id, job_location, company_location, company_size, company_funding, job_description, notes, enrichment_data";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", "").trim());
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: userError?.message ?? "You must be logged in." }),
        { status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let leadIds: string[] | undefined;
    try {
      const body = await req.json().catch(() => ({}));
      leadIds = Array.isArray(body?.leadIds) ? body.leadIds : undefined;
    } catch {
      leadIds = undefined;
    }

    let query = supabase.from("leads").select(FIELDS).eq("user_id", user.id);
    if (leadIds != null && leadIds.length > 0) {
      query = query.in("id", leadIds);
    }

    const { data: leads, error: fetchErr } = await query;
    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!leads?.length) {
      return new Response(
        JSON.stringify({ ok: true, updated: 0, message: "No leads to update." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();
    let updated = 0;
    for (const lead of leads as Record<string, unknown>[]) {
      const score = computeLeadScore({
        job_location: lead.job_location,
        company_location: lead.company_location,
        company_size: lead.company_size,
        company_funding: lead.company_funding,
        job_description: lead.job_description,
        notes: lead.notes,
        enrichment_data: lead.enrichment_data as Record<string, unknown> | null,
      });
      const { error: updateErr } = await supabase
        .from("leads")
        .update({ score, updated_at: now })
        .eq("id", lead.id);
      if (!updateErr) updated++;
    }

    return new Response(
      JSON.stringify({ ok: true, updated, total: leads.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[recompute-lead-scores]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
