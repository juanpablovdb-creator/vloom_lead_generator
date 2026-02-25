-- =====================================================
-- Leadflow Vloom - Saved searches: team optional + backfill last 3 runs
-- =====================================================
-- 1) Allow saved_searches without team (personal saved searches)
-- 2) RLS: user sees own saved searches (user_id = auth.uid()) OR team's (team_id = my team)
-- 3) Backfill: create a saved_search for the last 3 scraping_jobs per user that have no saved_search_id

-- 1) team_id optional
ALTER TABLE saved_searches
  ALTER COLUMN team_id DROP NOT NULL;

-- 2) Replace policy so users see own saved searches (even when team_id is null) or team's
DROP POLICY IF EXISTS "Users can view team saved searches" ON saved_searches;
DROP POLICY IF EXISTS "Users can view own and team saved searches" ON saved_searches;
CREATE POLICY "Users can view own and team saved searches" ON saved_searches
  FOR SELECT USING (
    auth.uid() = user_id
    OR team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid() AND team_id IS NOT NULL)
  );

-- 3) Backfill: last 3 scraping_jobs per user without saved_search_id → create saved_search and link
DO $$
DECLARE
  r RECORD;
  new_id UUID;
  job_name VARCHAR(255);
BEGIN
  FOR r IN
    SELECT j.id AS job_id, j.user_id, j.team_id, j.search_query, j.started_at, j.created_at, j.actor_id, j.search_filters
    FROM scraping_jobs j
    INNER JOIN (
      SELECT id, user_id,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY started_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC) AS rn
      FROM scraping_jobs
      WHERE saved_search_id IS NULL
    ) ranked ON j.id = ranked.id AND ranked.rn <= 3
  LOOP
    job_name := LEFT(
      r.search_query || ' – ' || COALESCE(to_char(r.started_at, 'DD Mon YYYY, HH24:MI'), to_char(r.created_at, 'DD Mon YYYY')),
      255
    );
    INSERT INTO saved_searches (user_id, team_id, name, actor_id, input, autorun)
    VALUES (
      r.user_id,
      r.team_id,
      job_name,
      r.actor_id,
      COALESCE(r.search_filters, '{}'::jsonb),
      false
    )
    RETURNING id INTO new_id;
    UPDATE scraping_jobs SET saved_search_id = new_id WHERE id = r.job_id;
  END LOOP;
END $$;
