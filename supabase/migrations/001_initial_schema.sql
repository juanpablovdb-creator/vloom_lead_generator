-- =====================================================
-- LEADFLOW - Schema de Base de Datos para Supabase
-- =====================================================
-- Este schema va 100% en Supabase, nada en Lovable Cloud

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLA: teams (equipos de trabajo)
-- =====================================================
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: profiles (perfiles de usuario extendidos)
-- =====================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: leads (tabla principal de prospectos)
-- =====================================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Ownership
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    is_shared BOOLEAN DEFAULT FALSE, -- Si es visible para todo el equipo
    
    -- Job Post Info (raw data from Apify)
    job_title VARCHAR(500),
    job_description TEXT,
    job_url TEXT,
    job_source VARCHAR(100), -- linkedin, indeed, glassdoor, etc
    job_location VARCHAR(255),
    job_salary_range VARCHAR(100),
    job_posted_at TIMESTAMP WITH TIME ZONE,
    
    -- Company Info (enriched)
    company_name VARCHAR(255),
    company_url TEXT,
    company_linkedin_url TEXT,
    company_size VARCHAR(50), -- 1-10, 11-50, 51-200, etc
    company_industry VARCHAR(255),
    company_description TEXT,
    company_funding VARCHAR(100),
    company_location VARCHAR(255),
    
    -- Contact Info (enriched)
    contact_name VARCHAR(255),
    contact_title VARCHAR(255),
    contact_email VARCHAR(255),
    contact_linkedin_url TEXT,
    contact_phone VARCHAR(50),
    
    -- Status & Workflow
    status VARCHAR(50) DEFAULT 'new' CHECK (status IN (
        'new',           -- Recién scrapeado
        'enriching',     -- En proceso de enriquecimiento
        'enriched',      -- Data completa
        'queued',        -- En cola para contactar
        'contacted',     -- Email enviado
        'replied',       -- Respondió
        'converted',     -- Se convirtió en cliente
        'rejected',      -- No interesado
        'archived'       -- Archivado
    )),
    
    -- Scoring (calculado dinámicamente)
    score DECIMAL(5,2) DEFAULT 0,
    score_weights JSONB DEFAULT '{
        "has_email": 25,
        "has_linkedin": 15,
        "company_size_match": 20,
        "industry_match": 20,
        "recent_posting": 20
    }'::jsonb,
    
    -- Enrichment metadata
    enrichment_data JSONB DEFAULT '{}'::jsonb, -- Raw data from enrichment APIs
    last_enriched_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes & Tags
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: scoring_presets (configuraciones de scoring)
-- =====================================================
CREATE TABLE scoring_presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    weights JSONB NOT NULL DEFAULT '{
        "has_email": 25,
        "has_linkedin": 15,
        "company_size_match": 20,
        "industry_match": 20,
        "recent_posting": 20
    }'::jsonb,
    target_company_sizes TEXT[] DEFAULT '{}', -- ['11-50', '51-200']
    target_industries TEXT[] DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: email_templates (plantillas de email)
-- =====================================================
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    is_shared BOOLEAN DEFAULT FALSE,
    
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body_template TEXT NOT NULL, -- Soporta variables como {{contact_name}}, {{company_name}}
    
    -- AI generation settings
    ai_prompt TEXT, -- Prompt base para que la IA genere variaciones
    tone VARCHAR(50) DEFAULT 'professional', -- professional, casual, friendly
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: emails_sent (historial de emails enviados)
-- =====================================================
CREATE TABLE emails_sent (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    
    -- Email content (final, después de AI)
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    
    -- SendGrid tracking
    sendgrid_message_id VARCHAR(255),
    
    -- Status
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN (
        'draft',        -- Borrador generado por AI
        'queued',       -- En cola para enviar
        'sent',         -- Enviado exitosamente
        'delivered',    -- Confirmado entregado
        'opened',       -- Abierto (tracking)
        'clicked',      -- Click en link (tracking)
        'bounced',      -- Rebotado
        'failed'        -- Error al enviar
    )),
    
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: scraping_jobs (jobs de Apify)
-- =====================================================
CREATE TABLE scraping_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    
    -- Apify Actor info
    actor_id VARCHAR(255) NOT NULL, -- ej: "apify/linkedin-jobs-scraper"
    run_id VARCHAR(255), -- ID del run en Apify
    
    -- Search parameters
    search_query VARCHAR(500) NOT NULL, -- ej: "Video Editor"
    search_location VARCHAR(255),
    search_filters JSONB DEFAULT '{}'::jsonb,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Esperando iniciar
        'running',      -- Ejecutándose en Apify
        'completed',    -- Terminado exitosamente
        'failed',       -- Error
        'cancelled'     -- Cancelado
    )),
    
    -- Results
    leads_found INTEGER DEFAULT 0,
    leads_imported INTEGER DEFAULT 0,
    error_message TEXT,
    
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: api_keys (keys de servicios externos)
-- =====================================================
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    
    service VARCHAR(50) NOT NULL CHECK (service IN (
        'apify',
        'sendgrid',
        'anthropic',
        'hunter',      -- Para email finding
        'clearbit'     -- Para company enrichment
    )),
    
    -- Encrypted key (usar pgcrypto en producción)
    api_key_encrypted TEXT NOT NULL,
    
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(team_id, service)
);

-- =====================================================
-- INDEXES para performance
-- =====================================================
CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_team_id ON leads(team_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_score ON leads(score DESC);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_company_name ON leads(company_name);
CREATE INDEX idx_leads_is_shared ON leads(is_shared) WHERE is_shared = TRUE;

CREATE INDEX idx_emails_sent_lead_id ON emails_sent(lead_id);
CREATE INDEX idx_emails_sent_user_id ON emails_sent(user_id);
CREATE INDEX idx_emails_sent_status ON emails_sent(status);

CREATE INDEX idx_scraping_jobs_user_id ON scraping_jobs(user_id);
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Profiles: usuarios ven su propio perfil y los de su equipo
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view team members" ON profiles
    FOR SELECT USING (
        team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid())
    );

-- Leads: usuarios ven sus leads y los compartidos del equipo
CREATE POLICY "Users can view own leads" ON leads
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared team leads" ON leads
    FOR SELECT USING (
        is_shared = TRUE AND 
        team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can insert own leads" ON leads
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own leads" ON leads
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own leads" ON leads
    FOR DELETE USING (auth.uid() = user_id);

-- Email Templates: propios y compartidos del equipo
CREATE POLICY "Users can manage own templates" ON email_templates
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared team templates" ON email_templates
    FOR SELECT USING (
        is_shared = TRUE AND 
        team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid())
    );

-- Emails Sent: solo el usuario que envió
CREATE POLICY "Users can manage own sent emails" ON emails_sent
    FOR ALL USING (auth.uid() = user_id);

-- Scraping Jobs: propios
CREATE POLICY "Users can manage own scraping jobs" ON scraping_jobs
    FOR ALL USING (auth.uid() = user_id);

-- API Keys: solo admins del equipo
CREATE POLICY "Team admins can manage api keys" ON api_keys
    FOR ALL USING (
        team_id IN (
            SELECT team_id FROM profiles 
            WHERE id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Función para calcular score de un lead
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_row leads)
RETURNS DECIMAL AS $$
DECLARE
    score DECIMAL := 0;
    weights JSONB := lead_row.score_weights;
BEGIN
    -- Has email (+25 default)
    IF lead_row.contact_email IS NOT NULL AND lead_row.contact_email != '' THEN
        score := score + COALESCE((weights->>'has_email')::DECIMAL, 25);
    END IF;
    
    -- Has LinkedIn (+15 default)
    IF lead_row.contact_linkedin_url IS NOT NULL AND lead_row.contact_linkedin_url != '' THEN
        score := score + COALESCE((weights->>'has_linkedin')::DECIMAL, 15);
    END IF;
    
    -- Recent posting (+20 if < 7 days)
    IF lead_row.job_posted_at IS NOT NULL AND 
       lead_row.job_posted_at > NOW() - INTERVAL '7 days' THEN
        score := score + COALESCE((weights->>'recent_posting')::DECIMAL, 20);
    END IF;
    
    -- Company size match (handled in app based on preset)
    -- Industry match (handled in app based on preset)
    
    RETURN LEAST(score, 100); -- Cap at 100
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-actualizar score
CREATE OR REPLACE FUNCTION update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.score := calculate_lead_score(NEW);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_lead_score
    BEFORE INSERT OR UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_lead_score();

-- Función para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- DATOS INICIALES
-- =====================================================

-- Template de email por defecto
INSERT INTO email_templates (id, user_id, team_id, name, subject, body_template, ai_prompt, is_shared)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000', -- Se actualizará con el primer usuario
    NULL,
    'Outreach Inicial - Video Editor',
    'Colaboración en edición de video para {{company_name}}',
    E'Hola {{contact_name}},\n\nVi que {{company_name}} está buscando un {{job_title}} y me pareció muy interesante la oportunidad.\n\n[PERSONALIZACIÓN_AI]\n\n¿Tendrías 15 minutos esta semana para una llamada rápida?\n\nSaludos,\n[TU_NOMBRE]',
    'Genera un párrafo personalizado mencionando algo específico sobre la empresa o el rol que demuestre investigación genuina. Mantén un tono profesional pero cercano.',
    FALSE
);
