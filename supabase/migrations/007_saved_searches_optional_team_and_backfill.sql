-- =====================================================
-- Leadflow Vloom - Saved searches: team optional + backfill last 3 runs
-- =====================================================
-- Idempotent: if team_id already removed (008), only ensure "view own" policy and backfill without team_id.

-- 1) team_id optional (only if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'team_id') THEN
    ALTER TABLE saved_searches ALTER COLUMN team_id DROP NOT NULL;
  END IF;
END $$;

-- 2) SELECT policy: own + team if team_id exists, else own only
DROP POLICY IF EXISTS "Users can view team saved searches" ON saved_searches;
DROP POLICY IF EXISTS "Users can view own and team saved searches" ON saved_searches;
DROP POLICY IF EXISTS "Users can view own saved searches" ON saved_searches;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'team_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'team_id') THEN
    CREATE POLICY "Users can view own and team saved searches" ON saved_searches
      FOR SELECT USING (
        auth.uid() = user_id
        OR team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid() AND team_id IS NOT NULL)
      );
  ELSE
    CREATE POLICY "Users can view own saved searches" ON saved_searches FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3) Backfill: last 3 scraping_jobs per user without saved_search_id
DO $$
DECLARE
  r RECORD;
  new_id UUID;
  job_name VARCHAR(255);
  has_team_saved BOOLEAN;
  has_team_jobs BOOLEAN;
  has_autorun BOOLEAN;
BEGIN
  has_team_saved := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'team_id');
  has_team_jobs := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scraping_jobs' AND column_name = 'team_id');
  has_autorun := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'autorun');

  IF has_team_saved AND has_team_jobs THEN
    FOR r IN
      SELECT j.id AS job_id, j.user_id, j.team_id, j.search_query, j.started_at, j.created_at, j.actor_id, j.search_filters
      FROM scraping_jobs j
      INNER JOIN (
        SELECT id, user_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY started_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC) AS rn
        FROM scraping_jobs WHERE saved_search_id IS NULL
      ) ranked ON j.id = ranked.id AND ranked.rn <= 3
    LOOP
      job_name := LEFT(r.search_query || ' – ' || COALESCE(to_char(r.started_at, 'DD Mon YYYY, HH24:MI'), to_char(r.created_at, 'DD Mon YYYY')), 255);
      IF has_autorun THEN
        INSERT INTO saved_searches (user_id, team_id, name, actor_id, input, autorun)
        VALUES (r.user_id, r.team_id, job_name, r.actor_id, COALESCE(r.search_filters, '{}'::jsonb), false)
        RETURNING id INTO new_id;
      ELSE
        INSERT INTO saved_searches (user_id, team_id, name, actor_id, input)
        VALUES (r.user_id, r.team_id, job_name, r.actor_id, COALESCE(r.search_filters, '{}'::jsonb))
        RETURNING id INTO new_id;
      END IF;
      UPDATE scraping_jobs SET saved_search_id = new_id WHERE id = r.job_id;
    END LOOP;
  ELSE
    FOR r IN
      SELECT j.id AS job_id, j.user_id, j.search_query, j.started_at, j.created_at, j.actor_id, j.search_filters
      FROM scraping_jobs j
      INNER JOIN (
        SELECT id, user_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY started_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC) AS rn
        FROM scraping_jobs WHERE saved_search_id IS NULL
      ) ranked ON j.id = ranked.id AND ranked.rn <= 3
    LOOP
      job_name := LEFT(r.search_query || ' – ' || COALESCE(to_char(r.started_at, 'DD Mon YYYY, HH24:MI'), to_char(r.created_at, 'DD Mon YYYY')), 255);
      IF has_autorun THEN
        INSERT INTO saved_searches (user_id, name, actor_id, input, autorun)
        VALUES (r.user_id, job_name, r.actor_id, COALESCE(r.search_filters, '{}'::jsonb), false)
        RETURNING id INTO new_id;
      ELSE
        INSERT INTO saved_searches (user_id, name, actor_id, input)
        VALUES (r.user_id, job_name, r.actor_id, COALESCE(r.search_filters, '{}'::jsonb))
        RETURNING id INTO new_id;
      END IF;
      UPDATE scraping_jobs SET saved_search_id = new_id WHERE id = r.job_id;
    END LOOP;
  END IF;
END $$;
