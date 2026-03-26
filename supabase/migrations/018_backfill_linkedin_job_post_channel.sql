-- Backfill channel for leads imported from LinkedIn job posting scrapes
-- (job_source is set to 'linkedin' by HarvestAPI / client normalization).

UPDATE leads
SET
  channel = 'LinkedIn Job Post',
  updated_at = NOW()
WHERE LOWER(TRIM(COALESCE(job_source, ''))) = 'linkedin';
