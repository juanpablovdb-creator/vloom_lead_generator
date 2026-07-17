-- =====================================================
-- Leadflow Vloom - Backfill first_contacted_at from history
-- =====================================================
-- Leads in the funnel often have status invite_sent+ but NULL first_contacted_at
-- (moved before the column existed). KPIs, CRM cards and date filter need this field.

SET LOCAL row_security = off;

UPDATE leads l
SET first_contacted_at = sub.first_at
FROM (
  SELECT lead_id, MIN(changed_at) AS first_at
  FROM lead_status_history
  WHERE to_status = 'invite_sent'
  GROUP BY lead_id
) sub
WHERE l.id = sub.lead_id
  AND l.first_contacted_at IS NULL;

UPDATE leads
SET first_contacted_at = COALESCE(updated_at, created_at)
WHERE first_contacted_at IS NULL
  AND is_marked_as_lead = true
  AND status IN (
    'invite_sent',
    'connected',
    'reply',
    'positive_reply',
    'negotiation',
    'closed',
    'lost'
  );

-- Auto-set first_contacted_at when a lead is moved to invite_sent
CREATE OR REPLACE FUNCTION set_first_contacted_at_on_invite_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'invite_sent'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.first_contacted_at IS NULL THEN
    NEW.first_contacted_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_set_first_contacted_at ON leads;
CREATE TRIGGER trg_leads_set_first_contacted_at
  BEFORE UPDATE OF status ON leads
  FOR EACH ROW
  EXECUTE FUNCTION set_first_contacted_at_on_invite_sent();
