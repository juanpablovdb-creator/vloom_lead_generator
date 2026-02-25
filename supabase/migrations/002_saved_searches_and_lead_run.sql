-- =====================================================
-- Leadflow Vloom - 002: CRM pipeline statuses + Saved searches + link leads to scraping runs
-- =====================================================
-- (Unificado: una sola migración 002 para evitar duplicate key en schema_migrations)

-- =====================================================
-- PARTE 1: CRM pipeline statuses (leads.status)
-- =====================================================
UPDATE leads SET status = 'backlog'    WHERE status IN ('new', 'enriching', 'enriched', 'queued');
UPDATE leads SET status = 'invite_sent' WHERE status = 'contacted';
UPDATE leads SET status = 'reply'       WHERE status = 'replied';
UPDATE leads SET status = 'closed'      WHERE status = 'converted';
UPDATE leads SET status = 'lost'        WHERE status IN ('rejected', 'archived');

DO $$
DECLARE
  conname_var text;
BEGIN
  SELECT c.conname INTO conname_var
  FROM pg_constraint c
  WHERE c.conrelid = 'public.leads'::regclass AND c.contype = 'c'
  LIMIT 1;
  IF conname_var IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', conname_var);
  END IF;
END $$;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (
  'backlog', 'not_contacted', 'invite_sent', 'connected', 'reply',
  'positive_reply', 'negotiation', 'closed', 'lost'
));
ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'backlog';

-- =====================================================
-- PARTE 2: Saved searches + link leads to scraping runs
-- =====================================================

-- TABLA: saved_searches (IF NOT EXISTS para re-ejecución idempotente)
CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_team_id ON saved_searches(team_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view team saved searches" ON saved_searches;
CREATE POLICY "Users can view team saved searches" ON saved_searches
    FOR SELECT USING (
        team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can insert own saved searches" ON saved_searches;
CREATE POLICY "Users can insert own saved searches" ON saved_searches
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own saved searches" ON saved_searches;
CREATE POLICY "Users can update own saved searches" ON saved_searches
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own saved searches" ON saved_searches;
CREATE POLICY "Users can delete own saved searches" ON saved_searches
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- scraping_jobs: add saved_search_id
-- =====================================================
ALTER TABLE scraping_jobs
    ADD COLUMN IF NOT EXISTS saved_search_id UUID REFERENCES saved_searches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scraping_jobs_saved_search_id ON scraping_jobs(saved_search_id);

-- =====================================================
-- leads: add scraping_job_id and job_external_id
-- =====================================================
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS scraping_job_id UUID REFERENCES scraping_jobs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS job_external_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_leads_scraping_job_id ON leads(scraping_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_job_external_id ON leads(team_id, job_external_id) WHERE job_external_id IS NOT NULL;
