-- =====================================================
-- LEADFLOW - Saved searches + link leads to scraping runs
-- =====================================================
-- New Search = form with all inputs (job titles, locations, etc.)
-- Saved search = stored name + input; user only clicks "Run" to re-run

-- =====================================================
-- TABLA: saved_searches
-- =====================================================
CREATE TABLE saved_searches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_saved_searches_team_id ON saved_searches(team_id);
CREATE INDEX idx_saved_searches_user_id ON saved_searches(user_id);

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

-- Team members can view saved searches of their team
CREATE POLICY "Users can view team saved searches" ON saved_searches
    FOR SELECT USING (
        team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can insert own saved searches" ON saved_searches
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved searches" ON saved_searches
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved searches" ON saved_searches
    FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- scraping_jobs: add saved_search_id
-- =====================================================
ALTER TABLE scraping_jobs
    ADD COLUMN saved_search_id UUID REFERENCES saved_searches(id) ON DELETE SET NULL;

CREATE INDEX idx_scraping_jobs_saved_search_id ON scraping_jobs(saved_search_id);

-- =====================================================
-- leads: add scraping_job_id and job_external_id
-- =====================================================
ALTER TABLE leads
    ADD COLUMN scraping_job_id UUID REFERENCES scraping_jobs(id) ON DELETE SET NULL,
    ADD COLUMN job_external_id VARCHAR(255);

CREATE INDEX idx_leads_scraping_job_id ON leads(scraping_job_id);
CREATE INDEX idx_leads_job_external_id ON leads(team_id, job_external_id) WHERE job_external_id IS NOT NULL;
