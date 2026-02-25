-- =====================================================
-- Leadflow Vloom - Leads = solo lo que el usuario marque como lead
-- =====================================================
-- Resultados de búsqueda se guardan sin marcar; el usuario hace check
-- para "marcar como lead". Lista Leads y CRM muestran solo is_marked_as_lead = true.
-- Idempotent: safe to re-run (IF NOT EXISTS / IF NOT EXISTS).

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS is_marked_as_lead BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_is_marked_as_lead ON leads(is_marked_as_lead) WHERE is_marked_as_lead = true;

COMMENT ON COLUMN leads.is_marked_as_lead IS 'True only when user explicitly marks this company/person as a lead; CRM and Leads list filter by this.';
