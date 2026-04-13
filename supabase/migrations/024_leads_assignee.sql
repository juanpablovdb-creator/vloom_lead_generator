-- =====================================================
-- Leadflow Vloom - leads.assignee
-- =====================================================

alter table public.leads
add column if not exists assignee text null;

create index if not exists leads_assignee_idx on public.leads (assignee);

