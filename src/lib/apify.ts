// =====================================================
// Leadflow Vloom - Apify Client
// =====================================================
import {
  FunctionsFetchError,
  FunctionsHttpError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { supabase, supabaseUrl, getCurrentUser } from './supabase';
import { mapWorkplaceTypesToHarvestApi } from './harvestLinkedInMaps';
import { LINKEDIN_JOB_POST_CHANNEL } from './leadChannels';
import type { ApifyJobResult, Database } from '@/types/database';

/** Supabase Functions gateway expects `apikey` (anon) alongside `Authorization: Bearer <user_jwt>`. */
const supabaseAnonKey =
  typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string'
    ? import.meta.env.VITE_SUPABASE_ANON_KEY
    : '';

function edgeFunctionPostHeaders(token: string): Record<string, string> {
  if (!supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_ANON_KEY is missing; cannot call Edge Functions.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: supabaseAnonKey,
  };
}

type AppSupabaseClient = SupabaseClient<Database>;

function normalizeSupabaseUrlForJwtCheck(raw: string): string {
  return raw.trim().replace(/\/$/, '').replace(/^http:\/\//i, 'https://');
}

/** Detect stale/wrong-project session before calling Edge (avoids opaque "Invalid JWT"). */
function assertAccessTokenBelongsToSupabaseUrl(accessToken: string, projectUrl: string | undefined): void {
  if (!projectUrl) return;
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return;
    const pad = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(pad)) as { iss?: string };
    const iss = typeof payload.iss === 'string' ? payload.iss : '';
    const base = normalizeSupabaseUrlForJwtCheck(projectUrl);
    if (!iss || !base) return;
    const ok = iss === `${base}/auth/v1` || iss.startsWith(`${base}/`);
    if (!ok) {
      throw new Error(
        'Tu sesión pertenece a otro proyecto de Supabase (el token no coincide con VITE_SUPABASE_URL). ' +
          'Cierra sesión, borra datos del sitio para este dominio, vuelve a entrar, y revisa que Vercel/.env tengan la URL y anon key actuales del mismo proyecto.',
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Tu sesión pertenece')) throw e;
    /* ignore decode errors */
  }
}

/** Fresh access token + explicit invoke headers (avoids anon-key-as-Bearer fallback in the SDK). */
async function getFreshAccessTokenForEdge(db: AppSupabaseClient): Promise<string> {
  if (!supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_ANON_KEY is missing; cannot call Edge Functions.');
  }
  const {
    data: { session },
    error,
  } = await db.auth.refreshSession();
  if (error || !session?.access_token) {
    throw new Error('You must be logged in to run a search. Please sign in again.');
  }
  assertAccessTokenBelongsToSupabaseUrl(session.access_token, supabaseUrl);
  return session.access_token;
}

function edgeInvokeHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: supabaseAnonKey,
  };
}

function edgeBodyErrorToString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'message' in v && typeof (v as { message: unknown }).message === 'string') {
    return (v as { message: string }).message;
  }
  return v != null ? String(v) : '';
}

/** `instanceof FunctionsHttpError` can fail if multiple copies of `@supabase/functions-js` are bundled. */
function getHttpResponseFromInvokeError(error: unknown): Response | null {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    return error.context;
  }
  if (
    error !== null &&
    typeof error === 'object' &&
    'context' in error &&
    (error as { context: unknown }).context instanceof Response
  ) {
    return (error as { context: Response }).context;
  }
  return null;
}

async function parseEdgeInvokeErrorResponse(res: Response): Promise<{ status: number; message: string }> {
  const status = res.status;
  const text = await res.text();
  let parsed: { error?: string; message?: string; msg?: string } = {};
  try {
    parsed = text ? (JSON.parse(text) as typeof parsed) : {};
  } catch {
    /* ignore */
  }
  const message =
    typeof parsed.error === 'string'
      ? parsed.error
      : typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.msg === 'string'
          ? parsed.msg
          : text || res.statusText || `HTTP ${status}`;
  return { status, message };
}

async function parseFunctionsHttpError(
  error: FunctionsHttpError,
): Promise<{ status: number; message: string }> {
  return parseEdgeInvokeErrorResponse(error.context as Response);
}

function formatEdge401(functionName: string, serverDetail: string): string {
  return [
    `El servidor rechazó la sesión al llamar a «${functionName}».`,
    `Detalle técnico: ${serverDetail}.`,
    'Para LinkedIn Jobs: añade la clave en Supabase → api_keys (service apify, tu user_id) o VITE_APIFY_API_TOKEN en el deploy para buscar en el navegador sin Edge. ' +
      'Si solo usas el servidor, revisa VITE_* y despliega la función: npx supabase functions deploy ' +
      functionName,
  ].join('');
}

/** Same value as APIFY_ACTORS.LINKEDIN_JOBS (declared later in this file). */
const LINKEDIN_JOBS_ACTOR_ID = 'harvestapi/linkedin-job-search';

function readViteApifyToken(): string | undefined {
  const v = import.meta.env.VITE_APIFY_API_TOKEN;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Key used for browser-side Apify calls: optional VITE_APIFY_API_TOKEN first, else `api_keys` row for the user.
 */
export async function getApifyApiKeyForBrowser(): Promise<string | null> {
  const vite = readViteApifyToken();
  if (vite) return vite;
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('api_keys')
    .select('api_key_encrypted')
    .eq('user_id', user.id)
    .eq('service', 'apify')
    .eq('is_active', true)
    .maybeSingle();
  // Supabase types sometimes infer `never` for narrowed selects; cast to the expected shape.
  const row = data as { api_key_encrypted?: string } | null;
  if (error || !row?.api_key_encrypted) return null;
  return row.api_key_encrypted;
}

async function userHasActiveApifyKeyInSettings(): Promise<boolean> {
  return (await getApifyApiKeyForBrowser()) != null;
}

/** Params for running LinkedIn job search (HarvestAPI). From New Search form or saved_searches.input */
export interface RunLinkedInSearchInput {
  jobTitles: string[];
  locations?: string[];
  postedLimit?: 'Past 1 hour' | 'Past 24 hours' | 'Past Week' | 'Past Month';
  maxItems?: number;
  sort?: 'relevance' | 'date';
  workplaceType?: string[];
  employmentType?: string[];
  experienceLevel?: string[];
  [key: string]: unknown;
}

export interface RunLinkedInSearchResult {
  scrapingJobId: string;
  imported: number;
  skipped: number;
  totalFromApify: number;
  /** Edge function auto-creates one on New Search runs; null if fallback/local run. */
  savedSearchId?: string | null;
  savedSearchName?: string | null;
  /** True when Apify run continues in the cloud and leads import via webhook (no Edge timeout). */
  async?: boolean;
  apifyRunId?: string;
  message?: string;
}

/** Params for running LinkedIn post feed search (HarvestAPI). From New Search form or saved_searches.input */
export interface RunLinkedInPostFeedInput {
  searchQueries: string[];
  maxPosts?: number;
  postedLimit?: 'any' | '1h' | '24h' | 'week' | 'month' | '3months' | '6months' | 'year';
  sortBy?: 'relevance' | 'date';
  contentType?: 'all' | 'videos' | 'images' | 'jobs' | 'live_videos' | 'documents' | 'collaborative_articles';
  authorUrls?: string[];
  authorsCompanies?: string[];
  mentioningMember?: string[];
  mentioningCompany?: string[];
  authorKeywords?: string;
  [key: string]: unknown;
}

/**
 * Run job search via Edge Function (API key stays in Edge Function Secrets).
 * Uses `supabase.functions.invoke` so headers match the rest of the SDK (apikey + user JWT).
 * If the function is unreachable, falls back to runJobSearch (Apify key in api_keys).
 */
export async function runJobSearchViaEdge(options: {
  actorId: string;
  input?: Record<string, unknown>;
  savedSearchId?: string;
}): Promise<RunLinkedInSearchResult> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured.');
  const db = supabase;

  // LinkedIn Jobs: if Apify key exists in Settings, run in the browser only — no Edge Function, no JWT to the gateway.
  if (options.actorId === LINKEDIN_JOBS_ACTOR_ID && (await userHasActiveApifyKeyInSettings())) {
    const direct = await runJobSearch(options);
    return {
      ...direct,
      message:
        direct.message ??
        'Búsqueda con tu API key de Apify (navegador). No usa la Edge Function; así se evitan errores JWT del servidor.',
    };
  }

  const bodyPayload: Record<string, unknown> = { actorId: options.actorId };
  if (options.input !== undefined) bodyPayload.input = options.input;
  if (options.savedSearchId !== undefined) bodyPayload.savedSearchId = options.savedSearchId;

  for (let attempt = 0; attempt < 2; attempt++) {
    const accessToken = await getFreshAccessTokenForEdge(db);
    const { data, error } = await db.functions.invoke('run-job-search', {
      body: bodyPayload,
      headers: edgeInvokeHeaders(accessToken),
    });

    if (!error) {
      const body = data as {
        error?: unknown;
        message?: string | Record<string, unknown>;
        scrapingJobId?: string;
        imported?: number;
        skipped?: number;
        totalFromApify?: number;
        savedSearchId?: string | null;
        savedSearchName?: string | null;
        async?: boolean;
        apifyRunId?: string;
      } | null;
      if (body?.error != null) throw new Error(edgeBodyErrorToString(body.error));
      if (body?.scrapingJobId == null) throw new Error('Invalid response from run-job-search.');
      const msg =
        typeof body.message === 'string'
          ? body.message
          : body.message != null
            ? edgeBodyErrorToString(body.message)
            : undefined;
      return {
        scrapingJobId: body.scrapingJobId,
        imported: body.imported ?? 0,
        skipped: body.skipped ?? 0,
        totalFromApify: body.totalFromApify ?? 0,
        savedSearchId: body.savedSearchId ?? null,
        savedSearchName: body.savedSearchName ?? null,
        async: body.async === true,
        apifyRunId: typeof body.apifyRunId === 'string' ? body.apifyRunId : undefined,
        message: msg,
      };
    }

    if (error instanceof FunctionsFetchError) {
      const msg = error.message;
      const isUnreachable = /fetch failed|NetworkError|Failed to fetch/i.test(msg);
      if (isUnreachable) {
        try {
          return await runJobSearch(options);
        } catch (fallbackErr) {
          const detail = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          const needKey = /API key not configured|add it in Settings/i.test(detail);
          throw new Error(
            needKey
              ? `Edge Function is not deployed. Either: (1) Run "supabase functions deploy run-job-search" and set APIFY_API_TOKEN in Edge Function Secrets, or (2) Add your Apify key in the api_keys table (Supabase Table Editor). Details: ${detail}`
              : `Edge Function unreachable. Deploy with: supabase functions deploy run-job-search and set APIFY_API_TOKEN in Secrets. If you use the fallback, add your Apify key in the api_keys table. Details: ${detail}`,
          );
        }
      }
      throw new Error(msg);
    }

    const httpRes = getHttpResponseFromInvokeError(error);
    if (httpRes) {
      const { status, message } = await parseEdgeInvokeErrorResponse(httpRes);
      if (status === 401 && attempt === 0) continue;

      const tryBrowser =
        status === 401 ||
        status === 403 ||
        /invalid jwt|jwt expired|session|unauthorized/i.test(message);
      if (tryBrowser) {
        try {
          const direct = await runJobSearch(options);
          return {
            ...direct,
            message:
              direct.message ??
              'Búsqueda ejecutada en modo directo (Apify desde el navegador). La Edge Function devolvió error de sesión/JWT; revisa Secrets y deploy, o deja tu API key de Apify en Ajustes.',
          };
        } catch (fallbackErr) {
          const fb = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          throw new Error(
            `${formatEdge401('run-job-search', message)} Modo directo no disponible: ${fb}`,
          );
        }
      }
      throw new Error(message || `run-job-search returned ${status}`);
    }

    const loose = error instanceof Error ? error.message : String(error);
    if (/invalid jwt/i.test(loose)) {
      try {
        const direct = await runJobSearch(options);
        return {
          ...direct,
          message:
            direct.message ??
            'Búsqueda en modo directo (Apify en el navegador). Error al invocar la Edge Function; revisa deploy o API key en Ajustes.',
        };
      } catch (fallbackErr) {
        const fb = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        throw new Error(`${formatEdge401('run-job-search', loose)} Modo directo no disponible: ${fb}`);
      }
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }

  throw new Error('run-job-search: session retry exhausted.');
}

/**
 * Run LinkedIn Post Feed search via Edge Function (API key stays in Edge Function Secrets).
 * No fallback is provided here (post feed is intended to run server-side only, like saved searches).
 */
export async function runLinkedInPostFeedViaEdge(options: {
  input?: Record<string, unknown>;
  savedSearchId?: string;
}): Promise<RunLinkedInSearchResult> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured.');
  const db = supabase;

  const bodyPayload: Record<string, unknown> = {};
  if (options.input !== undefined) bodyPayload.input = options.input;
  if (options.savedSearchId !== undefined) bodyPayload.savedSearchId = options.savedSearchId;

  for (let attempt = 0; attempt < 2; attempt++) {
    const accessToken = await getFreshAccessTokenForEdge(db);
    const { data, error } = await db.functions.invoke('run-linkedin-post-feed', {
      body: bodyPayload,
      headers: edgeInvokeHeaders(accessToken),
    });

    if (!error) {
      const body = data as {
        error?: unknown;
        scrapingJobId?: string;
        imported?: number;
        skipped?: number;
        totalFromApify?: number;
        savedSearchId?: string | null;
        savedSearchName?: string | null;
      } | null;
      if (body?.error != null) throw new Error(edgeBodyErrorToString(body.error));
      if (body?.scrapingJobId == null) throw new Error('Invalid response from run-linkedin-post-feed.');
      return {
        scrapingJobId: body.scrapingJobId,
        imported: body.imported ?? 0,
        skipped: body.skipped ?? 0,
        totalFromApify: body.totalFromApify ?? 0,
        savedSearchId: body.savedSearchId ?? null,
        savedSearchName: body.savedSearchName ?? null,
      };
    }

    if (error instanceof FunctionsFetchError) {
      throw new Error(error.message);
    }

    if (error instanceof FunctionsHttpError) {
      const { status, message } = await parseFunctionsHttpError(error);
      if (status === 401 && attempt === 0) continue;
      if (status === 401) throw new Error(formatEdge401('run-linkedin-post-feed', message));
      throw new Error(message || `run-linkedin-post-feed returned ${status}`);
    }

    throw new Error(error instanceof Error ? error.message : String(error));
  }

  throw new Error('run-linkedin-post-feed: session retry exhausted.');
}

/**
 * Send selected job results to Leads: mark as lead + backlog, then enrich company data via Harvest API LinkedIn Company.
 * Call from Saved Searches results when user clicks "Send to leads".
 */
export async function sendSelectedToLeadsAndEnrich(leadIds: string[]): Promise<{
  sent: number;
  enriched: number;
  personaCompaniesProcessed?: number;
  personaLeadsCreated?: number;
}> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured.');
  if (!leadIds.length) return { sent: 0, enriched: 0 };
  const db = supabase;

  const { data: updatedRows, error: updateError } = await db
    .from('leads')
    .update({ is_marked_as_lead: true, status: 'backlog', updated_at: new Date().toISOString() } as never)
    .in('id', leadIds)
    .select('id');

  if (updateError) throw new Error(updateError.message);
  const updatedCount = (updatedRows as { id: string }[] | null)?.length ?? 0;
  if (updatedCount === 0) {
    throw new Error(
      'No leads were updated. They may be missing or your session may not allow updating them. Try refreshing and signing in again.'
    );
  }
  if (updatedCount < leadIds.length) {
    throw new Error(
      `Only ${updatedCount} of ${leadIds.length} leads were updated (permission or missing rows). Check that all selected rows belong to your account.`
    );
  }

  // Job posts from LinkedIn often had null channel in older imports; set default before enrichment.
  try {
    const { data: channelRows } = await db
      .from('leads')
      .select('id, channel, job_url')
      .in('id', leadIds);
    const needChannel = (channelRows ?? []).filter(
      (r: { id: string; channel: string | null; job_url: string | null }) =>
        !(r.channel && r.channel.trim()) &&
        typeof r.job_url === 'string' &&
        /linkedin\.com\/jobs/i.test(r.job_url),
    );
    if (needChannel.length > 0) {
      await db
        .from('leads')
        .update({
          channel: 'LinkedIn Job Post',
          updated_at: new Date().toISOString(),
        } as never)
        .in(
          'id',
          needChannel.map((r: { id: string }) => r.id),
        );
    }
  } catch (channelErr) {
    console.warn('Could not backfill channel for job posts:', channelErr);
  }

  // Auto-create "Contact ..." tasks for newly marked leads so Tasks view stays in sync.
  // Avoid duplicates by only inserting tasks for leads that don't already have one.
  try {
    // Fetch leads we just updated (id, user_id, company/contact for title).
    const { data: leadsForTasks } = await db
      .from('leads')
      .select('id, user_id, company_name, contact_name')
      .in('id', leadIds);

    const leadsArray = (leadsForTasks ?? []) as {
      id: string;
      user_id: string;
      company_name: string | null;
      contact_name: string | null;
    }[];

    if (leadsArray.length > 0) {
      // Find which leads already have at least one task.
      const { data: existingTasks } = await db
        .from('tasks')
        .select('lead_id')
        .in(
          'lead_id',
          leadsArray.map((l) => l.id)
        );

      const leadsWithTasks = new Set<string>(
        ((existingTasks ?? []) as { lead_id: string }[]).map((t) => t.lead_id)
      );

      const tasksToInsert = leadsArray
        .filter((lead) => !leadsWithTasks.has(lead.id))
        .map((lead) => {
          const contactLabel = [lead.company_name, lead.contact_name].filter(Boolean).join(' – ') || 'lead';
          const title = `Contact ${contactLabel}`;
          return {
            user_id: lead.user_id,
            lead_id: lead.id,
            title,
            status: 'pending' as const,
          };
        });

      if (tasksToInsert.length > 0) {
        const { error: taskInsertError } = await db.from('tasks').insert(tasksToInsert as never);
        if (taskInsertError) {
          console.error('Error creating tasks for leads:', taskInsertError);
        }
      }
    }
  } catch (taskErr) {
    // Non-fatal: enrichment can still succeed even if task creation fails.
    console.error('Failed to auto-create tasks after Send to leads:', taskErr);
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/enrich-lead-companies`;
  const getToken = async (): Promise<string> => {
    const { data: { session }, error: refreshError } = await db.auth.refreshSession();
    if (refreshError || !session?.user) throw new Error('You must be logged in. Please sign in again.');
    const token = session.access_token;
    if (!token) throw new Error('Session expired. Please sign in again.');
    return token;
  };

  let token = await getToken();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: edgeFunctionPostHeaders(token),
      body: JSON.stringify({ leadIds }),
    });
    if (response.status === 401) {
      token = await getToken();
      response = await fetch(url, {
        method: 'POST',
        headers: edgeFunctionPostHeaders(token),
        body: JSON.stringify({ leadIds }),
      });
    }
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    throw new Error(
      `Enrichment failed. Deploy with: npx supabase functions deploy enrich-lead-companies and set APIFY_API_TOKEN in Secrets. ${msg}`
    );
  }

  const text = await response.text();
  let body: { error?: string; ok?: boolean; enriched?: number; total?: number; code?: number; message?: string };
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const isSessionError =
      response.status === 401 ||
      body?.code === 401 ||
      /Invalid JWT|invalid.*jwt|session expired|sign in again/i.test(body?.message ?? body?.error ?? text);
    if (isSessionError) {
      throw new Error('Session expired. Please sign in again.');
    }
    throw new Error(typeof body?.error === 'string' ? body.error : (typeof body?.message === 'string' ? body.message : text) || `Enrichment returned ${response.status}`);
  }

  // Persona enrichment: find people at each company matching active Personas (harvestapi/linkedin-company-employees)
  let personaCompaniesProcessed: number | undefined;
  let personaLeadsCreated: number | undefined;
  try {
    const personaUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/enrich-lead-personas`;
    const personaRes = await fetch(personaUrl, {
      method: 'POST',
      headers: edgeFunctionPostHeaders(token),
      body: JSON.stringify({ leadIds }),
    });
    const personaText = await personaRes.text();
    const personaBody = personaText
      ? (JSON.parse(personaText) as { ok?: boolean; leadsCreated?: number; companiesProcessed?: number; error?: string })
      : {};
    if (personaRes.ok && personaBody?.ok) {
      personaCompaniesProcessed = personaBody.companiesProcessed ?? 0;
      personaLeadsCreated = personaBody.leadsCreated ?? 0;
    } else if (!personaRes.ok && personaBody?.error) {
      console.warn('Persona enrichment failed (non-blocking):', personaBody.error);
    }
  } catch (personaErr) {
    console.warn('Persona enrichment failed (non-blocking):', personaErr);
  }

  return {
    sent: updatedCount,
    enriched: body?.enriched ?? 0,
    personaCompaniesProcessed,
    personaLeadsCreated,
  };
}

/**
 * Enrich selected leads with people from their companies using active Personas (harvestapi/linkedin-company-employees).
 * Creates one new lead row per person found (same company, different contact). Call from CRM when user selects leads and clicks "Enrich with personas".
 */
export async function enrichLeadsWithPersonas(leadIds: string[]): Promise<{
  ok: boolean;
  leadsCreated?: number;
  companiesProcessed?: number;
  error?: string;
}> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured.');
  if (!leadIds.length) return { ok: true, leadsCreated: 0, companiesProcessed: 0 };
  const db = supabase;
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/enrich-lead-personas`;
  const getToken = async (): Promise<string> => {
    const { data: { session }, error: refreshError } = await db.auth.refreshSession();
    if (refreshError || !session?.user) throw new Error('You must be logged in. Please sign in again.');
    const token = session.access_token;
    if (!token) throw new Error('Session expired. Please sign in again.');
    return token;
  };
  let token = await getToken();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: edgeFunctionPostHeaders(token),
      body: JSON.stringify({ leadIds }),
    });
    if (response.status === 401) {
      token = await getToken();
      response = await fetch(url, {
        method: 'POST',
        headers: edgeFunctionPostHeaders(token),
        body: JSON.stringify({ leadIds }),
      });
    }
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    throw new Error(`Persona enrichment failed. Deploy enrich-lead-personas and set APIFY_API_TOKEN. ${msg}`);
  }
  const text = await response.text();
  let body: { ok?: boolean; leadsCreated?: number; companiesProcessed?: number; error?: string };
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    return { ok: false, error: typeof body?.error === 'string' ? body.error : text || `Status ${response.status}` };
  }
  return {
    ok: true,
    leadsCreated: body?.leadsCreated ?? 0,
    companiesProcessed: body?.companiesProcessed ?? 0,
  };
}

/**
 * Recompute lead scores with the Clay-style formula (location, size, revenue, remote).
 * Pass leadIds to recompute only those leads; omit to recompute all user's leads.
 */
export async function recomputeLeadScores(leadIds?: string[]): Promise<{ updated: number; total: number }> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured.');
  const db = supabase;
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/recompute-lead-scores`;
  const getToken = async (): Promise<string> => {
    const { data: { session }, error: refreshError } = await db.auth.refreshSession();
    if (refreshError || !session?.user) throw new Error('You must be logged in. Please sign in again.');
    const token = session.access_token;
    if (!token) throw new Error('Session expired. Please sign in again.');
    return token;
  };
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: edgeFunctionPostHeaders(token),
      body: JSON.stringify(leadIds != null ? { leadIds } : {}),
    });
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    const isFailedToFetch = /failed to fetch|networkerror|load failed/i.test(msg);
    if (isFailedToFetch) {
      throw new Error(
        'Could not reach the function. Deploy it with: npx supabase functions deploy recompute-lead-scores'
      );
    }
    throw networkErr;
  }
  const text = await response.text();
  let body: { error?: string; code?: number; message?: string; ok?: boolean; updated?: number; total?: number };
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    if (response.status === 401 && (body?.code === 401 || body?.message?.toLowerCase().includes('jwt'))) {
      throw new Error(
        'Invalid or expired session, or VITE_SUPABASE_ANON_KEY does not match this project. Sign out and sign in again, then try Recalculate scores. Deploy if needed: npx supabase functions deploy recompute-lead-scores'
      );
    }
    const errMsg =
      typeof body?.error === 'string'
        ? body.error
        : (body?.message ?? text) || `recompute-lead-scores returned ${response.status}`;
    throw new Error(errMsg);
  }
  return {
    updated: body?.updated ?? 0,
    total: body?.total ?? 0,
  };
}

const APIFY_BASE_URL = 'https://api.apify.com/v2';

/** API docs: actorId is username~actor-name (tilde). Normalize slash to tilde for URL. */
function toApifyActorId(actorId: string): string {
  return actorId.includes('/') ? actorId.replace('/', '~') : actorId;
}

/** Map UI postedLimit to Apify Actor schema: "1h" | "24h" | "week" | "month" */
function mapPostedLimitToApify(postedLimit: string): string {
  const s = (postedLimit || '').toLowerCase();
  if (s.includes('1h') || s.includes('1 hour')) return '1h';
  if (s.includes('24') || s === '24h') return '24h';
  if (s.includes('week') || s === 'week') return 'week';
  if (s.includes('month') || s === 'month') return 'month';
  return '1h';
}

// Actors recomendados para job scraping
export const APIFY_ACTORS = {
  /** HarvestAPI: job titles + locations + postedLimit (e.g. Past 24 hours), no cookies, rich output */
  LINKEDIN_JOBS: 'harvestapi/linkedin-job-search',
  /** HarvestAPI: search LinkedIn posts by keywords, no cookies */
  LINKEDIN_POST_SEARCH: 'harvestapi/linkedin-post-search',
  LINKEDIN_JOBS_LEGACY: 'bebity/linkedin-jobs-scraper',
  INDEED_JOBS: 'misceres/indeed-scraper',
  GLASSDOOR_JOBS: 'epctex/glassdoor-jobs-scraper',
  COMPANY_ENRICHMENT: 'compass/crawler-google-places', // Para enrichment
  LINKEDIN_PROFILE: 'bebity/linkedin-profile-scraper', // Para contact enrichment
} as const;

interface ApifyRunOptions {
  actorId: string;
  input: Record<string, unknown>;
}

interface ApifyRunResult {
  runId: string;
  status: string;
  datasetId?: string;
}

const APIFY_POLL_INTERVAL_MS = 5000;
const APIFY_POLL_TIMEOUT_MS = 600_000;

function parseApifyError(errText: string): string {
  try {
    const body = JSON.parse(errText) as { error?: { message?: string } };
    if (body?.error?.message) return body.error.message;
  } catch {
    // use errText as-is
  }
  return errText;
}

export class ApifyClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  /** Start an actor run. Body is input only; waitForFinish is a query param (max 60s). */
  async runActor(options: ApifyRunOptions): Promise<ApifyRunResult> {
    const { actorId, input } = options;
    const actorIdForUrl = toApifyActorId(actorId);
    const url = `${APIFY_BASE_URL}/acts/${actorIdForUrl}/runs?waitForFinish=60`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Apify error: ${parseApifyError(errText)}`);
    }

    const data = await response.json();
    return {
      runId: data.data.id,
      status: data.data.status,
      datasetId: data.data.defaultDatasetId,
    };
  }

  /** Get run status (and defaultDatasetId when finished). */
  async getRunStatus(runId: string): Promise<{ status: string; datasetId?: string }> {
    const response = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(parseApifyError(errText) || 'Failed to get run status');
    }

    const data = await response.json();
    return {
      status: data.data.status,
      datasetId: data.data.defaultDatasetId,
    };
  }

  /** Get dataset items (JSON). */
  async getDatasetItems<T = unknown>(datasetId: string): Promise<T[]> {
    const response = await fetch(
      `${APIFY_BASE_URL}/datasets/${datasetId}/items?format=json`,
      { headers: this.headers }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(parseApifyError(errText) || 'Failed to get dataset items');
    }

    return response.json();
  }

  /** Poll run until terminal status or timeout. Returns final status and datasetId. */
  private async pollRunUntilFinished(
    runId: string,
    timeoutMs: number = APIFY_POLL_TIMEOUT_MS
  ): Promise<{ status: string; datasetId?: string }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, APIFY_POLL_INTERVAL_MS));
      const st = await this.getRunStatus(runId);
      if (st.status === 'SUCCEEDED' || st.status === 'FAILED') return st;
    }
    return { status: 'RUNNING' };
  }

  /**
   * HarvestAPI LinkedIn Job Search: job titles, locations, postedLimit (e.g. Past 24 hours).
   * No cookies, rich output. Input shape: https://apify.com/harvestapi/linkedin-job-search/input
   * Starts the run, then polls until SUCCEEDED/FAILED (up to 600s), then returns normalized items.
   */
  async searchLinkedInJobs(params: {
    jobTitles: string[];
    locations?: string[];
    postedLimit?: 'Past 1 hour' | 'Past 24 hours' | 'Past Week' | 'Past Month';
    maxItems?: number;
    sort?: 'relevance' | 'date';
    workplaceType?: string[];
    employmentType?: string[];
    experienceLevel?: string[];
    [key: string]: unknown;
  }): Promise<ApifyJobResult[]> {
    const workplaceMerged = new Set<string>(
      (params.workplaceType ?? []).map((w) => w.trim()).filter(Boolean),
    );
    const geoLocations: string[] = [];
    for (const loc of params.locations?.filter(Boolean) ?? []) {
      if (loc.toLowerCase() === 'remote') workplaceMerged.add('Remote');
      else geoLocations.push(loc);
    }
    const input: Record<string, unknown> = {
      jobTitles: params.jobTitles.filter(Boolean),
      locations: geoLocations,
      postedLimit: mapPostedLimitToApify(params.postedLimit ?? 'Past Week'),
      maxItems: params.maxItems ?? 50,
      sortBy: params.sort ?? 'date',
    };
    if (workplaceMerged.size > 0) {
      input.workplaceType = mapWorkplaceTypesToHarvestApi([...workplaceMerged]);
    }
    if (params.employmentType?.length) input.employmentType = params.employmentType;
    if (params.experienceLevel?.length) input.experienceLevel = params.experienceLevel;

    const run = await this.runActor({
      actorId: APIFY_ACTORS.LINKEDIN_JOBS,
      input,
    });

    let status = run.status;
    let datasetId = run.datasetId;

    if (status === 'RUNNING' || status === 'READY') {
      const st = await this.pollRunUntilFinished(run.runId);
      status = st.status;
      datasetId = st.datasetId;
      if (status === 'FAILED') throw new Error('Job scraping failed (Apify run failed).');
      if (status === 'RUNNING') throw new Error('Job scraping timed out waiting for Apify run.');
    }

    if (status !== 'SUCCEEDED' || !datasetId) {
      throw new Error(`Job scraping failed with status: ${status}`);
    }

    const items = await this.getDatasetItems<Record<string, unknown>>(datasetId);
    return this.normalizeHarvestApiJobs(items);
  }

  /** Normalize HarvestAPI LinkedIn job output to ApifyJobResult + extra for enrichment_data */
  private normalizeHarvestApiJobs(items: Record<string, unknown>[]): ApifyJobResult[] {
    return items.map((item) => {
      const company = item.company as Record<string, unknown> | undefined;
      const companyName =
        (company?.name as string) || (item.companyName as string) || (item.company as string) || '';
      const locationObj = item.location as Record<string, unknown> | undefined;
      const locationText =
        (locationObj?.linkedinText as string) ||
        (locationObj?.parsed as Record<string, unknown>)?.text as string |
        undefined ||
        (item.location as string) ||
        '';
      const salaryObj = item.salary as Record<string, unknown> | undefined;
      const salaryText = (salaryObj?.text as string) || (item.salary as string) || '';
      const url =
        (item.linkedinUrl as string) ||
        (item.url as string) ||
        (item.jobUrl as string) ||
        (item.link as string) ||
        '';
      const postedDate = (item.postedDate as string) || (item.postedAt as string) || '';
      const employeeCount = company?.employeeCount as number | undefined;
      const companySize =
        employeeCount != null
          ? employeeCount <= 10
            ? '1-10'
            : employeeCount <= 50
              ? '11-50'
              : employeeCount <= 200
                ? '51-200'
                : employeeCount <= 500
                  ? '201-500'
                  : '501+'
          : undefined;

      return {
        title: (item.title || item.jobTitle || '') as string,
        company: companyName,
        companyUrl: (company?.linkedinUrl as string) || (item.companyUrl as string) || '',
        companyLinkedinUrl: (company?.linkedinUrl as string) || '',
        companyDescription: (company?.description as string) || (item.companyDescription as string) || '',
        companySize,
        companyWebsite: (company?.website as string) || (item.companyWebsite as string) || '',
        location: locationText,
        locationText: locationText || undefined,
        salary: salaryText,
        description:
          (item.descriptionText as string) ||
          (item.description as string) ||
          (item.jobDescription as string) ||
          '',
        url,
        postedAt: postedDate,
        postedAtTimestamp: typeof item.postedDate === 'string' ? new Date(postedDate).getTime() : undefined,
        source: 'linkedin',
        externalId: (item.id as string) || undefined,
      } as ApifyJobResult;
    });
  }

  // Search Indeed jobs
  async searchIndeedJobs(params: {
    query: string;
    location?: string;
    limit?: number;
  }): Promise<ApifyJobResult[]> {
    const input = {
      position: params.query,
      location: params.location || '',
      maxItems: params.limit || 50,
    };

    const run = await this.runActor({ actorId: APIFY_ACTORS.INDEED_JOBS, input });
    let status = run.status;
    let datasetId = run.datasetId;
    if (status === 'RUNNING' || status === 'READY') {
      const st = await this.pollRunUntilFinished(run.runId);
      status = st.status;
      datasetId = st.datasetId;
    }
    if (status !== 'SUCCEEDED' || !datasetId) {
      throw new Error(`Job scraping failed with status: ${status}`);
    }

    const items = await this.getDatasetItems<Record<string, unknown>>(datasetId);
    
    return items.map((item) => ({
      title: (item.title || item.positionName || '') as string,
      company: (item.company || item.companyName || '') as string,
      companyUrl: (item.companyUrl || '') as string,
      location: (item.location || '') as string,
      salary: (item.salary || '') as string,
      description: (item.description || item.jobDescription || '') as string,
      url: (item.url || item.externalUrl || '') as string,
      postedAt: (item.postedAt || '') as string,
      source: 'indeed',
    }));
  }

  // Enriquecer perfil de LinkedIn
  async enrichLinkedInProfile(linkedinUrl: string): Promise<{
    name: string;
    title: string;
    email?: string;
    company?: string;
  } | null> {
    const input = {
      profileUrls: [linkedinUrl],
    };

    const run = await this.runActor({ actorId: APIFY_ACTORS.LINKEDIN_PROFILE, input });
    let status = run.status;
    let datasetId = run.datasetId;
    if (status === 'RUNNING' || status === 'READY') {
      const st = await this.pollRunUntilFinished(run.runId, 120_000);
      status = st.status;
      datasetId = st.datasetId;
    }
    if (status !== 'SUCCEEDED' || !datasetId) {
      return null;
    }

    const items = await this.getDatasetItems<Record<string, unknown>>(datasetId);
    
    if (items.length === 0) return null;

    const profile = items[0];
    
    return {
      name: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
      title: (profile.headline || profile.title || '') as string,
      email: (profile.email || '') as string,
      company: (profile.company || profile.currentCompany || '') as string,
    };
  }
}

// Factory function para crear cliente con API key del usuario
export async function createApifyClient(): Promise<ApifyClient> {
  const user = await getCurrentUser();
  if (!user || !supabase) throw new Error('You must be logged in.');

  const key = await getApifyApiKeyForBrowser();
  if (!key) {
    throw new Error(
      'Apify API key not configured. Add a row in Supabase → api_keys (service apify, your user id), set VITE_APIFY_API_TOKEN, or rely on Edge APIFY_API_TOKEN.',
    );
  }

  return new ApifyClient(key);
}

/** Job URLs already present for this user (to avoid re-importing / re-enriching). */
export async function getExistingJobUrls(userId: string): Promise<Set<string>> {
  if (!supabase) return new Set();
  const { data, error } = await supabase
    .from('leads')
    .select('job_url')
    .eq('user_id', userId)
    .not('job_url', 'is', null);

  if (error) {
    console.error('Error fetching existing job URLs:', error);
    return new Set();
  }
  const urls = ((data ?? []) as { job_url: string | null }[])
    .map((r) => r.job_url as string)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  return new Set(urls);
}

/**
 * Save scraping results as leads. Deduplicates by job_url (only inserts new jobs).
 * Sets scraping_job_id, job_external_id, is_marked_as_lead: false.
 */
export async function saveJobsAsLeads(
  jobs: ApifyJobResult[],
  scrapingJobId: string,
  userId: string
): Promise<{ imported: number; skipped: number }> {
  if (!supabase) throw new Error('Supabase not configured.');
  const db = supabase;
  const existingUrls = new Set<string>();
  const existingExternalIds = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data: batch, error: batchErr } = await db
      .from('leads')
      .select('job_url, job_external_id')
      .eq('user_id', userId)
      .range(from, from + pageSize - 1);
    if (batchErr) throw batchErr;
    const rows = (batch ?? []) as { job_url: string | null; job_external_id: string | null }[];
    for (const r of rows) {
      if (r.job_url) existingUrls.add(r.job_url);
      if (r.job_external_id) existingExternalIds.add(r.job_external_id);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  let newJobs = jobs.filter((j) => {
    if (!j.url) return false;
    if (existingUrls.has(j.url)) return false;
    if (j.externalId && existingExternalIds.has(j.externalId)) return false;
    return true;
  });
  const seenBatch = new Set<string>();
  newJobs = newJobs.filter((j) => {
    const key = j.externalId ? `id:${j.externalId}` : `url:${j.url}`;
    if (seenBatch.has(key)) return false;
    seenBatch.add(key);
    return true;
  });

  const leads = newJobs.map((job) => {
    const enrichment_data: Record<string, unknown> = {};
    if (job.companySize != null) enrichment_data.companySize = job.companySize;
    if (job.companyWebsite != null) enrichment_data.companyWebsite = job.companyWebsite;
    if (job.externalId != null) enrichment_data.externalId = job.externalId;

    return {
      user_id: userId,
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
      status: 'backlog' as const,
      enrichment_data,
      tags: [],
      channel: job.source === 'linkedin' ? LINKEDIN_JOB_POST_CHANNEL : null,
    };
  });

  if (leads.length === 0) {
    await supabase.from('scraping_jobs').update({ leads_found: jobs.length, leads_imported: 0, status: 'completed', completed_at: new Date().toISOString() } as never).eq('id', scrapingJobId);
    return { imported: 0, skipped: jobs.length };
  }

  const { data, error } = await supabase.from('leads').insert(leads as never).select('id');

  if (error) {
    console.error('Error saving leads:', error);
    throw error;
  }

  await supabase.from('scraping_jobs').update({ leads_found: jobs.length, leads_imported: (data as { id: string }[] | null)?.length ?? 0, status: 'completed', completed_at: new Date().toISOString() } as never).eq('id', scrapingJobId);

  return { imported: data?.length ?? 0, skipped: jobs.length - (data?.length ?? 0) };
}

/** Normalize form/saved input to RunLinkedInSearchInput (jobTitles array, etc.) */
function buildSearchParams(input: Record<string, unknown>): RunLinkedInSearchInput {
  const toArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
    if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
    return [];
  };
  return {
    jobTitles: toArray(input.jobTitles ?? input.searchQueries ?? input.query ?? []),
    locations: toArray(input.locations ?? input.location ?? []),
    postedLimit:
      (input.postedLimit as RunLinkedInSearchInput['postedLimit']) ?? 'Past Week',
    maxItems: typeof input.maxItems === 'number' ? input.maxItems : Number(input.maxItems) || 500,
    sort: (input.sort as RunLinkedInSearchInput['sort']) ?? 'date',
    workplaceType: toArray(input.workplaceType ?? []),
    employmentType: toArray(input.employmentType ?? []),
    experienceLevel: toArray(input.experienceLevel ?? []),
  };
}

/**
 * Single entry point to run a job search for any supported actor.
 * Each source (LinkedIn Jobs, Indeed, Glassdoor) keeps its own form and UI; this dispatches by actorId.
 * Currently only LinkedIn Jobs (HarvestAPI) is implemented.
 */
export async function runJobSearch(options: {
  actorId: string;
  input?: Record<string, unknown>;
  savedSearchId?: string;
}): Promise<RunLinkedInSearchResult> {
  const { actorId, input, savedSearchId } = options;
  if (actorId === APIFY_ACTORS.LINKEDIN_JOBS) {
    return runLinkedInJobSearch({
      input: (input ?? {}) as RunLinkedInSearchInput | Record<string, unknown>,
      savedSearchId,
    });
  }
  throw new Error(
    `This source is not connected yet. Currently only LinkedIn Jobs is supported. (Received: ${actorId})`
  );
}

/**
 * Run LinkedIn job search (HarvestAPI): create scraping_job, call Apify, dedup and save leads.
 * Use from New Search (pass input) or from Saved search (pass savedSearchId to load input).
 */
export async function runLinkedInJobSearch(options: {
  input: RunLinkedInSearchInput | Record<string, unknown>;
  savedSearchId?: string;
}): Promise<RunLinkedInSearchResult> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be logged in to run a search.');

  const rawInput: Record<string, unknown> = options.savedSearchId
    ? await loadSavedSearchInput(options.savedSearchId)
    : (options.input as Record<string, unknown>);
  const params = buildSearchParams(rawInput);
  if (!params.jobTitles.length) {
    throw new Error('At least one job title is required.');
  }

  const searchQuery = params.jobTitles.join(', ');
  const searchFilters = {
    jobTitles: params.jobTitles,
    locations: params.locations,
    postedLimit: params.postedLimit,
    maxItems: params.maxItems,
    sort: params.sort,
  };

  const { data: jobRow, error: insertError } = await supabase
    .from('scraping_jobs')
    .insert({
      user_id: user.id,
      actor_id: APIFY_ACTORS.LINKEDIN_JOBS,
      run_id: null,
      saved_search_id: options.savedSearchId ?? null,
      search_query: searchQuery,
      search_location: params.locations?.join(', ') ?? null,
      search_filters: searchFilters,
      status: 'running',
      leads_found: 0,
      leads_imported: 0,
      error_message: null,
      started_at: new Date().toISOString(),
      completed_at: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).select('id').single();

  if (insertError || !jobRow) {
    throw new Error(insertError?.message ?? 'Failed to create scraping job.');
  }

  const scrapingJobId = (jobRow as { id: string }).id;

  try {
    const client = await createApifyClient();
    const jobs = await client.searchLinkedInJobs(params);
    const result = await saveJobsAsLeads(jobs, scrapingJobId, user.id);
    return {
      scrapingJobId,
      imported: result.imported,
      skipped: result.skipped,
      totalFromApify: jobs.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (supabase) {
      await supabase.from('scraping_jobs').update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() } as never).eq('id', scrapingJobId);
    }
    throw err;
  }
}

async function loadSavedSearchInput(savedSearchId: string): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('Supabase not configured.');
  const { data, error } = await supabase
    .from('saved_searches')
    .select('input')
    .eq('id', savedSearchId)
    .single();
  const row = data as { input: unknown } | null;
  if (error || !row?.input) {
    throw new Error('Saved search not found or has no input.');
  }
  return (row.input as Record<string, unknown>) ?? {};
}
