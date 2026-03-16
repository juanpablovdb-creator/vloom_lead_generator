-- =====================================================
-- Leadflow Vloom - Backfill lead_status_history (all funnel stages)
-- =====================================================
-- Leads that are already in Invite Sent or beyond but are missing rows for
-- connected, reply, positive_reply, negotiation, closed, lost, disqualified
-- get those rows so KPIs count them correctly (e.g. "Connected" shows everyone
-- who has ever been in that stage). changed_at = lead.updated_at (or created_at).
-- RLS is off for this session so the migration can insert for all users' leads.
-- Run after 016 (invite_sent backfill) so invite_sent row exists first.

SET LOCAL row_security = off;

-- Stage order: invite_sent -> connected -> reply -> positive_reply -> negotiation -> closed | lost | disqualified

-- invite_sent (re-run in case 016 wasn't applied or new leads appeared)
INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'not_contacted',
  'invite_sent',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.is_marked_as_lead = true
  AND l.status IN (
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

-- connected
INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'invite_sent',
  'connected',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.is_marked_as_lead = true
  AND l.status IN (
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
      AND h.to_status = 'connected'
  );

-- reply
INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'connected',
  'reply',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.is_marked_as_lead = true
  AND l.status IN (
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
      AND h.to_status = 'reply'
  );

-- positive_reply
INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'reply',
  'positive_reply',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.is_marked_as_lead = true
  AND l.status IN (
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
      AND h.to_status = 'positive_reply'
  );

-- negotiation
INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'positive_reply',
  'negotiation',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.is_marked_as_lead = true
  AND l.status IN (
    'negotiation',
    'closed',
    'lost',
    'disqualified'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM lead_status_history h
    WHERE h.lead_id = l.id
      AND h.to_status = 'negotiation'
  );

-- closed
INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'negotiation',
  'closed',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.is_marked_as_lead = true
  AND l.status = 'closed'
  AND NOT EXISTS (
    SELECT 1
    FROM lead_status_history h
    WHERE h.lead_id = l.id
      AND h.to_status = 'closed'
  );

-- lost
INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'negotiation',
  'lost',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.is_marked_as_lead = true
  AND l.status = 'lost'
  AND NOT EXISTS (
    SELECT 1
    FROM lead_status_history h
    WHERE h.lead_id = l.id
      AND h.to_status = 'lost'
  );

-- disqualified
INSERT INTO lead_status_history (lead_id, from_status, to_status, changed_at)
SELECT
  l.id,
  'invite_sent',
  'disqualified',
  COALESCE(l.updated_at, l.created_at)
FROM leads l
WHERE l.is_marked_as_lead = true
  AND l.status = 'disqualified'
  AND NOT EXISTS (
    SELECT 1
    FROM lead_status_history h
    WHERE h.lead_id = l.id
      AND h.to_status = 'disqualified'
  );
