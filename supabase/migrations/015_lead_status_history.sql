-- =====================================================
-- Leadflow Vloom - Lead status change history (for Activity)
-- =====================================================
-- Tracks every move from one CRM stage to another. Trigger fills this on leads.status update.

CREATE TABLE IF NOT EXISTS lead_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_id ON lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_changed_at ON lead_status_history(lead_id, changed_at DESC);

ALTER TABLE lead_status_history ENABLE ROW LEVEL SECURITY;

-- Users can see history for their own leads
DROP POLICY IF EXISTS "Users can view status history for own leads" ON lead_status_history;
CREATE POLICY "Users can view status history for own leads" ON lead_status_history
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_status_history.lead_id AND leads.user_id = auth.uid())
    );

-- Allow insert for trigger (and for same user's leads if called from client)
DROP POLICY IF EXISTS "Users can insert status history for own leads" ON lead_status_history;
CREATE POLICY "Users can insert status history for own leads" ON lead_status_history
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_status_history.lead_id AND leads.user_id = auth.uid())
    );

-- Trigger: record status change when leads.status is updated
CREATE OR REPLACE FUNCTION record_lead_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO lead_status_history (lead_id, from_status, to_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_status_history ON leads;
CREATE TRIGGER trg_leads_status_history
    AFTER UPDATE OF status ON leads
    FOR EACH ROW
    EXECUTE FUNCTION record_lead_status_change();

COMMENT ON TABLE lead_status_history IS 'History of CRM stage moves for Activity in lead card popup.';
