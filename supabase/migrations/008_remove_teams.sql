-- =====================================================
-- Leadflow Vloom - Remove teams: drop team_id and teams table
-- =====================================================
-- Idempotent: safe to run multiple times; no-op if team_id already removed.

-- 1) api_keys: convert to user-scoped only if team_id exists
DROP POLICY IF EXISTS "Team admins can manage api keys" ON api_keys;
DROP POLICY IF EXISTS "Users can manage own api keys" ON api_keys;

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'api_keys' AND column_name = 'team_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'team_id') THEN
      UPDATE api_keys SET user_id = (SELECT p.id FROM profiles p WHERE p.team_id = api_keys.team_id LIMIT 1) WHERE user_id IS NULL;
    END IF;
    ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_team_id_service_key;
    ALTER TABLE api_keys DROP COLUMN IF EXISTS team_id;
  END IF;
  -- Backfill user_id when NULL (any path)
  UPDATE api_keys SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;
  IF EXISTS (SELECT 1 FROM api_keys LIMIT 1) AND NOT EXISTS (SELECT 1 FROM api_keys WHERE user_id IS NULL LIMIT 1) THEN
    ALTER TABLE api_keys ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_user_id_service_key ON api_keys(user_id, service);
CREATE POLICY "Users can manage own api keys" ON api_keys FOR ALL USING (auth.uid() = user_id);

-- 2) saved_searches: user-only policy, drop team_id
DROP POLICY IF EXISTS "Users can view own and team saved searches" ON saved_searches;
DROP POLICY IF EXISTS "Users can view team saved searches" ON saved_searches;
DROP POLICY IF EXISTS "Users can view own saved searches" ON saved_searches;
CREATE POLICY "Users can view own saved searches" ON saved_searches FOR SELECT USING (auth.uid() = user_id);

DROP INDEX IF EXISTS idx_saved_searches_team_id;
ALTER TABLE saved_searches DROP COLUMN IF EXISTS team_id;

-- 3) leads: drop shared-team policy, drop team_id, fix job_external_id index
DROP POLICY IF EXISTS "Users can view shared team leads" ON leads;
DROP INDEX IF EXISTS idx_leads_job_external_id;
DROP INDEX IF EXISTS idx_leads_team_id;
ALTER TABLE leads DROP COLUMN IF EXISTS team_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_job_external_id ON leads(user_id, job_external_id) WHERE job_external_id IS NOT NULL;

-- 4) email_templates: drop shared-team policy, drop team_id
DROP POLICY IF EXISTS "Users can view shared team templates" ON email_templates;
ALTER TABLE email_templates DROP COLUMN IF EXISTS team_id;

-- 5) profiles: user-only policy, drop get_my_team_id, drop team_id
DROP POLICY IF EXISTS "Users can view own profile and team members" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP FUNCTION IF EXISTS public.get_my_team_id();
ALTER TABLE profiles DROP COLUMN IF EXISTS team_id;

-- 6) scoring_presets, scraping_jobs: drop team_id
ALTER TABLE scoring_presets DROP COLUMN IF EXISTS team_id;
ALTER TABLE scraping_jobs DROP COLUMN IF EXISTS team_id;

-- 7) Drop teams table
DROP TABLE IF EXISTS teams CASCADE;
