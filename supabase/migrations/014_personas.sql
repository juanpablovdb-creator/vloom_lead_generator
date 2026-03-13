-- =====================================================
-- Leadflow Vloom - Personas (target profiles for people enrichment)
-- =====================================================
-- User-defined personas drive harvestapi/linkedin-company-employees inputs.
-- Company URL is taken from each lead record at enrichment time, not stored here.

CREATE TABLE IF NOT EXISTS personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    persona_function VARCHAR(255),       -- e.g. HR, Engineering -> maps to searchQuery/jobTitles
    seniority VARCHAR(255),              -- e.g. Director, Manager, VP
    job_title_keywords TEXT[] DEFAULT '{}', -- strict job title filter for actor
    locations TEXT[] DEFAULT '{}',         -- optional location filter
    max_items INTEGER,                   -- optional max profiles per run (actor maxItems)
    profile_scraper_mode VARCHAR(50),    -- Short, Full, Full + email search
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);
CREATE INDEX IF NOT EXISTS idx_personas_is_active ON personas(user_id, is_active) WHERE is_active = true;

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own personas" ON personas;
CREATE POLICY "Users can view own personas" ON personas
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own personas" ON personas;
CREATE POLICY "Users can insert own personas" ON personas
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own personas" ON personas;
CREATE POLICY "Users can update own personas" ON personas
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own personas" ON personas;
CREATE POLICY "Users can delete own personas" ON personas
    FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE personas IS 'Target profiles for people enrichment; inputs for harvestapi/linkedin-company-employees. Company URL comes from each lead record.';
