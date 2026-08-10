-- Backfill channel for leads imported before channel was set or when column was null.

UPDATE leads
SET channel = 'LinkedIn Job Post'
WHERE channel IS NULL
  AND job_url IS NOT NULL
  AND job_url ILIKE '%linkedin.com/jobs%';

UPDATE leads
SET channel = 'LinkedIn Job Post'
WHERE channel IS NULL
  AND job_source = 'linkedin';

UPDATE leads
SET channel = 'LinkedIn Post Feeds'
WHERE channel IS NULL
  AND job_source = 'linkedin_post_feed';
