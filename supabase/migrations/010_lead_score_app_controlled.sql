-- Lead score is now computed in app (Edge Functions) using Clay-style formula.
-- Drop trigger so INSERT/UPDATE can set score explicitly.
DROP TRIGGER IF EXISTS trigger_update_lead_score ON leads;
