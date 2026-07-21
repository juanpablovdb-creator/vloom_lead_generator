// Leadflow Vloom - Edge Function: run LinkedIn Post Feed search (Apify) with secret API key
// Receives: input? savedSearchId?. Uses JWT for Supabase RLS.
// Returns: { scrapingJobId, imported, skipped, totalFromApify, savedSearchId?, savedSearchName? }.

import { fetchApifyDatasetItemsWithRetry } from "../_shared/apifyFetchDataset.ts";
import {
  fetchApifyResponseWithRetry,
} from "../_shared/apifyHttpRetry.ts";
import { normalizeApifyRunStatus } from "../_shared/apifyStatus.ts";
import { resolveUserAndClient } from "../_shared/resolveUserAndClient.ts";
import { computeLeadScore } from "../_shared/leadScore.ts";
import { loadExistingLeadDedupeKeys } from "../_shared/loadExistingLeadDedupeKeys.ts";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const LINKEDIN_POSTS_ACTOR = "harvestapi/linkedin-post-search";

/** Supabase Edge has ~150s wall clock — keep post search small; never scrape profiles on Edge. */
const EDGE_MAX_AUTHOR_PROFILES = 0;
const EDGE_LEADS_INSERT_BATCH = 60;
/** Large post payloads + long Apify runs exceed Edge wall clock; browser path allows more. */
const EDGE_MAX_POSTS = 100;

/** API docs: actorId is username~actor-name (tilde). Normalize slash to tilde for URL. */
function toApifyActorId(actorId: string): string {
  return actorId.includes("/") ? actorId.replace("/", "~") : actorId;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  input?: Record<string, unknown>;
  savedSearchId?: string;
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") return v.split("\n").join(",").split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function extractPostedAtISO(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") {
    const dt = new Date(v);
    if (Number.isNaN(dt.getTime())) return undefined;
    return dt.toISOString();
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // HarvestAPI sample output: postedAt: { timestamp: 174..., date: "2025-05-21T..." }
    const dateStr = typeof obj.date === "string" ? obj.date : undefined;
    if (dateStr) return dateStr;
    const timestampRaw = obj.timestamp ?? obj.postedAtTimestamp ?? obj.time;
    if (typeof timestampRaw === "number") {
      const dt = new Date(timestampRaw);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
    if (typeof timestampRaw === "string") {
      const ts = Number(timestampRaw);
      if (!Number.isNaN(ts)) {
        const dt = new Date(ts);
        if (!Number.isNaN(dt.getTime())) return dt.toISOString();
      }
    }
  }
  return undefined;
}

/** Invalid UTF-16 surrogates in scraped text break Postgres JSONB (22P02). */
function sanitizeUtf16String(input: string): string {
  const len = input.length;
  let out = "";
  for (let i = 0; i < len; i++) {
    const cu = input.charCodeAt(i);
    const isHigh = cu >= 0xd800 && cu <= 0xdbff;
    const isLow = cu >= 0xdc00 && cu <= 0xdfff;

    if (isHigh) {
      const nextCu = i + 1 < len ? input.charCodeAt(i + 1) : null;
      const nextIsLow = nextCu != null && nextCu >= 0xdc00 && nextCu <= 0xdfff;
      if (nextIsLow) {
        out += input[i] + input[i + 1];
        i++;
      } else {
        out += "\uFFFD";
      }
    } else if (isLow) {
      out += "\uFFFD";
    } else {
      out += input[i];
    }
  }
  return out;
}

function sanitizeDeepStrings(v: unknown): unknown {
  if (typeof v === "string") return sanitizeUtf16String(v);
  if (Array.isArray(v)) return v.map((x) => sanitizeDeepStrings(x));
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const obj = v as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(obj)) {
      next[k] = sanitizeDeepStrings(val);
    }
    return next;
  }
  return v;
}

/** `slice` can split a surrogate pair; Postgres rejects the result in JSON/text. */
function truncateUtf16Safe(input: string, maxCodeUnits: number): string {
  const s = sanitizeUtf16String(input);
  if (s.length <= maxCodeUnits) return s;
  let end = maxCodeUnits;
  const cu = s.charCodeAt(end - 1);
  if (cu >= 0xd800 && cu <= 0xdbff) end--;
  return sanitizeUtf16String(s.slice(0, end)) + "…";
}

function safeJson<T>(value: T, fallback: T): T {
  // Ensures the value is JSON-serializable.
  // If it fails (circular / BigInt / unexpected), return a safe fallback to avoid DB JSON parse errors.
  try {
    const sanitized = sanitizeDeepStrings(value) as T;
    return JSON.parse(JSON.stringify(sanitized)) as T;
  } catch {
    return fallback;
  }
}

/** Map UI postedLimit to Apify Actor schema: 'any' | '1h' | '24h' | 'week' | 'month' | ... */
function mapPostedLimitToApify(postedLimit: string): string {
  const s = (postedLimit || "").toLowerCase().trim();
  if (!s) return "week";
  if (s === "any" || s.includes("any")) return "any";
  if (s.includes("1h") || s.includes("1 hour") || s.includes("past 1 hour")) return "1h";
  if (s.includes("24h") || s.includes("24 hours") || s.includes("past 24")) return "24h";
  if (s.includes("week") || s.includes("past week")) return "week";
  if (s.includes("month") || s.includes("past month")) return "month";
  if (s.includes("3months") || s.includes("3 months")) return "3months";
  if (s.includes("6months") || s.includes("6 months")) return "6months";
  if (s.includes("year")) return "year";
  return "week";
}

function buildSearchParams(input: Record<string, unknown>): {
  searchQueries: string[];
  maxPosts: number;
  postedLimit: string;
  sortBy: "relevance" | "date";
  authorLocations: string[];
  authorLocationMode: "include" | "exclude";
  maxAuthorUrlsToScrape: number;
  contentType?: string;
  authorUrls?: string[];
  mentioningMember?: string[];
  mentioningCompany?: string[];
  authorsCompanies?: string[];
  authorKeywords?: string;
} {
  const searchQueries = toArray(input.searchQueries ?? input.keywords ?? input.jobTitles ?? input.query ?? []);
  const maxPostsRaw = input.maxPosts ?? input.maxItems ?? 200;
  const maxPostsParsed =
    typeof maxPostsRaw === "number" ? maxPostsRaw : Number(maxPostsRaw) || 200;
  const maxPosts = Math.min(Math.max(1, maxPostsParsed), EDGE_MAX_POSTS);
  const sortByRaw = str(input.sortBy ?? input.sort ?? "date").toLowerCase();
  const sortBy = sortByRaw === "relevance" ? "relevance" : "date";
  const postedLimit = mapPostedLimitToApify(str(input.postedLimit ?? "week"));
  const authorLocations = toArray(input.authorLocations ?? input.locations ?? []);
  const authorLocationModeRaw = str(input.authorLocationMode ?? "include").toLowerCase().trim();
  const authorLocationMode = authorLocationModeRaw === "exclude" ? "exclude" : "include";
  const maxAuthorUrlsToScrapeRaw =
    input.maxAuthorUrlsToScrape ?? input.maxAuthorProfiles ?? EDGE_MAX_AUTHOR_PROFILES;
  const parsed =
    typeof maxAuthorUrlsToScrapeRaw === "number"
      ? maxAuthorUrlsToScrapeRaw
      : Number(maxAuthorUrlsToScrapeRaw) || EDGE_MAX_AUTHOR_PROFILES;
  const maxAuthorUrlsToScrape = Math.min(
    Math.max(0, parsed),
    EDGE_MAX_AUTHOR_PROFILES,
  );

  return {
    searchQueries,
    maxPosts,
    postedLimit,
    sortBy,
    authorLocations,
    authorLocationMode,
    maxAuthorUrlsToScrape,
    contentType: str(input.contentType) || undefined,
    authorUrls: toArray(input.authorUrls ?? []),
    mentioningMember: toArray(input.mentioningMember ?? []),
    mentioningCompany: toArray(input.mentioningCompany ?? []),
    authorsCompanies: toArray(input.authorsCompanies ?? []),
    authorKeywords: str(input.authorKeywords) || undefined,
  };
}

type PostResult = {
  externalId?: string;
  url?: string;
  text?: string;
  postedAt?: string;
  authorName?: string;
  authorTitle?: string;
  authorUrl?: string;
  authorLocation?: string;
  companyName?: string;
  companyLinkedinUrl?: string;
};

/** When profile location is missing, exclude-mode can still match common geo strings in the post body. */
function buildPostLocationHaystack(p: PostResult): string {
  return [
    p.text,
    p.authorTitle,
    p.authorName,
    p.companyName,
    p.authorLocation,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(" ");
}

function escapeRegExpNeedle(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function haystackMatchesExcludeNeedle(haystackLower: string, needleLower: string): boolean {
  if (!needleLower) return false;
  if (needleLower === "remote") return /\bremote\b/.test(haystackLower);
  if (needleLower.includes(" ")) {
    return haystackLower.includes(needleLower);
  }
  try {
    return new RegExp(`\\b${escapeRegExpNeedle(needleLower)}\\b`).test(haystackLower);
  } catch {
    return haystackLower.includes(needleLower);
  }
}

function haystackMatchesAnyExcludeNeedle(p: PostResult, needles: string[]): boolean {
  const hay = buildPostLocationHaystack(p);
  return needles.some((n) => haystackMatchesExcludeNeedle(hay, n));
}

function stripApifyErrorNoise(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (/<\s*html/i.test(t) || /bad gateway/i.test(t)) {
    if (/502/i.test(t)) return "502 Bad Gateway (Apify API temporarily unavailable)";
    if (/503/i.test(t)) return "503 Service Unavailable (Apify API temporarily unavailable)";
    if (/504/i.test(t)) return "504 Gateway Timeout (Apify API temporarily unavailable)";
    return "Apify API temporarily unavailable (gateway error)";
  }
  return t.length > 400 ? `${t.slice(0, 400)}…` : t;
}

/** Smaller JSON in `enrichment_data` to avoid Edge OOM on bulk insert. Full post text stays in `job_description`. */
function slimPostForEdgeStorage(post: PostResult): Record<string, unknown> {
  const text = sanitizeUtf16String(post.text ?? "");
  const textOut = text.length > 4000 ? truncateUtf16Safe(text, 4000) : text || undefined;
  return {
    externalId: post.externalId ? sanitizeUtf16String(String(post.externalId)) : undefined,
    url: post.url ? sanitizeUtf16String(post.url) : undefined,
    postedAt: post.postedAt ? sanitizeUtf16String(String(post.postedAt)) : undefined,
    authorName: post.authorName ? sanitizeUtf16String(post.authorName) : undefined,
    authorTitle: post.authorTitle ? sanitizeUtf16String(post.authorTitle) : undefined,
    authorUrl: post.authorUrl ? sanitizeUtf16String(post.authorUrl) : undefined,
    authorLocation: post.authorLocation ? sanitizeUtf16String(post.authorLocation) : undefined,
    companyName: post.companyName ? sanitizeUtf16String(post.companyName) : undefined,
    companyLinkedinUrl: post.companyLinkedinUrl
      ? sanitizeUtf16String(post.companyLinkedinUrl)
      : undefined,
    text: textOut,
  };
}

/** LinkedIn headlines are often "Title at Company" — actor sometimes omits structured companyName. */
function inferCompanyFromHeadline(headline: string): string | undefined {
  const h = headline.trim();
  if (!h) return undefined;
  const atMatch = h.match(/\s+at\s+(.+)$/i);
  if (atMatch?.[1]) {
    let rest = atMatch[1].trim();
    const pipe = rest.split(/\s*\|\s*/)[0];
    if (pipe) rest = pipe.trim();
    return rest.length > 0 ? rest : undefined;
  }
  return undefined;
}

function normalizeLinkedInPosts(items: Record<string, unknown>[]): PostResult[] {
  return items.map((item) => {
    const author = (item.author as Record<string, unknown> | undefined) ??
      (item.profile as Record<string, unknown> | undefined);
    const company = (item.company as Record<string, unknown> | undefined) ??
      (item.authorCompany as Record<string, unknown> | undefined);

    const externalId =
      str(item.id) ||
      str(item.urn) ||
      str(item.postUrn) ||
      str(item.postId) ||
      str(item.activityUrn) ||
      undefined;

    const url =
      str(item.url) ||
      str(item.postUrl) ||
      str(item.linkedinUrl) ||
      str(item.shareUrl) ||
      str(item.link) ||
      undefined;

    const text =
      str(item.text) ||
      str(item.content) ||
      str(item.postText) ||
      str(item.caption) ||
      str(item.description) ||
      undefined;

    const postedAt =
      extractPostedAtISO(item.postedAt) ??
      (typeof item.date === "string" ? item.date : undefined) ??
      (typeof item.createdAt === "string" ? item.createdAt : undefined) ??
      (typeof item.publishedAt === "string" ? item.publishedAt : undefined);

    const authorName =
      str(item.authorName) ||
      (author ? str(author.name) : "") ||
      str(item.name) ||
      undefined;

    const authorTitle =
      str(item.authorTitle) ||
      (author ? (str(author.headline) || str(author.title)) : "") ||
      undefined;

    const authorUrl =
      str(item.authorUrl) ||
      (author ? (str(author.url) || str(author.linkedinUrl)) : "") ||
      str(item.profileUrl) ||
      undefined;

    // Nota: el actor "linkedin-post-search" no entrega ubicación del autor en el output según su doc/sample.
    // Aquí dejamos este campo solo como "best effort" por si el payload cambia en el futuro.
    const authorLocation =
      str(item.authorLocation) ||
      (author
        ? (str(author.location) ||
          str(author.locationName) ||
          str(author.locationText) ||
          str(author.geoLocationName) ||
          str((author.geo as Record<string, unknown> | undefined)?.name))
        : "") ||
      str(item.location) ||
      undefined;

    let companyName =
      str(item.companyName) ||
      (company ? str(company.name) : "") ||
      str(item.organizationName) ||
      str(item.orgName) ||
      str(item.authorCompanyName) ||
      (typeof item.authorCompany === "string" ? item.authorCompany.trim() : "") ||
      (author
        ? (str(author.companyName) ||
          (typeof author.company === "string" ? str(author.company) : "") ||
          (author.company && typeof author.company === "object"
            ? str((author.company as Record<string, unknown>).name)
            : ""))
        : "") ||
      undefined;

    const companyLinkedinUrl =
      str(item.companyLinkedinUrl) ||
      (company ? (str(company.url) || str(company.linkedinUrl)) : "") ||
      (author && typeof author.company === "object" && author.company
        ? str((author.company as Record<string, unknown>).url) ||
          str((author.company as Record<string, unknown>).linkedinUrl)
        : "") ||
      undefined;

    if (!companyName?.trim() && authorTitle) {
      const inferred = inferCompanyFromHeadline(authorTitle);
      if (inferred) companyName = inferred;
    }
    if (!companyName?.trim()) {
      const headlineExtra = author ? str(author.headline) : "";
      if (headlineExtra) {
        const inferred = inferCompanyFromHeadline(headlineExtra);
        if (inferred) companyName = inferred;
      }
    }

    return {
      externalId: externalId || undefined,
      url: url || undefined,
      text: text || undefined,
      postedAt: postedAt || undefined,
      authorName: authorName || undefined,
      authorTitle: authorTitle || undefined,
      authorUrl: authorUrl || undefined,
      authorLocation: authorLocation || undefined,
      companyName: companyName || undefined,
      companyLinkedinUrl: companyLinkedinUrl || undefined,
    };
  });
}

function normalizeLinkedInUrlForMatching(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  let s = rawUrl.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    u.protocol = "https:";
    let host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "m.linkedin.com" || host === "mobile.linkedin.com") {
      host = "linkedin.com";
    } else if (/^[a-z]{2}\.linkedin\.com$/i.test(host)) {
      host = "linkedin.com";
    }
    u.search = "";
    u.hash = "";
    const segments = u.pathname
      .split("/")
      .filter(Boolean)
      .map((seg) => seg.toLowerCase());
    const path = segments.length ? `/${segments.join("/")}` : "";
    return `https://${host}${path}`;
  } catch {
    return s.replace(/\/+$/, "").toLowerCase();
  }
}

Deno.serve(async (req: Request) => {
  console.log("[run-linkedin-post-feed] request", req.method, req.url);

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

    const { input, savedSearchId } = body;

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

    const params = buildSearchParams(rawInput);
    if (!params.searchQueries?.length) {
      return new Response(JSON.stringify({ error: "At least one keyword/query is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchQuery = params.searchQueries.join(", ");
    const searchFilters: Record<string, unknown> = {
      searchQueries: params.searchQueries,
      postedLimit: params.postedLimit,
      maxPosts: params.maxPosts,
      sortBy: params.sortBy,
    };
    if (params.authorLocations?.length) searchFilters.authorLocations = params.authorLocations;
    if (params.contentType) searchFilters.contentType = params.contentType;
    if (params.authorUrls?.length) searchFilters.authorUrls = params.authorUrls;
    if (params.authorsCompanies?.length) searchFilters.authorsCompanies = params.authorsCompanies;
    if (params.mentioningMember?.length) searchFilters.mentioningMember = params.mentioningMember;
    if (params.mentioningCompany?.length) searchFilters.mentioningCompany = params.mentioningCompany;
    if (params.authorKeywords) searchFilters.authorKeywords = params.authorKeywords;

    const safeSearchFilters = safeJson(searchFilters, {} as Record<string, unknown>);

    // Auto-save every run so paid Apify data is always stored under a saved search
    let resolvedSavedSearchId: string | null = savedSearchId ?? null;
    if (!resolvedSavedSearchId) {
      const now = new Date();
      // Use a fixed UTC-5 timezone for naming (matches business timezone regardless of server region).
      const timeZone = "America/Bogota";
      const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
      const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
      const first = params.searchQueries?.[0]?.trim() || "LinkedIn Posts";
      const autoName = `${first} – ${dateStr}, ${timeStr}`;
      const { data: savedRow, error: savedErr } = await supabase
        .from("saved_searches")
        .insert({
          user_id: user.id,
          name: autoName.slice(0, 255),
          actor_id: LINKEDIN_POSTS_ACTOR,
          input: safeJson(rawInput, {} as Record<string, unknown>),
          autorun: false,
        })
        .select("id")
        .single();
      if (!savedErr && savedRow?.id) {
        resolvedSavedSearchId = savedRow.id;
        resolvedSavedSearchName = autoName.slice(0, 255);
        console.log("[run-linkedin-post-feed] auto-created saved_search", resolvedSavedSearchId, autoName);
      }
    }

    const jobPayload: Record<string, unknown> = {
      user_id: user.id,
      actor_id: LINKEDIN_POSTS_ACTOR,
      run_id: null,
      saved_search_id: resolvedSavedSearchId,
      search_query: searchQuery,
      search_location: null,
      search_filters: safeSearchFilters,
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
        JSON.stringify({
          error: insertJobError?.message ?? "Failed to create scraping job.",
          details: insertJobError ? (insertJobError as unknown as { details?: string; hint?: string }).details : undefined,
          hint: insertJobError ? (insertJobError as unknown as { details?: string; hint?: string }).hint : undefined,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      const apifyInput: Record<string, unknown> = {
        searchQueries: params.searchQueries,
        maxPosts: params.maxPosts,
        postedLimit: params.postedLimit,
        sortBy: params.sortBy,
      };
      if (params.contentType) apifyInput.contentType = params.contentType;
      if (params.authorUrls?.length) apifyInput.authorUrls = params.authorUrls;
      if (params.authorsCompanies?.length) apifyInput.authorsCompanies = params.authorsCompanies;
      if (params.mentioningMember?.length) apifyInput.mentioningMember = params.mentioningMember;
      if (params.mentioningCompany?.length) apifyInput.mentioningCompany = params.mentioningCompany;
      if (params.authorKeywords) apifyInput.authorKeywords = params.authorKeywords;

      const actorIdForUrl = toApifyActorId(LINKEDIN_POSTS_ACTOR);
      const runUrl = `${APIFY_BASE_URL}/acts/${actorIdForUrl}/runs?waitForFinish=60`;
      const runRes = await fetchApifyResponseWithRetry(runUrl, {
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
          // use errText as-is (often HTML 502 from Apify gateway)
        }
        throw new Error(`Apify run failed: ${stripApifyErrorNoise(msg)}`);
      }

      const runData = await runRes.json();
      const runId = runData?.data?.id;
      const datasetId = runData?.data?.defaultDatasetId;
      const statusRaw = runData?.data?.status;
      const status = normalizeApifyRunStatus(statusRaw);

      if (status !== "SUCCEEDED" && status !== "RUNNING" && status !== "READY") {
        throw new Error(`Apify run status: ${(statusRaw ?? status) || "unknown"}`);
      }

      const apifyHeaders = { Authorization: `Bearer ${apiToken}` };
      let items: Record<string, unknown>[] = [];
      const getDatasetItems = async (dsId: string) => {
        items = await fetchApifyDatasetItemsWithRetry(dsId, apifyHeaders, {
          apiBaseUrl: APIFY_BASE_URL,
        });
      };

      if (status === "SUCCEEDED" && datasetId) {
        await getDatasetItems(datasetId);
      } else if ((status === "RUNNING" || status === "READY") && runId) {
        // Edge wall clock ~150s; fail early with a clear message instead of being killed idle.
        const maxWait = 90;
        const step = 5;
        let pollFinished = false;
        for (let waited = 0; waited < maxWait; waited += step) {
          await new Promise((r) => setTimeout(r, step * 1000));
          const statusRes = await fetchApifyResponseWithRetry(
            `${APIFY_BASE_URL}/actor-runs/${runId}`,
            { headers: apifyHeaders },
          );
          if (!statusRes.ok) {
            const errBody = await statusRes.json().catch(() => ({}));
            const msg = (errBody as { error?: { message?: string } })?.error?.message;
            throw new Error(msg ?? "Failed to get run status");
          }
          const statusData = await statusRes.json();
          const s = normalizeApifyRunStatus(statusData?.data?.status);
          if (s === "SUCCEEDED") {
            const dsId = statusData?.data?.defaultDatasetId;
            if (!dsId) throw new Error("No dataset ID from Apify run.");
            await getDatasetItems(dsId);
            pollFinished = true;
            break;
          }
          if (s === "FAILED" || s === "ABORTED" || s === "TIMED-OUT") {
            throw new Error(`Apify run ended with status: ${s}`);
          }
        }
        if (!pollFinished) {
          throw new Error(
            "Apify post search did not finish within the Edge time budget (~90s). " +
              "Add your Apify key in Settings to run in the browser (no 150s cap), " +
              "or lower Max posts / use a shorter Posted limit.",
          );
        }
      } else if (status === "SUCCEEDED" && !datasetId) {
        throw new Error("No dataset ID from Apify run. Try again in a moment.");
      }

      const posts = normalizeLinkedInPosts(items);
      const totalFromApify = posts.length;
      console.log("[run-linkedin-post-feed] apify items", items.length, "normalized", posts.length);

      const locationNeedles = (params.authorLocations ?? [])
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      let postsAfterLocationFilter = posts;
      let locationFilterWarning: string | null = null;

      // Author location filter: Edge never scrapes profiles (wall clock ~150s). Use post-text
      // exclude fallback only. Full profile scrape requires Apify key → browser path.
      if (locationNeedles.length > 0) {
        const authorUrlToLocation = new Map<string, string>();
        locationFilterWarning =
          "Author profile location scrape skipped on server (Edge 150s limit). " +
          "Exclude mode still filters post text/headlines. " +
          "Add your Apify key in Settings to run full profile location checks in the browser.";
        console.warn("[run-linkedin-post-feed]", locationFilterWarning);

        postsAfterLocationFilter = posts.filter((p) => {
          const authorUrlKey = normalizeLinkedInUrlForMatching(p.authorUrl ?? undefined);
          const locRaw = authorUrlKey ? (authorUrlToLocation.get(authorUrlKey) ?? "") : "";
          const loc = locRaw.toLowerCase();
          const profileMatches = loc
            ? locationNeedles.some((needle) => loc.includes(needle))
            : false;

          if (params.authorLocationMode === "exclude") {
            if (loc && authorUrlKey) {
              if (profileMatches) {
                p.authorLocation = authorUrlToLocation.get(authorUrlKey) ?? undefined;
              }
              return !profileMatches;
            }
            if (haystackMatchesAnyExcludeNeedle(p, locationNeedles)) return false;
            return true;
          }

          // include: keep unknown-location posts (best-effort); require profile match when loc exists
          if (!authorUrlKey) return true;
          if (!loc) return true;
          if (profileMatches) {
            p.authorLocation = authorUrlToLocation.get(authorUrlKey) ?? undefined;
          }
          return profileMatches;
        });
      }

      // Dedupe by job_external_id (post id/urn) and fallback by job_url.
      const { urls: existingUrls, externalIds: existingExternalIds } = await loadExistingLeadDedupeKeys(
        supabase,
        user.id,
      );

      const newPosts = postsAfterLocationFilter.filter((p) => {
        const ext = p.externalId?.trim();
        const url = p.url?.trim();
        if (ext && existingExternalIds.has(ext)) return false;
        if (url && existingUrls.has(url)) return false;
        return true;
      });

      const leadsToInsert = newPosts.map((post) => {
        const descText = sanitizeUtf16String(post.text ?? "");
        const jobDescription =
          descText.length > 14000 ? truncateUtf16Safe(descText, 14000) : descText || null;

        const enrichment_data: Record<string, unknown> = safeJson({
          source: "linkedin_post_feed",
          raw: slimPostForEdgeStorage(post),
        }, { source: "linkedin_post_feed" } as Record<string, unknown>);
        const score = computeLeadScore({
          job_location: null,
          company_location: null,
          company_size: null,
          company_funding: null,
          job_description: jobDescription,
          notes: null,
          enrichment_data,
        });

        const rawTitle = sanitizeUtf16String(post.text?.trim() ?? "");
        const titleFallback =
          rawTitle.length > 0 ? truncateUtf16Safe(rawTitle, 80) : "LinkedIn Post";

        return sanitizeDeepStrings({
          user_id: user.id,
          is_shared: false,
          scraping_job_id: scrapingJobId,
          job_external_id: post.externalId ? sanitizeUtf16String(String(post.externalId)) : null,
          is_marked_as_lead: false,
          job_title: titleFallback,
          job_description: jobDescription,
          job_url: post.url ? sanitizeUtf16String(post.url) : null,
          job_source: "linkedin_post_feed",
          job_location: null,
          job_salary_range: null,
          job_posted_at: post.postedAt ?? null,
          company_name: post.companyName ? sanitizeUtf16String(post.companyName) : null,
          company_url: null,
          company_linkedin_url: post.companyLinkedinUrl
            ? sanitizeUtf16String(post.companyLinkedinUrl)
            : null,
          company_description: null,
          company_size: null,
          company_location: null,
          company_industry: null,
          company_funding: null,
          contact_name: post.authorName ? sanitizeUtf16String(post.authorName) : null,
          contact_title: post.authorTitle ? sanitizeUtf16String(post.authorTitle) : null,
          contact_email: null,
          contact_linkedin_url: post.authorUrl ? sanitizeUtf16String(post.authorUrl) : null,
          status: "backlog",
          score,
          enrichment_data,
          tags: [],
          channel: "LinkedIn Post Feeds",
        }) as Record<string, unknown>;
      });

      if (leadsToInsert.length === 0) {
        await supabase
          .from("scraping_jobs")
          .update({
            leads_found: postsAfterLocationFilter.length,
            leads_imported: 0,
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", scrapingJobId);
        return new Response(
          JSON.stringify({
            scrapingJobId,
            imported: 0,
            skipped: postsAfterLocationFilter.length,
            totalFromApify,
            savedSearchId: resolvedSavedSearchId,
            savedSearchName: resolvedSavedSearchName,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let importedCount = 0;
      for (let i = 0; i < leadsToInsert.length; i += EDGE_LEADS_INSERT_BATCH) {
        const chunk = leadsToInsert.slice(i, i + EDGE_LEADS_INSERT_BATCH);
        const { data: insertedChunk, error: insertLeadError } = await supabase
          .from("leads")
          .insert(chunk as never)
          .select("id");

        if (insertLeadError) {
          const insertMsg = insertLeadError?.message ?? String(insertLeadError);
          const details = (insertLeadError as unknown as { details?: string; hint?: string; code?: string | number }).details;
          const hint = (insertLeadError as unknown as { details?: string; hint?: string; code?: string | number }).hint;
          const code = (insertLeadError as unknown as { details?: string; hint?: string; code?: string | number }).code;
          await supabase.from("leads").delete().eq("scraping_job_id", scrapingJobId);
          await supabase
            .from("scraping_jobs")
            .update({
              status: "failed",
              error_message: [insertMsg, details ? `details: ${details}` : null, hint ? `hint: ${hint}` : null]
                .filter(Boolean)
                .join(" | "),
              completed_at: new Date().toISOString(),
            })
            .eq("id", scrapingJobId);
          throw new Error(
            [insertMsg, details ? `details: ${details}` : null, hint ? `hint: ${hint}` : null, code ? `code: ${code}` : null]
              .filter(Boolean)
              .join(" | "),
          );
        }
        importedCount += (insertedChunk as { id: string }[] | null)?.length ?? 0;
      }

      await supabase
        .from("scraping_jobs")
        .update({
          leads_found: postsAfterLocationFilter.length,
          leads_imported: importedCount,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", scrapingJobId);

      return new Response(
        JSON.stringify({
          scrapingJobId,
          imported: importedCount,
          skipped: postsAfterLocationFilter.length - importedCount,
          totalFromApify,
          savedSearchId: resolvedSavedSearchId,
          savedSearchName: resolvedSavedSearchName,
          warning: locationFilterWarning ?? undefined,
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
    console.error("[run-linkedin-post-feed] error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

