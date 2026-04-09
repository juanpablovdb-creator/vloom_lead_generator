// Leadflow Vloom - Edge Function: run job search (Apify) with secret API key
// Receives: actorId, input?, savedSearchId?. Uses JWT for Supabase RLS.
// Returns: { scrapingJobId, imported, skipped, totalFromApify, savedSearchId?, savedSearchName? }.

import { normalizeApifyRunStatus } from "../_shared/apifyStatus.ts";
import { importLinkedInJobsFromItems } from "../_shared/linkedinJobImport.ts";
import { mapWorkplaceTypesToHarvestApi } from "../_shared/mapHarvestWorkplaceTypes.ts";
import { resolveUserAndClient } from "../_shared/resolveUserAndClient.ts";

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
    workplaceType: toArray(input.workplaceType ?? []),
    employmentType: toArray(input.employmentType ?? []),
    experienceLevel: toArray(input.experienceLevel ?? []),
    // Keep raw excludeDomains (string or comma-separated) so we can filter after scraping.
    excludeDomains: input.excludeDomains ?? input.excludeDomain ?? "",
  };
}

/** LinkedIn "Remote" is a workplace filter, not a geo location for HarvestAPI. */
function splitRemoteFromLocations(
  locations: string[],
  workplaceTypeFromInput: string[],
): { geoLocations: string[]; workplaceTypes: string[] } {
  const workplace = new Set<string>(
    workplaceTypeFromInput.map((w) => w.trim()).filter(Boolean),
  );
  const geo: string[] = [];
  for (const loc of locations) {
    const t = loc.trim();
    if (!t) continue;
    if (t.toLowerCase() === "remote") workplace.add("Remote");
    else geo.push(t);
  }
  return { geoLocations: geo, workplaceTypes: [...workplace] };
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

    const resolved = await resolveUserAndClient(authHeader);
    if (!resolved.ok) {
      const reason = resolved.message.toLowerCase().includes("expired")
        ? "Session expired. Please sign in again."
        : resolved.message;
      return new Response(JSON.stringify({ error: reason }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { user, supabase } = resolved;

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
  let resolvedSavedSearchName: string | null = null;
  if (savedSearchId) {
    const { data: saved, error: savedError } = await supabase
      .from("saved_searches")
      .select("input, name")
      .eq("id", savedSearchId)
      .single();
    if (savedError || !saved?.input) {
      return new Response(JSON.stringify({ error: "Saved search not found or has no input." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    rawInput = (saved.input as Record<string, unknown>) ?? {};
    resolvedSavedSearchName = typeof saved.name === "string" ? saved.name : null;
  } else {
    rawInput = input ?? {};
  }

  const params = buildSearchParams(rawInput) as {
    jobTitles: string[];
    locations: string[];
    postedLimit: string;
    maxItems: number;
    sort: string;
    workplaceType?: string[];
    employmentType?: string[];
    experienceLevel?: string[];
    excludeDomains?: unknown;
  };
  if (!params.jobTitles?.length) {
    return new Response(JSON.stringify({ error: "At least one job title is required." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const searchQuery = params.jobTitles.join(", ");
  const wt = toArray(params.workplaceType);
  const et = toArray(params.employmentType);
  const el = toArray(params.experienceLevel);
  const { geoLocations, workplaceTypes } = splitRemoteFromLocations(
    toArray(params.locations),
    wt,
  );
  const searchFilters = {
    jobTitles: params.jobTitles,
    locations: geoLocations,
    workplaceType: workplaceTypes,
    employmentType: et,
    experienceLevel: el,
    postedLimit: params.postedLimit,
    maxItems: params.maxItems,
    sort: params.sort,
    excludeDomains: params.excludeDomains,
  };

  // Auto-save every run so paid Apify data is always stored under a saved search
  let resolvedSavedSearchId: string | null = savedSearchId ?? null;
  if (!resolvedSavedSearchId) {
    const now = new Date();
    // Use a fixed UTC-5 timezone for naming (matches business timezone regardless of server region).
    const timeZone = "America/Bogota";
    const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
    const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
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
      resolvedSavedSearchName = autoName.slice(0, 255);
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
    search_location: geoLocations.length > 0 ? geoLocations.join(", ") : null,
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
    const apifyInput: Record<string, unknown> = {
      jobTitles: params.jobTitles.filter(Boolean),
      locations: geoLocations.filter(Boolean),
      postedLimit: mapPostedLimitToApify((params.postedLimit as string) ?? "Past Week"),
      maxItems: params.maxItems ?? 500,
      sortBy: (params.sort as string) ?? "date",
    };
    const mappedWorkplace = mapWorkplaceTypesToHarvestApi(workplaceTypes);
    if (mappedWorkplace.length > 0) apifyInput.workplaceType = mappedWorkplace;
    if (et.length > 0) apifyInput.employmentType = et;
    if (el.length > 0) apifyInput.experienceLevel = el;
    const actorIdForUrl = toApifyActorId(LINKEDIN_JOBS_ACTOR);

    const parseApifyRunError = async (runRes: Response): Promise<never> => {
      const errText = await runRes.text();
      let msg = errText;
      try {
        const errBody = JSON.parse(errText) as { error?: { message?: string } };
        if (errBody?.error?.message) msg = errBody.error.message;
      } catch {
        // use errText as-is
      }
      throw new Error(`Apify run failed: ${msg}`);
    };

    const startApifyRun = async (runUrl: string) => {
      const runRes = await fetch(runUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(apifyInput),
      });
      if (!runRes.ok) await parseApifyRunError(runRes);
      return runRes.json() as Promise<{ data?: { id?: string; defaultDatasetId?: string; status?: string } }>;
    };

    const webhookSecret = Deno.env.get("APIFY_WEBHOOK_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrlBase = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");

    if (webhookSecret && serviceRoleKey && supabaseUrlBase.length > 0) {
      const webhookUrl =
        `${supabaseUrlBase}/functions/v1/apify-job-webhook?secret=${encodeURIComponent(webhookSecret)}`;
      const webhooksPayload = [
        {
          eventTypes: [
            "ACTOR.RUN.SUCCEEDED",
            "ACTOR.RUN.FAILED",
            "ACTOR.RUN.ABORTED",
            "ACTOR.RUN.TIMED_OUT",
            "ACTOR.RUN.TIMED-OUT",
          ],
          requestUrl: webhookUrl,
        },
      ];
      const webhooksParam = btoa(JSON.stringify(webhooksPayload));
      const asyncRunUrl =
        `${APIFY_BASE_URL}/acts/${actorIdForUrl}/runs?waitForFinish=0&webhooks=${encodeURIComponent(webhooksParam)}`;
      const asyncRunData = await startApifyRun(asyncRunUrl);
      const asyncRunId = asyncRunData?.data?.id;
      if (!asyncRunId) throw new Error("Apify did not return a run id.");
      const { error: runUpdateErr } = await supabase
        .from("scraping_jobs")
        .update({ run_id: asyncRunId })
        .eq("id", scrapingJobId);
      if (runUpdateErr) {
        console.error("[run-job-search] failed to save run_id", runUpdateErr.message);
        throw new Error(runUpdateErr.message);
      }
      console.log("[run-job-search] async mode, run_id", asyncRunId);
      return new Response(
        JSON.stringify({
          async: true,
          scrapingJobId,
          apifyRunId: asyncRunId,
          imported: 0,
          skipped: 0,
          totalFromApify: 0,
          savedSearchId: resolvedSavedSearchId,
          savedSearchName: resolvedSavedSearchName,
          message:
            "Search started. Leads import when Apify finishes (webhook). Refresh Leads in a few minutes.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const runUrl = `${APIFY_BASE_URL}/acts/${actorIdForUrl}/runs?waitForFinish=60`;
    const runData = await startApifyRun(runUrl);
    const runId = runData?.data?.id;
    const datasetId = runData?.data?.defaultDatasetId;
    const statusRaw = runData?.data?.status;
    const status = normalizeApifyRunStatus(statusRaw);

    if (status !== "SUCCEEDED" && status !== "RUNNING" && status !== "READY") {
      throw new Error(`Apify run status: ${(statusRaw ?? status) || "unknown"}`);
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
    } else if ((status === "RUNNING" || status === "READY") && runId) {
      const maxWait = 600;
      const step = 5;
      let pollFinished = false;
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
        const s = normalizeApifyRunStatus(statusData?.data?.status);
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
          pollFinished = true;
          break;
        }
        if (s === "FAILED" || s === "ABORTED" || s === "TIMED-OUT") {
          throw new Error(`Apify run ended with status: ${s}`);
        }
      }
      if (!pollFinished) {
        const finalRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
          headers: apifyHeaders,
        });
        const finalData = finalRes.ok ? await finalRes.json() : null;
        const fs = finalData?.data?.status != null
          ? String(finalData.data.status)
          : "UNKNOWN";
        throw new Error(
          `Apify run did not finish in time (last status: ${fs}). Try again or check the run in Apify Console.`,
        );
      }
    }

    console.log("[run-job-search] sync mode apify items", items.length);
    const filtersForImport = searchFilters as Record<string, unknown>;
    const result = await importLinkedInJobsFromItems({
      supabase,
      scrapingJobId,
      userId: user.id,
      items,
      searchFilters: filtersForImport,
    });
    return new Response(
      JSON.stringify({
        scrapingJobId,
        imported: result.imported,
        skipped: result.skipped,
        totalFromApify: result.totalFromApify,
        savedSearchId: resolvedSavedSearchId,
        savedSearchName: resolvedSavedSearchName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
