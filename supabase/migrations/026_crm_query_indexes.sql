-- =====================================================
-- Leadflow Vloom - Indexes to speed up CRM / KPI queries
-- =====================================================
-- Statement timeouts on CRM were common when scanning marked leads
-- without covering indexes (esp. marked + status + first_contacted_at).

CREATE INDEX IF NOT EXISTS idx_leads_user_marked_status
  ON leads (user_id, status)
  WHERE is_marked_as_lead = true;

CREATE INDEX IF NOT EXISTS idx_leads_user_marked_updated
  ON leads (user_id, updated_at DESC)
  WHERE is_marked_as_lead = true;

CREATE INDEX IF NOT EXISTS idx_leads_user_first_contacted
  ON leads (user_id, first_contacted_at)
  WHERE is_marked_as_lead = true AND first_contacted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_status_history_to_status_changed
  ON lead_status_history (to_status, changed_at);
