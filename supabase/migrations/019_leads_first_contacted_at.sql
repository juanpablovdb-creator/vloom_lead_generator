-- =====================================================
-- Leadflow Vloom - Manual first contact date for cohort
-- =====================================================
-- Allows setting the initial contact date so leads can be placed in past cohorts (KPIs).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN leads.first_contacted_at IS 'Manual or inferred date of first contact (invite sent); used for KPI cohort when set.';
