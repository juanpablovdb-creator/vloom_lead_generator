-- Backfill channel for leads imported from LinkedIn job posting scrapes
-- (job_source is set to 'linkedin' by HarvestAPI / client normalization).
-- Renamed from 018_* — duplicate 018 prefix conflicted with 018_backfill_lead_status_history_all_stages.sql

UPDATE leads
SET
  channel = 'LinkedIn Job Post',
  updated_at = NOW()
WHERE LOWER(TRIM(COALESCE(job_source, ''))) = 'linkedin';
