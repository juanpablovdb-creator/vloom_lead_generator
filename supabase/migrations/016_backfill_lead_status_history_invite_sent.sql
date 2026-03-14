-- =====================================================
-- Leadflow Vloom - Backfill lead_status_history (invite_sent)
-- =====================================================
-- Leads that are already in Invite Sent or beyond but have no row in
-- lead_status_history (e.g. moved before the trigger existed) get one row
-- so KPIs count them. changed_at = lead.updated_at (or created_at).
-- RLS is off for this session so the migration can insert for all users' leads.

SET LOCAL row_security = off;

INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'not_contacted',
  'invite_sent',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.status IN (
  'invite_sent',
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'closed',
  'lost',
  'disqualified'
)
AND NOT EXISTS (
  SELECT 1
  FROM lead_status_history h
  WHERE h.lead_id = l.id
    AND h.to_status = 'invite_sent'
);
