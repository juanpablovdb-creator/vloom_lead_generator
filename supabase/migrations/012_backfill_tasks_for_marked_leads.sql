-- =====================================================
-- Leadflow Vloom - Backfill tasks for existing marked leads
-- =====================================================
-- Creates one task per lead that already has is_marked_as_lead = true
-- and has no task yet (so those leads appear in Tasks).

INSERT INTO tasks (user_id, lead_id, title, status)
SELECT
  l.user_id,
  l.id,
  'Contactar a ' || COALESCE(
    CASE
      WHEN TRIM(COALESCE(l.company_name, '')) <> '' AND TRIM(COALESCE(l.contact_name, '')) <> ''
        THEN TRIM(l.company_name) || ' – ' || TRIM(l.contact_name)
      WHEN TRIM(COALESCE(l.company_name, '')) <> '' THEN TRIM(l.company_name)
      WHEN TRIM(COALESCE(l.contact_name, '')) <> '' THEN TRIM(l.contact_name)
      ELSE 'lead'
    END,
    'lead'
  ),
  'pending'
FROM leads l
WHERE l.is_marked_as_lead = true
  AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id = l.id);
