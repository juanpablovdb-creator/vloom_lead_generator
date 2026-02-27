// Leadflow Vloom - Edge Function: enrich selected leads with Harvest API LinkedIn Company data
// Receives: { leadIds: string[] }. Marks leads as lead + backlog are done by the client.
// This function fetches those leads, runs harvestapi/linkedin-company, and updates enrichment_data + company_* fields.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeLeadScore } from "../_shared/leadScore.ts";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const LINKEDIN_COMPANY_ACTOR = "harvestapi/linkedin-company";

function toApifyActorId(actorId: string): string {
  return actorId.includes("/") ? actorId.replace("/", "~") : actorId;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  leadIds: string[];
}

interface LeadRow {
  id: string;
  company_linkedin_url: string | null;
  company_name: string | null;
  job_location?: string | null;
  job_description?: string | null;
  notes?: string | null;
  company_funding?: string | null;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

/** Normalize LinkedIn company URL for matching (lowercase, no trailing slash). */
function normUrl(url: string): string {
  let s = url.toLowerCase().replace(/\/$/, "");
  if (!s.startsWith("http")) s = `https://www.linkedin.com/company/${s}`;
  return s;
}

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

    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      const reason = userError?.message?.toLowerCase().includes("expired")
        ? "Session expired. Please sign in again."
        : userError?.message ?? "You must be logged in.";
      return new Response(JSON.stringify({ error: reason }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { leadIds } = body;
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return new Response(JSON.stringify({ error: "leadIds must be a non-empty array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: leads, error: fetchError } = await supabase
      .from("leads")
      .select("id, company_linkedin_url, company_name, job_location, job_description, notes, company_funding")
      .in("id", leadIds);

    if (fetchError || !leads?.length) {
      return new Response(
        JSON.stringify({ error: fetchError?.message ?? "No leads found or access denied." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyUrls: string[] = [];
    const companyNames: string[] = [];
    const leadByUrl = new Map<string, LeadRow>();
    const leadByName = new Map<string, LeadRow>();

    for (const lead of leads as LeadRow[]) {
      const url = str(lead.company_linkedin_url);
      const name = str(lead.company_name);
      if (url && (url.includes("linkedin.com") || !url.startsWith("http"))) {
        const normalized = url.includes("linkedin.com") ? url : `https://www.linkedin.com/company/${encodeURIComponent(url)}`;
        companyUrls.push(normalized);
        leadByUrl.set(normUrl(normalized), lead);
      } else if (name) {
        companyNames.push(name);
        leadByName.set(name.toLowerCase(), lead);
      }
    }

    const apiToken = Deno.env.get("APIFY_API_TOKEN");
    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: "APIFY_API_TOKEN not configured in Edge Function Secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const enriched = new Set<string>();
    const now = new Date().toISOString();

    if (companyUrls.length > 0 || companyNames.length > 0) {
      const actorInput: Record<string, unknown> = {};
      if (companyUrls.length > 0) actorInput.companies = companyUrls;
      if (companyNames.length > 0) actorInput.searches = companyNames;

      const actorIdForUrl = toApifyActorId(LINKEDIN_COMPANY_ACTOR);
      const runUrl = `${APIFY_BASE_URL}/acts/${actorIdForUrl}/runs?waitForFinish=120`;
      const runRes = await fetch(runUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(actorInput),
      });

      if (!runRes.ok) {
        const errText = await runRes.text();
        let msg = errText;
        try {
          const errBody = JSON.parse(errText) as { error?: { message?: string } };
          if (errBody?.error?.message) msg = errBody.error.message;
        } catch {
          // use errText
        }
        return new Response(JSON.stringify({ error: `Apify run failed: ${msg}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const runData = await runRes.json();
      const runId = runData?.data?.id;
      const datasetId = runData?.data?.defaultDatasetId;
      const status = runData?.data?.status;

      if (status !== "SUCCEEDED" && status !== "RUNNING") {
        return new Response(
          JSON.stringify({ error: `Apify run status: ${status}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let items: Record<string, unknown>[] = [];
      let resolvedDatasetId = datasetId;
      if (status === "RUNNING" && runId) {
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const statusRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
            headers: { Authorization: `Bearer ${apiToken}` },
          });
          if (!statusRes.ok) break;
          const statusData = await statusRes.json();
          const s = statusData?.data?.status;
          if (s === "SUCCEEDED") {
            resolvedDatasetId = statusData?.data?.defaultDatasetId ?? resolvedDatasetId;
            break;
          }
          if (s === "FAILED") {
            return new Response(JSON.stringify({ error: "Apify company enrichment run failed." }), {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      if (resolvedDatasetId) {
        const dsRes = await fetch(
          `${APIFY_BASE_URL}/datasets/${resolvedDatasetId}/items?format=json`,
          { headers: { Authorization: `Bearer ${apiToken}` } }
        );
        if (dsRes.ok) {
          const raw = await dsRes.json();
          items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? []);
        }
      }

      for (const item of items) {
        const linkedinUrl = str(item.linkedinUrl ?? item.linkedin_url ?? item.url);
        const name = str(item.name ?? item.companyName);
        const employeeCount = item.employeeCount as number | undefined;
        const companySize =
          employeeCount != null
            ? employeeCount <= 10
              ? "1-10"
              : employeeCount <= 50
                ? "11-50"
                : employeeCount <= 200
                  ? "51-200"
                  : employeeCount <= 500
                    ? "201-500"
                    : "501+"
            : null;
        const industriesRaw = item.industries;
        let industry: string | null = null;
        if (Array.isArray(industriesRaw) && industriesRaw.length > 0) {
          const first = industriesRaw[0];
          industry = typeof first === "string" ? first : (first && typeof first === "object" && "name" in first ? str((first as { name?: unknown }).name) : null);
        }
        const locations = item.locations as Array<{ parsed?: { text?: string }; description?: string }> | undefined;
        const locText = locations?.[0]?.parsed?.text ?? locations?.[0]?.description ?? null;
        const description = str(item.description ?? item.tagline);
        const website = str(item.website);

        let lead: LeadRow | undefined;
        if (linkedinUrl) lead = leadByUrl.get(normUrl(linkedinUrl));
        if (!lead && name) lead = leadByName.get(name.toLowerCase());

        if (lead) {
          enriched.add(lead.id);
          const enrichment_data: Record<string, unknown> = { ...(item as Record<string, unknown>) };
          const score = computeLeadScore({
            job_location: lead.job_location ?? undefined,
            company_location: locText ?? undefined,
            company_size: companySize ?? undefined,
            company_funding: lead.company_funding ?? undefined,
            job_description: lead.job_description ?? undefined,
            notes: lead.notes ?? undefined,
            enrichment_data,
          });
          const { error: updateErr } = await supabase
            .from("leads")
            .update({
              company_size: companySize ?? undefined,
              company_industry: industry ?? undefined,
              company_url: website || undefined,
              company_description: description || undefined,
              company_location: locText ?? undefined,
              enrichment_data,
              score,
              last_enriched_at: now,
              updated_at: now,
            })
            .eq("id", lead.id);
          if (updateErr) console.error("[enrich-lead-companies] update error", lead.id, updateErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        enriched: enriched.size,
        total: leads.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[enrich-lead-companies] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
