-- =====================================================
-- Leadflow Vloom - Ensure no team_id remains and force PostgREST schema reload
-- =====================================================
-- Run this AFTER 008 if you still see "team_id column of scraping_jobs in the schema cache".
-- Then wait 30–60 seconds and try the app again.

-- 1) Force drop team_id from any table that might still have it (idempotent)
ALTER TABLE scraping_jobs DROP COLUMN IF EXISTS team_id;
ALTER TABLE saved_searches DROP COLUMN IF EXISTS team_id;
ALTER TABLE leads DROP COLUMN IF EXISTS team_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS team_id;
ALTER TABLE email_templates DROP COLUMN IF EXISTS team_id;
ALTER TABLE scoring_presets DROP COLUMN IF EXISTS team_id;
ALTER TABLE api_keys DROP COLUMN IF EXISTS team_id;

-- 2) Tell PostgREST to reload schema cache (run in same transaction)
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
