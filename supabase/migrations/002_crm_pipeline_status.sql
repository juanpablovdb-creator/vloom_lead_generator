-- =====================================================
-- Vloom Lead Generator - CRM pipeline statuses
-- Ejecutar en Supabase > SQL Editor (copiar y pegar todo)
-- =====================================================

-- 1) Migrar datos existentes al nuevo pipeline
UPDATE leads SET status = 'backlog'    WHERE status IN ('new', 'enriching', 'enriched', 'queued');
UPDATE leads SET status = 'invite_sent' WHERE status = 'contacted';
UPDATE leads SET status = 'reply'       WHERE status = 'replied';
UPDATE leads SET status = 'closed'      WHERE status = 'converted';
UPDATE leads SET status = 'lost'        WHERE status IN ('rejected', 'archived');

-- 2) Quitar la restricción vieja (sin importar su nombre) y poner la nueva
DO $$
DECLARE
  conname_var text;
BEGIN
  SELECT c.conname INTO conname_var
  FROM pg_constraint c
  WHERE c.conrelid = 'public.leads'::regclass AND c.contype = 'c'
  LIMIT 1;
  IF conname_var IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', conname_var);
  END IF;
END $$;

ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (
  'backlog',
  'not_contacted',
  'invite_sent',
  'connected',
  'reply',
  'positive_reply',
  'negotiation',
  'closed',
  'lost'
));

-- 3) Valor por defecto para filas nuevas
ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'backlog';
