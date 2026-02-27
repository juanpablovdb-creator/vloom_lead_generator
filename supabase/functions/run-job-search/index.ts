// Leadflow Vloom - Edge Function: run job search (Apify) with secret API key
// Receives: actorId, input?, savedSearchId?. Uses JWT for Supabase RLS. Returns { scrapingJobId, imported, skipped, totalFromApify }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeLeadScore } from "../_shared/leadScore.ts";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const LINKEDIN_JOBS_ACTOR = "harvestapi/linkedin-job-search";

/** API docs: actorId is username~actor-name (tilde). Normalize slash to tilde for URL. */
function toApifyActorId(actorId: string): string {
  return actorId.includes("/") ? actorId.replace("/", "~") : actorId;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  actorId: string;
  input?: Record<string, unknown>;
  savedSearchId?: string;
}

interface JobResult {
  title: string;
  company: string;
  companyUrl?: string;
  companyLinkedinUrl?: string;
  companyDescription?: string;
  companySize?: string;
  companyWebsite?: string;
  location?: string;
  salary?: string;
  description?: string;
  url: string;
  postedAt?: string;
  source: string;
  externalId?: string;
  /** Recruiter / job poster name if the actor returns it (e.g. recruiterName, poster.name). */
  recruiterName?: string;
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Map UI postedLimit to Apify Actor schema: "1h" | "24h" | "week" | "month" */
function mapPostedLimitToApify(postedLimit: string): string {
  const s = (postedLimit || "").toLowerCase();
  if (s.includes("1h") || s.includes("1 hour")) return "1h";
  if (s.includes("24") || s.includes("24h")) return "24h";
  if (s.includes("week") || s === "week") return "week";
  if (s.includes("month") || s === "month") return "month";
  return "1h";
}

function buildSearchParams(input: Record<string, unknown>): Record<string, unknown> {
  return {
    jobTitles: toArray(input.jobTitles ?? input.searchQueries ?? input.query ?? []),
    locations: toArray(input.locations ?? input.location ?? []),
    postedLimit: (input.postedLimit as string) ?? "Past Week",
    maxItems: typeof input.maxItems === "number" ? input.maxItems : Number(input.maxItems) || 500,
    sort: (input.sort as string) ?? "date",
  };
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function normalizeHarvestApiJobs(items: Record<string, unknown>[]): JobResult[] {
  return items.map((item) => {
    const company = item.company as Record<string, unknown> | undefined;
    const companyName =
      str(company?.name) || str(item.companyName) || str(item.company) || "";
    const locationObj = item.location as Record<string, unknown> | undefined;
    const locationText =
      str(locationObj?.linkedinText) ||
      str((locationObj?.parsed as Record<string, unknown>)?.text) ||
      str(item.location) ||
      "";
    const salaryObj = item.salary as Record<string, unknown> | undefined;
    const salaryText = str(salaryObj?.text) || str(item.salary) || "";
    const externalId = item.id != null ? str(item.id) : (item.externalId != null ? str(item.externalId) : undefined);
    let url =
      str(item.linkedinUrl) ||
      str(item.linkedin_url) ||
      str(item.url) ||
      str(item.jobUrl) ||
      str(item.link);
    if (!url && externalId) url = `https://www.linkedin.com/jobs/view/${externalId}/`;
    const postedDate = str(item.postedDate) || str(item.postedAt) || "";
    const employeeCount = company?.employeeCount as number | undefined;
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
        : undefined;

    const poster = item.poster as Record<string, unknown> | undefined;
    const jobPoster = item.jobPoster as Record<string, unknown> | undefined;
    const hiringTeam = item.hiringTeam as Array<{ name?: string }> | undefined;
    const recruiterName =
      str(item.recruiterName) ||
      str(item.posterName) ||
      (poster && "name" in poster ? str(poster.name) : "") ||
      (jobPoster && "name" in jobPoster ? str(jobPoster.name) : "") ||
      (Array.isArray(hiringTeam) && hiringTeam[0]?.name ? str(hiringTeam[0].name) : "");

    return {
      title: str(item.title) || str(item.jobTitle) || str(item.Title) || "Job",
      company: companyName,
      companyUrl: str(company?.linkedinUrl) || str(item.companyUrl) || "",
      companyLinkedinUrl: str(company?.linkedinUrl) || "",
      companyDescription: str(company?.description) || str(item.companyDescription) || "",
      companySize,
      companyWebsite: str(company?.website) || str(item.companyWebsite) || "",
      location: locationText,
      salary: salaryText,
      recruiterName: recruiterName || undefined,
      description:
        str(item.descriptionText) ||
        str(item.description) ||
        str(item.jobDescription) ||
        str(item.descriptionHtml) ||
        "",
      url,
      postedAt: postedDate,
      source: "linkedin",
      externalId: externalId || undefined,
    } as JobResult;
  });
}

Deno.serve(async (req: Request) => {
  console.log("[run-job-search] request", req.method, req.url);
  // CORS preflight
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
      : userError?.message ?? "You must be logged in to run a search.";
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

  const { actorId, input, savedSearchId } = body;
  if (!actorId || actorId !== LINKEDIN_JOBS_ACTOR) {
    return new Response(
      JSON.stringify({ error: `Only LinkedIn Jobs is supported. Received: ${actorId || "(empty)"}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let rawInput: Record<string, unknown>;
  if (savedSearchId) {
    const { data: saved, error: savedError } = await supabase
      .from("saved_searches")
      .select("input")
      .eq("id", savedSearchId)
      .single();
    if (savedError || !saved?.input) {
      return new Response(JSON.stringify({ error: "Saved search not found or has no input." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    rawInput = (saved.input as Record<string, unknown>) ?? {};
  } else {
    rawInput = input ?? {};
  }

  const params = buildSearchParams(rawInput) as { jobTitles: string[]; locations: string[]; postedLimit: string; maxItems: number; sort: string };
  if (!params.jobTitles?.length) {
    return new Response(JSON.stringify({ error: "At least one job title is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const searchQuery = params.jobTitles.join(", ");
  const searchFilters = {
    jobTitles: params.jobTitles,
    locations: params.locations,
    postedLimit: params.postedLimit,
    maxItems: params.maxItems,
    sort: params.sort,
  };

  // Auto-save every run so paid Apify data is always stored under a saved search
  let resolvedSavedSearchId: string | null = savedSearchId ?? null;
  if (!resolvedSavedSearchId) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const firstTitle = params.jobTitles?.[0]?.trim() || "LinkedIn Jobs";
    const autoName = `${firstTitle} – ${dateStr}, ${timeStr}`;
    const { data: savedRow, error: savedErr } = await supabase
      .from("saved_searches")
      .insert({
        user_id: user.id,
        name: autoName.slice(0, 255),
        actor_id: LINKEDIN_JOBS_ACTOR,
        input: rawInput,
        autorun: false,
      })
      .select("id")
      .single();
    if (!savedErr && savedRow?.id) {
      resolvedSavedSearchId = savedRow.id;
      console.log("[run-job-search] auto-created saved_search", resolvedSavedSearchId, autoName);
    }
  }

  // Insert with explicit columns only (no team_id) to avoid schema-cache issues
  const jobPayload: Record<string, unknown> = {
    user_id: user.id,
    actor_id: LINKEDIN_JOBS_ACTOR,
    run_id: null,
    saved_search_id: resolvedSavedSearchId,
    search_query: searchQuery,
    search_location: params.locations?.join(", ") ?? null,
    search_filters: searchFilters,
    status: "running",
    leads_found: 0,
    leads_imported: 0,
    error_message: null,
    started_at: new Date().toISOString(),
    completed_at: null,
  };
  const { data: jobRow, error: insertJobError } = await supabase
    .from("scraping_jobs")
    .insert(jobPayload as Record<string, never>)
    .select("id")
    .single();

  if (insertJobError || !jobRow) {
    return new Response(
      JSON.stringify({ error: insertJobError?.message ?? "Failed to create scraping job." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const scrapingJobId = jobRow.id;

  const apiToken = Deno.env.get("APIFY_API_TOKEN");
  if (!apiToken) {
    await supabase
      .from("scraping_jobs")
      .update({
        status: "failed",
        error_message: "APIFY_API_TOKEN not configured in Edge Function Secrets.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", scrapingJobId);
    return new Response(
      JSON.stringify({ error: "Apify API token not configured. Add APIFY_API_TOKEN in Edge Function Secrets." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const apifyInput = {
      jobTitles: params.jobTitles.filter(Boolean),
      locations: params.locations?.filter(Boolean) ?? [],
      postedLimit: mapPostedLimitToApify((params.postedLimit as string) ?? "Past Week"),
      maxItems: params.maxItems ?? 500,
      sortBy: (params.sort as string) ?? "date",
    };
    const actorIdForUrl = toApifyActorId(LINKEDIN_JOBS_ACTOR);
    const runUrl = `${APIFY_BASE_URL}/acts/${actorIdForUrl}/runs?waitForFinish=60`;
    const runRes = await fetch(runUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(apifyInput),
    });
    if (!runRes.ok) {
      const errText = await runRes.text();
      let msg = errText;
      try {
        const errBody = JSON.parse(errText) as { error?: { message?: string } };
        if (errBody?.error?.message) msg = errBody.error.message;
      } catch {
        // use errText as-is
      }
      throw new Error(`Apify run failed: ${msg}`);
    }
    const runData = await runRes.json();
    const runId = runData?.data?.id;
    const datasetId = runData?.data?.defaultDatasetId;
    const status = runData?.data?.status;

    if (status !== "SUCCEEDED" && status !== "RUNNING") {
      throw new Error(`Apify run status: ${status}`);
    }
    let resolvedDatasetId = datasetId;
    if (status === "SUCCEEDED" && !resolvedDatasetId && runId) {
      await new Promise((r) => setTimeout(r, 2000));
      const refetch = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (refetch.ok) {
        const refetchData = await refetch.json();
        resolvedDatasetId = refetchData?.data?.defaultDatasetId ?? resolvedDatasetId;
      }
    }
    if (status === "SUCCEEDED" && !resolvedDatasetId) {
      throw new Error("No dataset ID from Apify run. Try again in a moment.");
    }

    const apifyHeaders = { Authorization: `Bearer ${apiToken}` };
    let items: Record<string, unknown>[] = [];
    if (status === "SUCCEEDED" && resolvedDatasetId) {
      const dsRes = await fetch(
        `${APIFY_BASE_URL}/datasets/${resolvedDatasetId}/items?format=json`,
        { headers: apifyHeaders }
      );
      if (!dsRes.ok) {
        const errBody = await dsRes.json().catch(() => ({}));
        const msg = (errBody as { error?: { message?: string } })?.error?.message;
        throw new Error(msg ?? `Failed to get dataset items (${dsRes.status})`);
      }
      const raw = await dsRes.json();
      items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? []);
    } else if (status === "RUNNING" && runId) {
      const maxWait = 600;
      const step = 5;
      for (let waited = 0; waited < maxWait; waited += step) {
        await new Promise((r) => setTimeout(r, step * 1000));
        const statusRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
          headers: apifyHeaders,
        });
        if (!statusRes.ok) {
          const errBody = await statusRes.json().catch(() => ({}));
          const msg = (errBody as { error?: { message?: string } })?.error?.message;
          throw new Error(msg ?? "Failed to get run status");
        }
        const statusData = await statusRes.json();
        const s = statusData?.data?.status;
        if (s === "SUCCEEDED") {
          const dsRes = await fetch(
            `${APIFY_BASE_URL}/datasets/${statusData.data.defaultDatasetId}/items?format=json`,
            { headers: apifyHeaders }
          );
          if (!dsRes.ok) {
            const errBody = await dsRes.json().catch(() => ({}));
            const msg = (errBody as { error?: { message?: string } })?.error?.message;
            throw new Error(msg ?? "Failed to get dataset items");
          }
          const raw = await dsRes.json();
          items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? []);
          break;
        }
        if (s === "FAILED") throw new Error("Apify run failed.");
      }
    }

    const jobs = normalizeHarvestApiJobs(items);
    const totalFromApify = jobs.length;
    console.log("[run-job-search] apify items", items.length, "normalized", jobs.length);

    const { data: leads } = await supabase
      .from("leads")
      .select("job_url")
      .eq("user_id", user.id)
      .not("job_url", "is", null);
    const existingUrls = new Set<string>();
    (leads ?? []).forEach((r: { job_url: string | null }) => {
      if (r.job_url) existingUrls.add(r.job_url);
    });
    const newJobs = jobs.filter((j) => j.url && !existingUrls.has(j.url));
    console.log("[run-job-search] new jobs to insert", newJobs.length, "existing urls", existingUrls.size);

    const leadsToInsert = newJobs.map((job) => {
      const enrichment_data: Record<string, unknown> = {};
      if (job.companySize != null) enrichment_data.companySize = job.companySize;
      if (job.companyWebsite != null) enrichment_data.companyWebsite = job.companyWebsite;
      if (job.externalId != null) enrichment_data.externalId = job.externalId;
      const score = computeLeadScore({
        job_location: job.location ?? null,
        company_location: null,
        company_size: job.companySize ?? null,
        company_funding: null,
        job_description: job.description ?? null,
        notes: null,
        enrichment_data,
      });
      return {
        user_id: user.id,
        is_shared: false,
        scraping_job_id: scrapingJobId,
        job_external_id: job.externalId ?? null,
        is_marked_as_lead: false,
        job_title: job.title,
        job_description: job.description ?? null,
        job_url: job.url,
        job_source: job.source,
        job_location: job.location ?? null,
        job_salary_range: job.salary ?? null,
        job_posted_at: job.postedAt ?? null,
        company_name: job.company,
        company_url: job.companyUrl ?? null,
        company_linkedin_url: job.companyLinkedinUrl ?? null,
        company_description: job.companyDescription ?? null,
        company_size: job.companySize ?? null,
        company_location: null,
        company_industry: null,
        company_funding: null,
        contact_name: job.recruiterName ?? null,
        contact_title: null,
        contact_email: null,
        contact_linkedin_url: null,
        status: "backlog",
        score,
        enrichment_data,
        tags: [],
      };
    });

    if (leadsToInsert.length === 0) {
      await supabase
        .from("scraping_jobs")
        .update({
          leads_found: jobs.length,
          leads_imported: 0,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", scrapingJobId);
      return new Response(
        JSON.stringify({
          scrapingJobId,
          imported: 0,
          skipped: jobs.length,
          totalFromApify,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: inserted, error: insertLeadError } = await supabase
      .from("leads")
      .insert(leadsToInsert)
      .select("id");

    if (insertLeadError) {
      const insertMsg =
        insertLeadError?.message ??
        (insertLeadError as { details?: string })?.details ??
        String(insertLeadError);
      await supabase
        .from("scraping_jobs")
        .update({
          status: "failed",
          error_message: insertMsg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", scrapingJobId);
      throw new Error(insertMsg);
    }

    await supabase
      .from("scraping_jobs")
      .update({
        leads_found: jobs.length,
        leads_imported: inserted?.length ?? 0,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", scrapingJobId);

    return new Response(
      JSON.stringify({
        scrapingJobId,
        imported: inserted?.length ?? 0,
        skipped: jobs.length - (inserted?.length ?? 0),
        totalFromApify,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("scraping_jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", scrapingJobId);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[run-job-search] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
