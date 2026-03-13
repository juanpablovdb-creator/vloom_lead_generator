-- =====================================================
-- Leadflow Vloom - Channel field for leads (source/origin of lead)
-- =====================================================
-- Allows tracking where each lead came from (LinkedIn, Website, Referral, etc.)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS channel VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_leads_channel ON leads(channel) WHERE channel IS NOT NULL;

COMMENT ON COLUMN leads.channel IS 'Source/channel where this lead was received (e.g. LinkedIn, Website, Referral).';
