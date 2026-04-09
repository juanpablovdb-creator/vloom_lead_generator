// Apify ad-hoc webhook: when LinkedIn Jobs actor run finishes, import dataset into leads.
// Secrets: APIFY_WEBHOOK_SECRET (must match query ?secret=), APIFY_API_TOKEN, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchApifyDatasetItems, importLinkedInJobsFromItems } from "../_shared/linkedinJobImport.ts";

const LINKEDIN_JOBS_ACTOR = "harvestapi/linkedin-job-search";

function extractWebhookRunInfo(body: unknown): {
  eventType: string | undefined;
  actorRunId: string | undefined;
  datasetId: string | undefined;
} {
  if (!body || typeof body !== "object") {
    return { eventType: undefined, actorRunId: undefined, datasetId: undefined };
  }
  let b = body as Record<string, unknown>;
  const inner = b.data as Record<string, unknown> | undefined;
  if (inner && typeof inner === "object") b = inner;

  const eventType =
    typeof b.eventType === "string"
      ? b.eventType
      : typeof b.event === "string"
        ? b.event
        : undefined;
  const resource = b.resource as Record<string, unknown> | undefined;
  const eventData = b.eventData as Record<string, unknown> | undefined;
  const actorRunId =
    (typeof resource?.id === "string" ? resource.id : undefined) ||
    (typeof eventData?.actorRunId === "string" ? eventData.actorRunId : undefined) ||
    (typeof b.actorRunId === "string" ? b.actorRunId : undefined);
  const datasetId =
    typeof resource?.defaultDatasetId === "string" ? resource.defaultDatasetId : undefined;
  return { eventType, actorRunId, datasetId };
}

async function resolveDatasetId(runId: string, apiToken: string): Promise<string | null> {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { data?: { defaultDatasetId?: string } };
  const id = j?.data?.defaultDatasetId;
  return typeof id === "string" ? id : null;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const expected = Deno.env.get("APIFY_WEBHOOK_SECRET");

  if (!expected || secret !== expected) {
    console.warn("[apify-job-webhook] invalid or missing secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiToken = Deno.env.get("APIFY_API_TOKEN");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!apiToken || !serviceKey || !supabaseUrl) {
    console.error("[apify-job-webhook] missing APIFY_API_TOKEN or SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { eventType, actorRunId, datasetId: dsFromPayload } = extractWebhookRunInfo(payload);
  console.log("[apify-job-webhook] event", eventType, "run", actorRunId);

  if (!actorRunId) {
    return new Response(JSON.stringify({ ok: true, note: "no actorRunId" }), { status: 200 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: job, error: jobErr } = await supabase
    .from("scraping_jobs")
    .select("id, user_id, status, run_id, actor_id, search_filters")
    .eq("run_id", actorRunId)
    .maybeSingle();

  if (jobErr) {
    console.error("[apify-job-webhook] job query", jobErr.message);
    return new Response(JSON.stringify({ error: jobErr.message }), { status: 500 });
  }

  if (!job) {
    console.warn("[apify-job-webhook] no scraping_job for run_id", actorRunId);
    return new Response(JSON.stringify({ ok: true, note: "no matching job" }), { status: 200 });
  }

  if (job.actor_id !== LINKEDIN_JOBS_ACTOR) {
    return new Response(JSON.stringify({ ok: true, note: "wrong actor" }), { status: 200 });
  }

  if (job.status === "completed") {
    return new Response(JSON.stringify({ ok: true, note: "already completed" }), { status: 200 });
  }

  const failStatuses = [
    "ACTOR.RUN.FAILED",
    "ACTOR.RUN.ABORTED",
    "ACTOR.RUN.TIMED_OUT",
    "ACTOR.RUN.TIMED-OUT",
  ];
  if (eventType && failStatuses.includes(eventType)) {
    await supabase
      .from("scraping_jobs")
      .update({
        status: "failed",
        error_message: `Apify webhook: ${eventType}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return new Response(JSON.stringify({ ok: true, handled: "failed" }), { status: 200 });
  }

  if (eventType !== "ACTOR.RUN.SUCCEEDED") {
    return new Response(JSON.stringify({ ok: true, note: "ignored event" }), { status: 200 });
  }

  let datasetId = dsFromPayload;
  if (!datasetId) {
    datasetId = (await resolveDatasetId(actorRunId, apiToken)) ?? undefined;
  }
  if (!datasetId) {
    await supabase
      .from("scraping_jobs")
      .update({
        status: "failed",
        error_message: "Webhook: no dataset ID for succeeded run.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return new Response(JSON.stringify({ error: "no dataset" }), { status: 200 });
  }

  try {
    const items = await fetchApifyDatasetItems(datasetId, apiToken);
    const searchFilters = (job.search_filters as Record<string, unknown>) ?? {};
    const result = await importLinkedInJobsFromItems({
      supabase,
      scrapingJobId: job.id as string,
      userId: job.user_id as string,
      items,
      searchFilters,
    });
    console.log("[apify-job-webhook] import done", result);
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[apify-job-webhook] import error", message);
    await supabase
      .from("scraping_jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 200 });
  }
});
