-- KAI Coin - Database Schema
-- PostgreSQL schema for the KAI ecosystem

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    region VARCHAR(100) NOT NULL,
    country_code VARCHAR(3) NOT NULL,
    user_type VARCHAR(50) DEFAULT 'individual',
    kyc_status VARCHAR(20) DEFAULT 'pending',
    reputation_score INTEGER DEFAULT 0,
    total_kai_earned NUMERIC(30, 18) DEFAULT 0,
    total_kai_spent NUMERIC(30, 18) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_region ON users(region);

-- Disaster Alerts Table (Pillar 6)
CREATE TABLE IF NOT EXISTS disaster_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_hash VARCHAR(66) UNIQUE NOT NULL,
    disaster_type VARCHAR(50) NOT NULL,
    region VARCHAR(200) NOT NULL,
    risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    severity VARCHAR(20) DEFAULT 'moderate',
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    source VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_region ON disaster_alerts(region);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON disaster_alerts(disaster_type);
CREATE INDEX IF NOT EXISTS idx_alerts_risk ON disaster_alerts(risk_score DESC);

-- Climate Models Table (Pillar 7)
CREATE TABLE IF NOT EXISTS climate_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_hash VARCHAR(66) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    risk_type VARCHAR(50) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    accuracy_score NUMERIC(5, 2),
    provider VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Climate Risk Scores Table
CREATE TABLE IF NOT EXISTS climate_risk_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID REFERENCES climate_models(id),
    region VARCHAR(200) NOT NULL,
    country_code VARCHAR(3),
    risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    confidence NUMERIC(5, 2),
    projection_year INTEGER,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_sources JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_risk_region ON climate_risk_scores(region);

-- Seed initial climate models
INSERT INTO climate_models (model_hash, name, description, risk_type, accuracy_score, provider) VALUES
    ('0x0001', 'Flood Risk Model v1', 'AI-powered flood prediction', 'flood', 87.50, 'KAI Foundation'),
    ('0x0002', 'Drought Risk Model v1', 'Drought prediction model', 'drought', 82.30, 'KAI Foundation'),
    ('0x0003', 'Cyclone Risk Model v1', 'Cyclone tracking model', 'cyclone', 91.20, 'KAI Foundation')
ON CONFLICT DO NOTHING;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kai_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kai_admin;
