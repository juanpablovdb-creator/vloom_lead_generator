-- =====================================================
-- Budget + links on leads, nurturing stage, tasks reset
-- =====================================================

-- 1) Lead fields
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS budget NUMERIC(14, 2) DEFAULT NULL;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS links TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN leads.budget IS 'Deal/budget amount for pipeline weight (Positive reply / Negotiation).';
COMMENT ON COLUMN leads.links IS 'User-editable list of related URLs (decks, samples, docs, etc.).';

-- 2) Nurturing CRM stage
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (
  'backlog',
  'not_contacted',
  'invite_sent',
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'nurturing',
  'closed',
  'lost',
  'disqualified'
));

-- 3) Tasks overhaul: wipe old auto-generated tasks, new statuses + type/due
DELETE FROM tasks;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Drop status CHECK (name from CREATE TABLE may be tasks_status_check)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'tasks'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE tasks
  ALTER COLUMN status SET DEFAULT 'backlog';

ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check CHECK (status IN ('backlog', 'in_progress', 'done'));

COMMENT ON COLUMN tasks.task_type IS 'Preset key e.g. follow_up, send_quote, send_sample.';
COMMENT ON COLUMN tasks.due_at IS 'Optional due date (used for nurturing monthly follow-ups).';
