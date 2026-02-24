// =====================================================
// LEADFLOW - Apify Client
// =====================================================
import { supabase } from './supabase';
import type { ApifyJobResult } from '@/types/database';

/** Params for running LinkedIn job search (HarvestAPI). From New Search form or saved_searches.input */
export interface RunLinkedInSearchInput {
  jobTitles: string[];
  locations?: string[];
  postedLimit?: 'Past 24 hours' | 'Past Week' | 'Past Month';
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

const APIFY_BASE_URL = 'https://api.apify.com/v2';

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
  waitForFinish?: boolean;
  timeoutSecs?: number;
}

interface ApifyRunResult {
  runId: string;
  status: string;
  datasetId?: string;
}

export class ApifyClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Iniciar un actor
  async runActor(options: ApifyRunOptions): Promise<ApifyRunResult> {
    const { actorId, input, waitForFinish = false, timeoutSecs = 300 } = options;

    const url = `${APIFY_BASE_URL}/acts/${actorId}/runs?token=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...input,
        ...(waitForFinish && { waitForFinish: timeoutSecs }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Apify error: ${error}`);
    }

    const data = await response.json();
    
    return {
      runId: data.data.id,
      status: data.data.status,
      datasetId: data.data.defaultDatasetId,
    };
  }

  // Obtener estado de un run
  async getRunStatus(runId: string): Promise<{ status: string; datasetId?: string }> {
    const url = `${APIFY_BASE_URL}/actor-runs/${runId}?token=${this.apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to get run status');
    }

    const data = await response.json();
    
    return {
      status: data.data.status,
      datasetId: data.data.defaultDatasetId,
    };
  }

  // Obtener resultados de un dataset
  async getDatasetItems<T = unknown>(datasetId: string): Promise<T[]> {
    const url = `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${this.apiKey}&format=json`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to get dataset items');
    }

    return response.json();
  }

  /**
   * HarvestAPI LinkedIn Job Search: job titles, locations, postedLimit (e.g. Past 24 hours).
   * No cookies, rich output. Input shape: https://apify.com/harvestapi/linkedin-job-search/input
   */
  async searchLinkedInJobs(params: {
    jobTitles: string[];
    locations?: string[];
    postedLimit?: 'Past 24 hours' | 'Past Week' | 'Past Month';
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
      postedLimit: params.postedLimit ?? 'Past Week',
      maxItems: params.maxItems ?? 50,
      sort: params.sort ?? 'date',
    };
    if (params.workplaceType?.length) input.workplaceType = params.workplaceType;
    if (params.employmentType?.length) input.employmentType = params.employmentType;
    if (params.experienceLevel?.length) input.experienceLevel = params.experienceLevel;

    const run = await this.runActor({
      actorId: APIFY_ACTORS.LINKEDIN_JOBS,
      input,
      waitForFinish: true,
      timeoutSecs: 600,
    });

    if (run.status !== 'SUCCEEDED' || !run.datasetId) {
      throw new Error(`Job scraping failed with status: ${run.status}`);
    }

    const items = await this.getDatasetItems<Record<string, unknown>>(run.datasetId);
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

  // Buscar jobs de Indeed
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

    const run = await this.runActor({
      actorId: APIFY_ACTORS.INDEED_JOBS,
      input,
      waitForFinish: true,
      timeoutSecs: 600,
    });

    if (run.status !== 'SUCCEEDED' || !run.datasetId) {
      throw new Error(`Job scraping failed with status: ${run.status}`);
    }

    const items = await this.getDatasetItems<Record<string, unknown>>(run.datasetId);
    
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

    const run = await this.runActor({
      actorId: APIFY_ACTORS.LINKEDIN_PROFILE,
      input,
      waitForFinish: true,
      timeoutSecs: 120,
    });

    if (run.status !== 'SUCCEEDED' || !run.datasetId) {
      return null;
    }

    const items = await this.getDatasetItems<Record<string, unknown>>(run.datasetId);
    
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

// Factory function para crear cliente con API key del team
export async function createApifyClient(): Promise<ApifyClient> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id')
    .single();

  if (!profile?.team_id) {
    throw new Error('No team found. Please join or create a team first.');
  }

  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('api_key_encrypted')
    .eq('team_id', profile.team_id)
    .eq('service', 'apify')
    .eq('is_active', true)
    .single();

  if (!apiKey) {
    throw new Error('Apify API key not configured. Please add it in Settings.');
  }

  // En producción, descifrar la key aquí
  return new ApifyClient(apiKey.api_key_encrypted);
}

/** Job URLs already present for this team (to avoid re-importing / re-enriching). */
export async function getExistingJobUrls(teamId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('leads')
    .select('job_url')
    .eq('team_id', teamId)
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
  userId: string,
  teamId: string | null
): Promise<{ imported: number; skipped: number }> {
  const teamIdFilter = teamId ?? undefined;
  const existingUrls =
    teamIdFilter != null ? await getExistingJobUrls(teamIdFilter) : new Set<string>();
  const newJobs = jobs.filter((j) => j.url && !existingUrls.has(j.url));

  const leads = newJobs.map((job) => {
    const enrichment_data: Record<string, unknown> = {};
    if (job.companySize != null) enrichment_data.companySize = job.companySize;
    if (job.companyWebsite != null) enrichment_data.companyWebsite = job.companyWebsite;
    if (job.externalId != null) enrichment_data.externalId = job.externalId;

    return {
      user_id: userId,
      team_id: teamId,
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
    maxItems: typeof input.maxItems === 'number' ? input.maxItems : Number(input.maxItems) || 50,
    sort: (input.sort as RunLinkedInSearchInput['sort']) ?? 'date',
    workplaceType: toArray(input.workplaceType ?? []),
    employmentType: toArray(input.employmentType ?? []),
    experienceLevel: toArray(input.experienceLevel ?? []),
  };
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('team_id')
    .eq('id', user.id)
    .single();

  const teamId = profile?.team_id ?? null;
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
      team_id: teamId,
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
    const result = await saveJobsAsLeads(jobs, scrapingJobId, user.id, teamId);
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
