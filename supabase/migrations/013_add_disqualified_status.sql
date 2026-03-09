-- Leadflow Vloom - Allow 'disqualified' in leads.status (CRM column was added but DB constraint was missing)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (
  'backlog', 'not_contacted', 'invite_sent', 'connected', 'reply',
  'positive_reply', 'negotiation', 'closed', 'lost', 'disqualified'
));
