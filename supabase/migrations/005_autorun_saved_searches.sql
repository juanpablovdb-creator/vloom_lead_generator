-- =====================================================
-- Leadflow Vloom - Autorun for saved searches
-- =====================================================
-- When true, the search can be re-run automatically (e.g. daily) to fetch only new results.
-- Actual scheduling (cron / Edge Function) is implemented separately.

ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS autorun BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN saved_searches.autorun IS 'When true, this search is eligible for automatic re-runs (e.g. daily).';
