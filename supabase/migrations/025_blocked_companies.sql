-- =====================================================
-- Leadflow Vloom - 025: Blocked companies (per-user)
-- =====================================================

CREATE TABLE IF NOT EXISTS blocked_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- User-facing value (as entered)
  company_name TEXT NOT NULL,
  -- Normalized for matching
  company_name_normalized TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_companies_user_id ON blocked_companies(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_companies_user_norm
  ON blocked_companies(user_id, company_name_normalized);

ALTER TABLE blocked_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own blocked companies" ON blocked_companies;
CREATE POLICY "Users can view own blocked companies"
  ON blocked_companies FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own blocked companies" ON blocked_companies;
CREATE POLICY "Users can insert own blocked companies"
  ON blocked_companies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own blocked companies" ON blocked_companies;
CREATE POLICY "Users can delete own blocked companies"
  ON blocked_companies FOR DELETE
  USING (auth.uid() = user_id);

