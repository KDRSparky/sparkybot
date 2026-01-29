-- SparkyBot Database Schema
-- Supabase PostgreSQL with Row Level Security

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- CONVERSATIONS & MEMORY
-- ===========================================

-- Conversation history (30-day retention)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_chat_id BIGINT NOT NULL,
    message_text TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('user', 'assistant')),
    skill_used TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_conversations_chat_id ON conversations(telegram_chat_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

-- User preferences
CREATE TABLE preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    learned_from TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category, key)
);

CREATE INDEX idx_preferences_category ON preferences(category);

-- Personal details accumulated over time
CREATE TABLE personal_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    detail_type TEXT NOT NULL,
    detail_key TEXT NOT NULL,
    detail_value JSONB NOT NULL,
    source TEXT,
    confidence DECIMAL(3,2) DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(detail_type, detail_key)
);

-- ===========================================
-- VIP CONTACTS
-- ===========================================

CREATE TABLE vip_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    twitter_handle TEXT,
    facebook_id TEXT,
    priority INTEGER DEFAULT 1,
    notes TEXT,
    suggested_by_bot BOOLEAN DEFAULT FALSE,
    confirmed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vip_contacts_email ON vip_contacts(email);

-- ===========================================
-- SKILLS & AUTONOMY
-- ===========================================

CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    trigger_patterns TEXT[] DEFAULT '{}',
    required_inputs TEXT[] DEFAULT '{}',
    outputs TEXT[] DEFAULT '{}',
    dependencies TEXT[] DEFAULT '{}',
    autonomy_level TEXT NOT NULL CHECK (autonomy_level IN ('full', 'approval_required')),
    enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE autonomy_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_id TEXT REFERENCES skills(id),
    action_type TEXT NOT NULL,
    action_details JSONB NOT NULL,
    user_approved BOOLEAN,
    outcome TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_autonomy_log_skill ON autonomy_log(skill_id);
CREATE INDEX idx_autonomy_log_created ON autonomy_log(created_at);

-- ===========================================
-- KANBAN / PROJECT MANAGEMENT
-- ===========================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    github_repo TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kanban_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
    priority INTEGER DEFAULT 3,
    due_date TIMESTAMPTZ,
    github_issue_id INTEGER,
    github_issue_url TEXT,
    is_anomaly BOOLEAN DEFAULT FALSE,
    anomaly_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kanban_project ON kanban_cards(project_id);
CREATE INDEX idx_kanban_status ON kanban_cards(status);
CREATE INDEX idx_kanban_anomaly ON kanban_cards(is_anomaly) WHERE is_anomaly = TRUE;

-- ===========================================
-- MARKET / PORTFOLIO
-- ===========================================

CREATE TABLE portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_date DATE NOT NULL,
    holdings JSONB NOT NULL,
    total_value DECIMAL(15,2),
    daily_change DECIMAL(15,2),
    daily_change_pct DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portfolio_date ON portfolio_snapshots(snapshot_date);

CREATE TABLE market_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type TEXT NOT NULL CHECK (report_type IN ('morning', 'midday', 'afternoon', 'overnight')),
    report_date DATE NOT NULL,
    content JSONB NOT NULL,
    delivered_via TEXT,
    drive_file_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_market_reports_date ON market_reports(report_date);

-- ===========================================
-- APPROVAL QUEUE
-- ===========================================

CREATE TABLE approval_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_id TEXT REFERENCES skills(id),
    action_type TEXT NOT NULL,
    action_details JSONB NOT NULL,
    telegram_message_id BIGINT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'modified', 'expired')),
    user_response JSONB,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_approval_status ON approval_queue(status);
CREATE INDEX idx_approval_created ON approval_queue(created_at);

-- ===========================================
-- SCHEDULED TASKS
-- ===========================================

CREATE TABLE scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type TEXT NOT NULL,
    schedule_cron TEXT NOT NULL,
    next_run TIMESTAMPTZ NOT NULL,
    last_run TIMESTAMPTZ,
    last_status TEXT,
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_next_run ON scheduled_tasks(next_run) WHERE enabled = TRUE;

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomy_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access" ON conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON preferences FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON personal_details FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON vip_contacts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON skills FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON autonomy_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON projects FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON kanban_cards FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON portfolio_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON market_reports FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON approval_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON scheduled_tasks FOR ALL USING (auth.role() = 'service_role');

-- ===========================================
-- CLEANUP FUNCTION (30-day conversation retention)
-- ===========================================

CREATE OR REPLACE FUNCTION cleanup_old_conversations()
RETURNS void AS $$
BEGIN
    DELETE FROM conversations
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- SEED DATA
-- ===========================================

INSERT INTO skills (id, name, description, trigger_patterns, autonomy_level, enabled) VALUES
('calendar', 'Calendar Management', 'Manages Google Calendar', ARRAY['schedule', 'meeting', 'calendar'], 'approval_required', true),
('email', 'Email Management', 'Manages Gmail', ARRAY['email', 'inbox', 'mail'], 'approval_required', true),
('market', 'Market Intelligence', 'Stock and crypto analysis', ARRAY['stock', 'market', 'portfolio'], 'full', true),
('code-exec', 'Code Execution', 'Claude Code CLI tasks', ARRAY['code', 'program', 'deploy'], 'approval_required', true),
('social', 'Social Media', 'X and Facebook management', ARRAY['tweet', 'post', 'twitter'], 'approval_required', true),
('kanban', 'Project Management', 'Kanban board', ARRAY['task', 'todo', 'project'], 'full', true),
('reminders', 'Reminders', 'Calendar-linked reminders', ARRAY['remind', 'reminder'], 'full', true),
('general', 'Executive Assistant', 'General queries', ARRAY[]::TEXT[], 'full', true);

INSERT INTO projects (name, description, status) VALUES
('Personal', 'Personal tasks', 'active'),
('LifeWave', 'LifeWave Testimony Locator', 'active'),
('Vumira', 'Vumira AI avatar platform', 'active');

INSERT INTO scheduled_tasks (task_type, schedule_cron, next_run, config) VALUES
('market_report', '0 8 * * *', NOW() + INTERVAL '1 day', '{"report_type": "morning"}'),
('market_report', '0 12 * * *', NOW() + INTERVAL '1 day', '{"report_type": "midday"}'),
('market_report', '15 15 * * *', NOW() + INTERVAL '1 day', '{"report_type": "afternoon"}'),
('overnight_analysis', '0 5 * * *', NOW() + INTERVAL '1 day', '{"output": "google_drive"}'),
('cleanup_conversations', '0 3 * * *', NOW() + INTERVAL '1 day', '{}');
