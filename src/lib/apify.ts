// =====================================================
// LEADFLOW - Apify Client
// =====================================================
import { supabase } from './supabase';
import type { ApifyJobResult, ScrapingJob } from '@/types/database';

const APIFY_BASE_URL = 'https://api.apify.com/v2';

// Actors recomendados para job scraping
export const APIFY_ACTORS = {
  LINKEDIN_JOBS: 'bebity/linkedin-jobs-scraper',
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

  // Buscar jobs de LinkedIn
  async searchLinkedInJobs(params: {
    query: string;
    location?: string;
    datePosted?: 'past24Hours' | 'pastWeek' | 'pastMonth';
    experienceLevel?: string[];
    limit?: number;
  }): Promise<ApifyJobResult[]> {
    const input = {
      searchQueries: [params.query],
      location: params.location || '',
      datePosted: params.datePosted || 'pastWeek',
      experienceLevel: params.experienceLevel || [],
      maxResults: params.limit || 50,
    };

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
    
    // Normalizar resultados
    return items.map((item) => ({
      title: (item.title || item.jobTitle || '') as string,
      company: (item.company || item.companyName || '') as string,
      companyUrl: (item.companyUrl || item.companyLink || '') as string,
      location: (item.location || '') as string,
      salary: (item.salary || item.salaryRange || '') as string,
      description: (item.description || item.jobDescription || '') as string,
      url: (item.url || item.jobUrl || item.link || '') as string,
      postedAt: (item.postedAt || item.datePosted || '') as string,
      source: 'linkedin',
    }));
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

// Guardar resultados de scraping como leads
export async function saveJobsAsLeads(
  jobs: ApifyJobResult[],
  scrapingJobId: string,
  userId: string,
  teamId?: string
): Promise<number> {
  const leads = jobs.map((job) => ({
    user_id: userId,
    team_id: teamId || null,
    is_shared: false,
    job_title: job.title,
    job_description: job.description,
    job_url: job.url,
    job_source: job.source,
    job_location: job.location,
    job_salary_range: job.salary,
    job_posted_at: job.postedAt || null,
    company_name: job.company,
    company_url: job.companyUrl,
    status: 'backlog' as const,
    enrichment_data: {},
    tags: [],
  }));

  const { data, error } = await supabase
    .from('leads')
    .insert(leads)
    .select('id');

  if (error) {
    console.error('Error saving leads:', error);
    throw error;
  }

  // Actualizar el scraping job con el conteo
  await supabase
    .from('scraping_jobs')
    .update({
      leads_found: jobs.length,
      leads_imported: data.length,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', scrapingJobId);

  return data.length;
}
