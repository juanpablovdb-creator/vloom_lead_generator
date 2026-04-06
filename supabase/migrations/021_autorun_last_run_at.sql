-- Track when a saved search was last run (manual or automatic) for Autorun scheduling.
ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS autorun_last_run_at TIMESTAMPTZ;

COMMENT ON COLUMN saved_searches.autorun_last_run_at IS
  'Last successful run timestamp; used to throttle automatic re-runs when autorun is enabled.';
