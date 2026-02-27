// =====================================================
// Leadflow Vloom - Apify Client
// =====================================================
import { supabase, supabaseUrl, getCurrentUser } from './supabase';
import type { ApifyJobResult } from '@/types/database';

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
}

/**
 * Run job search via Edge Function (API key stays in Edge Function Secrets).
 * Uses fetch so we can always read the response body and show the real error on non-2xx.
 * If the Edge Function is not deployed or unreachable, falls back to runJobSearch (requires Apify key in api_keys table).
 */
async function fetchWithAuth(
  url: string,
  body: Record<string, unknown>,
  token: string
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

export async function runJobSearchViaEdge(options: {
  actorId: string;
  input?: Record<string, unknown>;
  savedSearchId?: string;
}): Promise<RunLinkedInSearchResult> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured.');
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/run-job-search`;

  const getToken = async (): Promise<string> => {
    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !session?.user) {
      throw new Error('You must be logged in to run a search. Please sign in again.');
    }
    const token = session.access_token;
    if (!token) throw new Error('Session expired. Please sign in again.');
    return token;
  };

  let token = await getToken();
  let response: Response;
  try {
    response = await fetchWithAuth(url, options, token);
    if (response.status === 401) {
      token = await getToken();
      response = await fetchWithAuth(url, options, token);
    }
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    const isUnreachable = /fetch failed|NetworkError|Failed to fetch/i.test(msg);
    if (isUnreachable) {
      try {
        return await runJobSearch(options);
      } catch (fallbackErr) {
        const detail = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        const needKey =
          /API key not configured|add it in Settings/i.test(detail);
        throw new Error(
          needKey
            ? `Edge Function is not deployed. Either: (1) Run "supabase functions deploy run-job-search" and set APIFY_API_TOKEN in Edge Function Secrets, or (2) Add your Apify key in the api_keys table (Supabase Table Editor). Details: ${detail}`
            : `Edge Function unreachable. Deploy with: supabase functions deploy run-job-search and set APIFY_API_TOKEN in Secrets. If you use the fallback, add your Apify key in the api_keys table. Details: ${detail}`
        );
      }
    }
    throw new Error(msg);
  }

  const text = await response.text();
  let body: {
    error?: string | { code?: number; message?: string };
    message?: string | Record<string, unknown>;
    scrapingJobId?: string;
    imported?: number;
    skipped?: number;
    totalFromApify?: number;
  };
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    body = {};
  }
  /** Always return a string for the user; avoid [object Object]. */
  const toErrorString = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object' && 'message' in v && typeof (v as { message: unknown }).message === 'string')
      return (v as { message: string }).message;
    return v != null ? String(v) : '';
  };
  if (!response.ok) {
    const raw =
      typeof body?.error === 'string'
        ? body.error
        : typeof body?.message === 'string'
          ? body.message
          : body?.error != null
            ? toErrorString(body.error)
            : body?.message != null
              ? toErrorString(body.message)
              : text || `Edge Function returned ${response.status}`;
    let message = toErrorString(raw);
    if (!message) message = text || `Edge Function returned ${response.status}`;
    if (response.status === 401) {
      if (/Invalid JWT|invalid.*jwt|unauthorized|expired|session expired/i.test(message)) {
        message =
          'Sesión no reconocida (a veces por la migración JWT en Supabase). Solución: en la raíz del proyecto ejecuta: npx supabase functions deploy run-job-search --no-verify-jwt. Luego cierra sesión, vuelve a entrar y prueba de nuevo.';
      } else if (/must be logged in/i.test(message)) {
        message =
          'Sesión no reconocida. Ejecuta: npx supabase functions deploy run-job-search --no-verify-jwt. Luego cierra sesión y vuelve a entrar.';
      }
    }
    throw new Error(message);
  }
  if (body?.error) throw new Error(toErrorString(body.error));
  if (body?.scrapingJobId == null) throw new Error('Invalid response from run-job-search.');
  return {
    scrapingJobId: body.scrapingJobId,
    imported: body.imported ?? 0,
    skipped: body.skipped ?? 0,
    totalFromApify: body.totalFromApify ?? 0,
  };
}

/**
 * Send selected job results to Leads: mark as lead + backlog, then enrich company data via Harvest API LinkedIn Company.
 * Call from Saved Searches results when user clicks "Send to leads".
 */
export async function sendSelectedToLeadsAndEnrich(leadIds: string[]): Promise<{
  sent: number;
  enriched: number;
}> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured.');
  if (!leadIds.length) return { sent: 0, enriched: 0 };

  const { error: updateError } = await supabase
    .from('leads')
    .update({
      is_marked_as_lead: true,
      status: 'backlog',
      updated_at: new Date().toISOString(),
    })
    .in('id', leadIds);

  if (updateError) throw new Error(updateError.message);

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/enrich-lead-companies`;
  const getToken = async (): Promise<string> => {
    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ leadIds }),
    });
    if (response.status === 401) {
      token = await getToken();
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
  let body: { error?: string; ok?: boolean; enriched?: number; total?: number };
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : text || `Enrichment returned ${response.status}`);
  }
  return {
    sent: leadIds.length,
    enriched: body?.enriched ?? 0,
  };
}

/**
 * Recompute lead scores with the Clay-style formula (location, size, revenue, remote).
 * Pass leadIds to recompute only those leads; omit to recompute all user's leads.
 */
export async function recomputeLeadScores(leadIds?: string[]): Promise<{ updated: number; total: number }> {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured.');
  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/recompute-lead-scores`;
  const getToken = async (): Promise<string> => {
    const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
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
        'Invalid or expired session. Sign out, sign in again, then try Recalculate scores. If it persists, deploy with: npx supabase functions deploy recompute-lead-scores --no-verify-jwt'
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
    const input: Record<string, unknown> = {
      jobTitles: params.jobTitles.filter(Boolean),
      locations: params.locations?.filter(Boolean) ?? [],
      postedLimit: mapPostedLimitToApify(params.postedLimit ?? 'Past Week'),
      maxItems: params.maxItems ?? 50,
      sortBy: params.sort ?? 'date',
    };
    if (params.workplaceType?.length) input.workplaceType = params.workplaceType;
    if (params.employmentType?.length) input.employmentType = params.employmentType;
    if (params.experienceLevel?.length) input.experienceLevel = params.experienceLevel;

    const run = await this.runActor({
      actorId: APIFY_ACTORS.LINKEDIN_JOBS,
      input,
    });

    let status = run.status;
    let datasetId = run.datasetId;

    if (status === 'RUNNING') {
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
    if (status === 'RUNNING') {
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
    if (status === 'RUNNING') {
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

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('api_key_encrypted')
    .eq('user_id', user.id)
    .eq('service', 'apify')
    .eq('is_active', true)
    .single();

  if (!apiKey) {
    throw new Error('Apify API key not configured. Please add it in Settings.');
  }

  return new ApifyClient(apiKey.api_key_encrypted);
}

/** Job URLs already present for this user (to avoid re-importing / re-enriching). */
export async function getExistingJobUrls(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('leads')
    .select('job_url')
    .eq('user_id', userId)
    .not('job_url', 'is', null);

  if (error) {
    console.error('Error fetching existing job URLs:', error);
    return new Set();
  }
  const urls = (data ?? [])
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
  const existingUrls = await getExistingJobUrls(userId);
  const newJobs = jobs.filter((j) => j.url && !existingUrls.has(j.url));

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
    };
  });

  if (leads.length === 0) {
    await supabase
      .from('scraping_jobs')
      .update({
        leads_found: jobs.length,
        leads_imported: 0,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', scrapingJobId);
    return { imported: 0, skipped: jobs.length };
  }

  const { data, error } = await supabase.from('leads').insert(leads).select('id');

  if (error) {
    console.error('Error saving leads:', error);
    throw error;
  }

  await supabase
    .from('scraping_jobs')
    .update({
      leads_found: jobs.length,
      leads_imported: data?.length ?? 0,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', scrapingJobId);

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
    })
    .select('id')
    .single();

  if (insertError || !jobRow) {
    throw new Error(insertError?.message ?? 'Failed to create scraping job.');
  }

  const scrapingJobId = jobRow.id;

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
    await supabase
      .from('scraping_jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', scrapingJobId);
    throw err;
  }
}

async function loadSavedSearchInput(savedSearchId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('input')
    .eq('id', savedSearchId)
    .single();
  if (error || !data?.input) {
    throw new Error('Saved search not found or has no input.');
  }
  return (data.input as Record<string, unknown>) ?? {};
}
