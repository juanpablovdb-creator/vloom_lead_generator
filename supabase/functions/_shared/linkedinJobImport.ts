// Shared LinkedIn Jobs (HarvestAPI) → leads import for run-job-search + apify-job-webhook.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeLeadScore } from "./leadScore.ts";
import { loadExistingLeadDedupeKeys } from "./loadExistingLeadDedupeKeys.ts";

export const LINKEDIN_JOB_POST_CHANNEL = "LinkedIn Job Post";

export interface JobResult {
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
  recruiterName?: string;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

export function normalizeCompanyName(raw: string): string {
  return (raw ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeDomain(raw: string): string {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    const cleaned = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
    return cleaned.split("/")[0];
  }
}

export function normalizeHarvestApiJobs(items: Record<string, unknown>[]): JobResult[] {
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

function buildExcludeDomainSet(searchFilters: Record<string, unknown>): Set<string> {
  const excludeDomainsRaw = searchFilters.excludeDomains;
  const excludeList = Array.isArray(excludeDomainsRaw)
    ? (excludeDomainsRaw as unknown[]).map((v) => String(v))
    : typeof excludeDomainsRaw === "string"
      ? toArray(excludeDomainsRaw)
      : [];
  return new Set(
    excludeList
      .map((d) => normalizeDomain(d))
      .filter((d) => d.length > 0),
  );
}

export interface LinkedInJobImportResult {
  imported: number;
  skipped: number;
  totalFromApify: number;
}

async function loadBlockedCompanyNormalizedSet(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("blocked_companies")
    .select("company_name_normalized")
    .eq("user_id", userId);

  if (error) {
    console.warn("[linkedinJobImport] blocked_companies query failed:", error.message);
    return new Set();
  }

  const rows = (data ?? []) as Array<{ company_name_normalized?: string | null }>;
  return new Set(
    rows
      .map((r) => normalizeCompanyName(r.company_name_normalized ?? ""))
      .filter((v) => v.length > 0),
  );
}

/** Fetch dataset items from Apify (JSON array). */
export async function fetchApifyDatasetItems(
  datasetId: string,
  apiToken: string,
): Promise<Record<string, unknown>[]> {
  const dsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
    { headers: { Authorization: `Bearer ${apiToken}` } },
  );
  if (!dsRes.ok) {
    const errBody = await dsRes.json().catch(() => ({}));
    const msg = (errBody as { error?: { message?: string } })?.error?.message;
    throw new Error(msg ?? `Failed to get dataset items (${dsRes.status})`);
  }
  const raw = await dsRes.json();
  return Array.isArray(raw) ? raw : (raw?.items ?? raw?.results ?? []);
}

/**
 * Normalize Apify items, apply excludeDomains from search_filters, dedupe, insert leads, update scraping_jobs.
 */
export async function importLinkedInJobsFromItems(options: {
  supabase: SupabaseClient;
  scrapingJobId: string;
  userId: string;
  items: Record<string, unknown>[];
  searchFilters: Record<string, unknown>;
}): Promise<LinkedInJobImportResult> {
  const { supabase, scrapingJobId, userId, items, searchFilters } = options;

  let jobs = normalizeHarvestApiJobs(items);
  const normalizedExclude = buildExcludeDomainSet(searchFilters);
  if (normalizedExclude.size > 0) {
    jobs = jobs.filter((job) => {
      const domains: string[] = [];
      if (job.companyWebsite) domains.push(normalizeDomain(job.companyWebsite));
      if (job.companyUrl) domains.push(normalizeDomain(job.companyUrl));
      return !domains.some((d) => normalizedExclude.has(d));
    });
  }

  const blocked = await loadBlockedCompanyNormalizedSet(supabase, userId);
  if (blocked.size > 0) {
    jobs = jobs.filter((job) => !blocked.has(normalizeCompanyName(job.company)));
  }

  const totalFromApify = jobs.length;
  console.log("[linkedinJobImport] items", items.length, "normalized", jobs.length);

  const { urls: existingUrls, externalIds: existingExternalIds } = await loadExistingLeadDedupeKeys(
    supabase,
    userId,
  );
  let newJobs = jobs.filter((j) => {
    if (!j.url) return false;
    if (existingUrls.has(j.url)) return false;
    if (j.externalId && existingExternalIds.has(j.externalId)) return false;
    return true;
  });
  const seenBatchKeys = new Set<string>();
  newJobs = newJobs.filter((j) => {
    const key = j.externalId ? `id:${j.externalId}` : `url:${j.url}`;
    if (seenBatchKeys.has(key)) return false;
    seenBatchKeys.add(key);
    return true;
  });

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
      status: "backlog",
      score,
      enrichment_data,
      tags: [],
      channel: LINKEDIN_JOB_POST_CHANNEL,
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
    return { imported: 0, skipped: jobs.length, totalFromApify };
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

  return {
    imported: inserted?.length ?? 0,
    skipped: jobs.length - (inserted?.length ?? 0),
    totalFromApify,
  };
}
