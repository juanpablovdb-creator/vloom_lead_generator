// Leadflow Vloom - Edge Function: enrich leads with people from harvestapi/linkedin-company-employees
// Receives: { leadIds: string[] }. Fetches leads and user's active personas; for each distinct company
// runs the actor with company URL + persona filters; creates one lead row per person found (same company, new contact).

import { normalizeApifyRunStatus } from "../_shared/apifyStatus.ts";
import { resolveUserAndClient } from "../_shared/resolveUserAndClient.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.102.1";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const LINKEDIN_EMPLOYEES_ACTOR = "harvestapi/linkedin-company-employees";

function toApifyActorId(actorId: string): string {
  return actorId.includes("/") ? actorId.replace("/", "~") : actorId;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vloom-enrich-secret",
};

interface RequestBody {
  leadIds: string[];
  /** Used only for non-JWT fallback (shared secret path). */
  userId?: string;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function normUrl(url: string): string {
  let s = url.toLowerCase().replace(/\/$/, "");
  if (!s.startsWith("http")) s = `https://www.linkedin.com/company/${s}`;
  return s;
}

function createServiceRoleClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Map persona profile_scraper_mode to actor input value. */
function mapProfileScraperMode(mode: string | null): string {
  if (!mode) return "Full + email search ($12 per 1k)";
  if (mode === "Full + email search") return "Full + email search ($12 per 1k)";
  if (mode === "Full") return "Full ($8 per 1k)";
  if (mode === "Short") return "Short ($4 per 1k)";
  return "Full + email search ($12 per 1k)";
}

interface LeadTemplate {
  id: string;
  user_id: string;
  company_name: string | null;
  company_url: string | null;
  company_linkedin_url: string | null;
  company_size: string | null;
  company_industry: string | null;
  company_description: string | null;
  company_funding: string | null;
  company_location: string | null;
}

interface PersonaRow {
  id: string;
  persona_function: string | null;
  seniority: string | null;
  job_title_keywords: string[];
  locations: string[];
  max_items: number | null;
  profile_scraper_mode: string | null;
}

/** Extract contact name from profile (firstName + lastName or headline). */
function profileContactName(p: Record<string, unknown>): string {
  const first = str(p.firstName ?? p.first_name);
  const last = str(p.lastName ?? p.last_name);
  if (first || last) return `${first} ${last}`.trim();
  return str(p.headline ?? p.name) || "—";
}

/** Extract job title from profile (headline or first experience position). */
function profileTitle(p: Record<string, unknown>): string {
  const headline = str(p.headline);
  if (headline) return headline;
  const exp = p.experience as Array<{ position?: string }> | undefined;
  const pos = exp?.[0]?.position;
  return str(pos) || "";
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
    const enrichSecret = Deno.env.get('VLOOM_ENRICH_SECRET') ?? '';
    const providedSecret = req.headers.get('x-vloom-enrich-secret') ?? '';
    const secretOk = enrichSecret.length > 0 && providedSecret === enrichSecret;

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

    // Auth: valid JWT → RLS client; invalid JWT + secret + userId → service role; no JWT + secret → service role.
    let supabase: SupabaseClient | null = null;
    let userId: string | null = null;
    const uidFromBody = typeof body.userId === 'string' ? body.userId.trim() : '';

    const useServiceRoleForSecret = (): Response | null => {
      if (!secretOk) return null;
      const sr = createServiceRoleClient();
      if (!sr) {
        return new Response(JSON.stringify({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for enrich fallback." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!uidFromBody) {
        return new Response(JSON.stringify({
          error: "userId is required when using enrich secret (invalid session JWT or no Authorization).",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      supabase = sr;
      userId = uidFromBody;
      return null;
    };

    if (authHeader) {
      const resolved = await resolveUserAndClient(authHeader);
      if (resolved.ok) {
        supabase = resolved.supabase;
        userId = resolved.user?.id ?? null;
      } else {
        const srErr = useServiceRoleForSecret();
        if (srErr) return srErr;
        if (!userId) {
          const reason = resolved.message.toLowerCase().includes("expired")
            ? "Session expired. Please sign in again."
            : resolved.message;
          return new Response(JSON.stringify({ error: reason }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } else {
      const srErr = useServiceRoleForSecret();
      if (srErr) return srErr;
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, user_id, company_name, company_url, company_linkedin_url, company_size, company_industry, company_description, company_funding, company_location")
      .in("id", leadIds);

    if (leadsErr || !leads?.length) {
      return new Response(
        JSON.stringify({ error: leadsErr?.message ?? "No leads found or access denied." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // When using service role fallback, ensure we're scoped to the provided userId.
    const leadsArray = (leads ?? []) as LeadTemplate[];
    const scopedLeads = userId ? leadsArray.filter((l) => l.user_id === userId) : leadsArray;
    if (!scopedLeads.length) {
      return new Response(JSON.stringify({ error: "No leads found or access denied." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Could not determine user id for personas." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: personas, error: personasErr } = await supabase
      .from("personas")
      .select("id, persona_function, seniority, job_title_keywords, locations, max_items, profile_scraper_mode")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (personasErr) {
      return new Response(
        JSON.stringify({ error: personasErr.message ?? "Failed to load personas." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const activePersonas = (personas ?? []) as PersonaRow[];
    if (activePersonas.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active personas. Add and activate at least one persona in the Personas tab." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group leads by company (by company_linkedin_url or company_name); keep one template per company
    const companyKeyToTemplate = new Map<string, LeadTemplate>();
    for (const lead of scopedLeads as LeadTemplate[]) {
      const url = str(lead.company_linkedin_url);
      const name = str(lead.company_name);
      const key = url ? normUrl(url) : (name ? name.toLowerCase() : "");
      if (!key) continue;
      if (!companyKeyToTemplate.has(key)) {
        companyKeyToTemplate.set(key, lead);
      }
    }

    const apiToken = Deno.env.get("APIFY_API_TOKEN");
    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: "APIFY_API_TOKEN not configured in Edge Function Secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Merge persona filters for actor input (one run per company)
    const allJobTitles: string[] = [];
    const allLocations: string[] = [];
    let maxItems = 50;
    let profileScraperMode = "Full + email search ($12 per 1k)";
    const searchParts: string[] = [];
    for (const p of activePersonas) {
      if (p.job_title_keywords?.length) allJobTitles.push(...p.job_title_keywords);
      if (p.locations?.length) allLocations.push(...p.locations);
      if (p.max_items != null && p.max_items > 0) maxItems = Math.max(maxItems, p.max_items);
      if (p.profile_scraper_mode) profileScraperMode = mapProfileScraperMode(p.profile_scraper_mode);
      if (p.persona_function) searchParts.push(p.persona_function);
      if (p.seniority) searchParts.push(p.seniority);
    }
    const searchQuery = [...new Set(searchParts)].join(" ").trim() || undefined;
    const jobTitles = [...new Set(allJobTitles)].slice(0, 20);
    const locations = [...new Set(allLocations)].slice(0, 20);

    let leadsCreated = 0;
    const now = new Date().toISOString();
    const defaultWeights = { has_email: 25, has_linkedin: 15, company_size_match: 20, industry_match: 20, recent_posting: 20 };

    for (const [, template] of companyKeyToTemplate) {
      const companyUrl = str(template.company_linkedin_url);
      const companyName = str(template.company_name);
      const companiesInput: string[] = [];
      if (companyUrl && (companyUrl.includes("linkedin.com") || !companyUrl.startsWith("http"))) {
        companiesInput.push(companyUrl.includes("linkedin.com") ? companyUrl : `https://www.linkedin.com/company/${encodeURIComponent(companyUrl)}`);
      } else if (companyName) {
        companiesInput.push(companyName);
      }
      if (companiesInput.length === 0) continue;

      const actorInput: Record<string, unknown> = {
        companies: companiesInput,
        profileScraperMode,
        maxItems: Math.min(maxItems, 2500),
      };
      if (jobTitles.length > 0) actorInput.jobTitles = jobTitles;
      if (locations.length > 0) actorInput.locations = locations;
      if (searchQuery) actorInput.searchQuery = searchQuery;

      const actorId = toApifyActorId(LINKEDIN_EMPLOYEES_ACTOR);
      const runUrl = `${APIFY_BASE_URL}/acts/${actorId}/runs?waitForFinish=180`;
      const runRes = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
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
        console.error("[enrich-lead-personas] Apify run failed", msg);
        continue; // skip this company, try next
      }

      const runData = await runRes.json();
      const runId = runData?.data?.id;
      let datasetId = runData?.data?.defaultDatasetId;
      let status = normalizeApifyRunStatus(runData?.data?.status);

      if ((status === "RUNNING" || status === "READY") && runId) {
        for (let i = 0; i < 90; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const statusRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
            headers: { Authorization: `Bearer ${apiToken}` },
          });
          if (!statusRes.ok) break;
          const statusData = await statusRes.json();
          status = normalizeApifyRunStatus(statusData?.data?.status);
          if (status === "SUCCEEDED") {
            datasetId = statusData?.data?.defaultDatasetId ?? datasetId;
            break;
          }
          if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") break;
        }
      }

      if (status !== "SUCCEEDED" || !datasetId) continue;

      const dsRes = await fetch(`${APIFY_BASE_URL}/datasets/${datasetId}/items?format=json`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!dsRes.ok) continue;

      const raw = await dsRes.json();
      const items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? []);

      for (const item of items as Record<string, unknown>[]) {
        const contactLinkedIn = str(item.linkedinUrl ?? item.linkedin_url);
        if (!contactLinkedIn) continue;
        // Job listing URLs are not people; including them caused bad rows and unique conflicts.
        if (/\/jobs\/view\//i.test(contactLinkedIn)) continue;

        const withoutSlash = contactLinkedIn.trim().replace(/\/$/, "");
        const urlVariants = [...new Set([withoutSlash, `${withoutSlash}/`, contactLinkedIn.trim()])];

        // Dedupe: skip if we already have a lead for this user + contact (same person)
        const { data: existing } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", template.user_id)
          .in("contact_linkedin_url", urlVariants)
          .limit(1);
        if (existing?.length) continue;

        const contactName = profileContactName(item);
        const contactTitle = profileTitle(item);
        const contactEmail = str(item.email ?? item.contactEmail);

        const newLead = {
          user_id: template.user_id,
          is_shared: false,
          job_title: null,
          job_description: null,
          job_url: null,
          job_source: null,
          job_location: null,
          job_salary_range: null,
          job_posted_at: null,
          company_name: template.company_name,
          company_url: template.company_url,
          company_linkedin_url: template.company_linkedin_url,
          company_size: template.company_size,
          company_industry: template.company_industry,
          company_description: template.company_description,
          company_funding: template.company_funding,
          company_location: template.company_location,
          contact_name: contactName || null,
          contact_title: contactTitle || null,
          contact_email: contactEmail || null,
          contact_linkedin_url: withoutSlash || null,
          contact_phone: null,
          status: "backlog",
          score: 0,
          score_weights: defaultWeights,
          enrichment_data: item,
          last_enriched_at: now,
          notes: null,
          tags: [],
          scraping_job_id: null,
          job_external_id: null,
          is_marked_as_lead: true,
          channel: "LinkedIn",
        };

        const { data: inserted, error: insertErr } = await supabase
          .from("leads")
          .insert(newLead as never)
          .select("id")
          .single();

        if (insertErr) {
          const code = (insertErr as { code?: string }).code;
          if (code === "23505") {
            console.warn("[enrich-lead-personas] skip duplicate lead", insertErr.message);
            continue;
          }
          console.error("[enrich-lead-personas] insert error", insertErr);
          continue;
        }

        leadsCreated++;

        const taskTitle = `Contact ${[template.company_name, contactName].filter(Boolean).join(" – ") || "lead"}`;
        await supabase.from("tasks").insert({
          user_id: template.user_id,
          lead_id: (inserted as { id: string }).id,
          title: taskTitle,
          status: "pending",
        } as never);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        leadsCreated,
        companiesProcessed: companyKeyToTemplate.size,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[enrich-lead-personas] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});