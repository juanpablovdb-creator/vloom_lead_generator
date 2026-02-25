// =====================================================
// Leadflow Vloom - TypeScript Types
// =====================================================
// Estos types hacen match exacto con el schema de Supabase

export type UserRole = 'owner' | 'admin' | 'member';

/** CRM pipeline statuses (post-migration 002) */
export type LeadStatus =
  | 'backlog'
  | 'not_contacted'
  | 'invite_sent'
  | 'connected'
  | 'reply'
  | 'positive_reply'
  | 'negotiation'
  | 'closed'
  | 'lost';

export type EmailStatus = 
  | 'draft'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'failed';

export type ScrapingJobStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ApiService = 
  | 'apify'
  | 'sendgrid'
  | 'anthropic'
  | 'hunter'
  | 'clearbit';

// =====================================================
// Database Row Types
// =====================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  user_id: string;
  is_shared: boolean;
  
  // Job Post Info
  job_title: string | null;
  job_description: string | null;
  job_url: string | null;
  job_source: string | null;
  job_location: string | null;
  job_salary_range: string | null;
  job_posted_at: string | null;
  
  // Company Info
  company_name: string | null;
  company_url: string | null;
  company_linkedin_url: string | null;
  company_size: string | null;
  company_industry: string | null;
  company_description: string | null;
  company_funding: string | null;
  company_location: string | null;
  
  // Contact Info
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_linkedin_url: string | null;
  contact_phone: string | null;
  
  // Status & Scoring
  status: LeadStatus;
  score: number;
  score_weights: ScoreWeights;
  
  // Enrichment
  enrichment_data: Record<string, unknown>;
  last_enriched_at: string | null;
  
  // Notes & Tags
  notes: string | null;
  tags: string[];

  // Run & marking (002, 003)
  scraping_job_id: string | null;
  job_external_id: string | null;
  /** Only true when user explicitly marks as lead; CRM and Leads list filter by this. */
  is_marked_as_lead: boolean;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface ScoreWeights {
  has_email: number;
  has_linkedin: number;
  company_size_match: number;
  industry_match: number;
  recent_posting: number;
  [key: string]: number; // Allow custom weights
}

export interface ScoringPreset {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  weights: ScoreWeights;
  target_company_sizes: string[];
  target_industries: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  user_id: string;
  is_shared: boolean;
  name: string;
  subject: string;
  body_template: string;
  ai_prompt: string | null;
  tone: 'professional' | 'casual' | 'friendly';
  created_at: string;
  updated_at: string;
}

export interface EmailSent {
  id: string;
  user_id: string;
  lead_id: string;
  template_id: string | null;
  subject: string;
  body: string;
  sendgrid_message_id: string | null;
  status: EmailStatus;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScrapingJob {
  id: string;
  user_id: string;
  actor_id: string;
  run_id: string | null;
  saved_search_id: string | null;
  search_query: string;
  search_location: string | null;
  search_filters: Record<string, unknown>;
  status: ScrapingJobStatus;
  leads_found: number;
  leads_imported: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  actor_id: string;
  input: Record<string, unknown>;
  /** When true, search can be re-run automatically (e.g. daily) for new results only. */
  autorun: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  service: ApiService;
  api_key_encrypted: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================
// API Response Types
// =====================================================

export interface ApifyJobResult {
  title: string;
  company: string;
  companyUrl?: string;
  companyLinkedinUrl?: string;
  companyDescription?: string;
  companySize?: string;
  companyWebsite?: string;
  location?: string;
  locationText?: string;
  salary?: string;
  description?: string;
  url: string;
  postedAt?: string;
  postedAtTimestamp?: number;
  source: string;
  /** LinkedIn job id for dedup and enrichment_data */
  externalId?: string;
  [key: string]: unknown;
}

export interface EnrichmentResult {
  company?: {
    name: string;
    domain: string;
    size: string;
    industry: string;
    description: string;
    linkedin_url: string;
    funding: string;
    location: string;
  };
  contact?: {
    name: string;
    title: string;
    email: string;
    linkedin_url: string;
    phone?: string;
  };
}

// =====================================================
// UI State Types
// =====================================================

/** View mode for Leads list and CRM: by company (group by company) or by person (one row per contact). */
export type LeadViewBy = 'company' | 'person';

export interface LeadFilters {
  status?: LeadStatus[];
  source?: string[];
  company_size?: string[];
  industry?: string[];
  has_email?: boolean;
  has_linkedin?: boolean;
  score_min?: number;
  score_max?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  tags?: string[];
  show_shared?: boolean;
  /** Filter to leads from this saved search (via scraping_job.saved_search_id). */
  saved_search_id?: string;
  /** Filter to leads from this single scraping run (e.g. after New Search). */
  scraping_job_id?: string;
  /** When true, show only rows where user marked as lead (CRM / Leads list). */
  marked_as_lead_only?: boolean;
  /** Leads list and CRM: view by company or by person. */
  view_by?: LeadViewBy;
}

export interface LeadSort {
  column: keyof Lead;
  direction: 'asc' | 'desc';
}

export interface TableColumn {
  key: keyof Lead;
  label: string;
  visible: boolean;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

// =====================================================
// Action Types
// =====================================================

export interface BulkAction {
  type: 'enrich' | 'delete' | 'share' | 'unshare' | 'change_status' | 'add_tag';
  leadIds: string[];
  payload?: Record<string, unknown>;
}

export interface EmailGenerationRequest {
  lead_id: string;
  template_id?: string;
  custom_prompt?: string;
  tone?: 'professional' | 'casual' | 'friendly';
}

export interface EmailGenerationResponse {
  subject: string;
  body: string;
  lead: Lead;
}

// =====================================================
// Supabase Database Types (for type-safe queries)
// =====================================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id'>>;
      };
      leads: {
        Row: Lead;
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'score'>;
        Update: Partial<Omit<Lead, 'id' | 'user_id'>>;
      };
      scoring_presets: {
        Row: ScoringPreset;
        Insert: Omit<ScoringPreset, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ScoringPreset, 'id' | 'user_id'>>;
      };
      email_templates: {
        Row: EmailTemplate;
        Insert: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<EmailTemplate, 'id' | 'user_id'>>;
      };
      emails_sent: {
        Row: EmailSent;
        Insert: Omit<EmailSent, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<EmailSent, 'id' | 'user_id' | 'lead_id'>>;
      };
      scraping_jobs: {
        Row: ScrapingJob;
        Insert: Omit<ScrapingJob, 'id' | 'created_at'>;
        Update: Partial<Omit<ScrapingJob, 'id' | 'user_id'>>;
      };
      saved_searches: {
        Row: SavedSearch;
        Insert: Omit<SavedSearch, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SavedSearch, 'id' | 'user_id'>>;
      };
      api_keys: {
        Row: ApiKey;
        Insert: Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ApiKey, 'id' | 'user_id'>>;
      };
    };
  };
}
