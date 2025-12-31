-- ============================================
-- KAI INTELLIGENCE DATABASE SCHEMA
-- ============================================
-- PostgreSQL 14+ required
-- Supports: Payments, Subscriptions, Alerts, Revenue Tracking

-- Drop existing tables (for clean setup)
DROP TABLE IF EXISTS alert_deliveries CASCADE;
DROP TABLE IF EXISTS subscription_history CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS revenue CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS climate_alerts CASCADE;
DROP TABLE IF EXISTS climate_models CASCADE;
DROP TABLE IF EXISTS disaster_alerts CASCADE;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS TABLE
-- ============================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) UNIQUE,
    phone VARCHAR(20),
    email VARCHAR(255),
    country_code VARCHAR(2) NOT NULL DEFAULT 'TZ', -- TZ, KE, NG, etc.
    region VARCHAR(100),
    user_type VARCHAR(20) DEFAULT 'farmer', -- farmer, enterprise, government, etc.
    language VARCHAR(5) DEFAULT 'sw', -- sw (Swahili), en (English)
    created_at TIMESTAMP DEFAULT NOW(),
    last_active_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    CONSTRAINT phone_or_email_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_country ON users(country_code);

-- ============================================
-- CUSTOMERS TABLE (Extended user info for payments)
-- ============================================

CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    customer_reference VARCHAR(100) UNIQUE NOT NULL, -- e.g., CUST-001
    phone VARCHAR(20),
    email VARCHAR(255),
    full_name VARCHAR(255),
    country_code VARCHAR(2) NOT NULL,
    preferred_currency VARCHAR(3) DEFAULT 'TZS', -- TZS, KES, NGN, USD
    preferred_payment_method VARCHAR(20) DEFAULT 'mpesa', -- mpesa, stripe, paystack
    total_spent_usd DECIMAL(12, 2) DEFAULT 0,
    total_spent_local DECIMAL(12, 2) DEFAULT 0,
    lifetime_value_usd DECIMAL(12, 2) DEFAULT 0,
    total_alerts_purchased INTEGER DEFAULT 0,
    has_active_subscription BOOLEAN DEFAULT false,
    risk_score INTEGER DEFAULT 0, -- 0-100, for fraud detection
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    last_purchase_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    UNIQUE(phone, country_code)
);

CREATE INDEX idx_customers_user ON customers(user_id);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_country ON customers(country_code);
CREATE INDEX idx_customers_ltv ON customers(lifetime_value_usd DESC);

-- ============================================
-- TRANSACTIONS TABLE (All payment transactions)
-- ============================================

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    transaction_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    customer_id INTEGER REFERENCES customers(id),

    -- Transaction details
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    usd_equivalent DECIMAL(12, 2) NOT NULL,

    -- Payment provider info
    provider VARCHAR(20) NOT NULL, -- mpesa_tanzania, mpesa_kenya, stripe, paystack
    provider_transaction_id VARCHAR(255),
    provider_reference VARCHAR(255),
    provider_response JSONB,

    -- Product info
    product_type VARCHAR(50) NOT NULL, -- alert, subscription, insurance, etc.
    product_id INTEGER,
    pillar INTEGER CHECK (pillar BETWEEN 1 AND 7),

    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, refunded
    initiated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    refunded_at TIMESTAMP,

    -- Customer info
    customer_phone VARCHAR(20),
    customer_email VARCHAR(255),
    customer_reference VARCHAR(100),

    -- Metadata
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',

    CONSTRAINT valid_amount CHECK (amount > 0),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded'))
);

CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_provider ON transactions(provider);
CREATE INDEX idx_transactions_date ON transactions(initiated_at DESC);
CREATE INDEX idx_transactions_completed ON transactions(completed_at DESC) WHERE status = 'completed';
CREATE INDEX idx_transactions_product ON transactions(product_type, product_id);

-- ============================================
-- REVENUE TABLE (Completed transactions for analytics)
-- ============================================

CREATE TABLE revenue (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,

    -- Revenue details
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    usd_equivalent DECIMAL(12, 2) NOT NULL,

    -- Classification
    provider VARCHAR(20) NOT NULL,
    product VARCHAR(100) NOT NULL,
    pillar INTEGER CHECK (pillar BETWEEN 1 AND 7),
    customer_id INTEGER REFERENCES customers(id),
    customer_reference VARCHAR(100),

    -- Timing
    revenue_date DATE NOT NULL,
    revenue_month VARCHAR(7) NOT NULL, -- YYYY-MM
    revenue_year INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),

    -- Flags
    is_recurring BOOLEAN DEFAULT false,
    is_refunded BOOLEAN DEFAULT false,
    refund_amount DECIMAL(12, 2) DEFAULT 0,

    -- Metadata
    reference VARCHAR(255),
    notes TEXT,
    metadata JSONB DEFAULT '{}',

    CONSTRAINT valid_revenue CHECK (amount > 0)
);

CREATE INDEX idx_revenue_date ON revenue(revenue_date DESC);
CREATE INDEX idx_revenue_month ON revenue(revenue_month);
CREATE INDEX idx_revenue_year ON revenue(revenue_year);
CREATE INDEX idx_revenue_pillar ON revenue(pillar);
CREATE INDEX idx_revenue_product ON revenue(product);
CREATE INDEX idx_revenue_customer ON revenue(customer_id);
CREATE INDEX idx_revenue_provider ON revenue(provider);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    subscription_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,

    -- Subscription details
    plan VARCHAR(50) NOT NULL, -- basic, premium, enterprise
    pillar INTEGER CHECK (pillar BETWEEN 1 AND 7),

    -- Pricing
    price DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    usd_equivalent DECIMAL(12, 2) NOT NULL,
    billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, quarterly, yearly

    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, paused, cancelled, expired

    -- Dates
    started_at TIMESTAMP DEFAULT NOW(),
    current_period_start TIMESTAMP DEFAULT NOW(),
    current_period_end TIMESTAMP,
    expires_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    paused_at TIMESTAMP,

    -- Usage tracking
    alerts_included INTEGER, -- NULL = unlimited
    alerts_used INTEGER DEFAULT 0,
    api_calls_included INTEGER,
    api_calls_used INTEGER DEFAULT 0,

    -- Auto-renewal
    auto_renew BOOLEAN DEFAULT true,
    last_payment_transaction_id INTEGER REFERENCES transactions(id),
    next_billing_date TIMESTAMP,
    failed_payment_attempts INTEGER DEFAULT 0,

    -- Metadata
    features JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    CONSTRAINT valid_plan CHECK (plan IN ('basic', 'premium', 'enterprise')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
    CONSTRAINT valid_price CHECK (price > 0)
);

CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expiry ON subscriptions(expires_at);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date) WHERE auto_renew = true;
CREATE INDEX idx_subscriptions_active ON subscriptions(customer_id, status) WHERE status = 'active';

-- ============================================
-- SUBSCRIPTION HISTORY TABLE
-- ============================================

CREATE TABLE subscription_history (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,

    -- Event details
    event_type VARCHAR(50) NOT NULL, -- created, renewed, paused, cancelled, expired, upgraded, downgraded
    previous_status VARCHAR(20),
    new_status VARCHAR(20),

    -- Pricing changes
    previous_plan VARCHAR(50),
    new_plan VARCHAR(50),
    previous_price DECIMAL(12, 2),
    new_price DECIMAL(12, 2),

    -- Related transaction
    transaction_id INTEGER REFERENCES transactions(id),

    -- Timing
    event_date TIMESTAMP DEFAULT NOW(),

    -- Metadata
    reason TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_sub_history_subscription ON subscription_history(subscription_id);
CREATE INDEX idx_sub_history_event ON subscription_history(event_type);
CREATE INDEX idx_sub_history_date ON subscription_history(event_date DESC);

-- ============================================
-- CLIMATE ALERTS TABLE
-- ============================================

CREATE TABLE climate_alerts (
    id SERIAL PRIMARY KEY,
    alert_id UUID DEFAULT uuid_generate_v4() UNIQUE,

    -- Alert details
    alert_type VARCHAR(50) NOT NULL, -- flood, drought, cyclone, locust, disease, heatwave, wildfire
    severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
    confidence_score DECIMAL(5, 2) CHECK (confidence_score BETWEEN 0 AND 100),

    -- Location
    region VARCHAR(100) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    coordinates POINT,
    affected_area_km2 DECIMAL(10, 2),

    -- Timing
    forecast_date TIMESTAMP, -- When the event is expected
    issued_at TIMESTAMP DEFAULT NOW(),
    valid_until TIMESTAMP,
    lead_time_hours INTEGER, -- How many hours in advance

    -- Alert content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    recommendations TEXT,
    impact_assessment TEXT,

    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, expired, cancelled
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP,
    verified_by INTEGER REFERENCES users(id),

    -- Source
    data_source VARCHAR(100), -- weather_api, satellite, ground_sensor, ai_model
    model_id INTEGER,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    CONSTRAINT valid_alert_type CHECK (alert_type IN ('flood', 'drought', 'cyclone', 'locust', 'disease', 'heatwave', 'wildfire')),
    CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX idx_climate_alerts_type ON climate_alerts(alert_type);
CREATE INDEX idx_climate_alerts_region ON climate_alerts(region);
CREATE INDEX idx_climate_alerts_status ON climate_alerts(status);
CREATE INDEX idx_climate_alerts_date ON climate_alerts(issued_at DESC);
CREATE INDEX idx_climate_alerts_forecast ON climate_alerts(forecast_date);
CREATE INDEX idx_climate_alerts_active ON climate_alerts(status) WHERE status = 'active';

-- ============================================
-- ALERT DELIVERIES TABLE (Tracking who received which alert)
-- ============================================

CREATE TABLE alert_deliveries (
    id SERIAL PRIMARY KEY,
    alert_id INTEGER REFERENCES climate_alerts(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,

    -- Transaction reference (if paid alert)
    transaction_id INTEGER REFERENCES transactions(id),
    is_paid BOOLEAN DEFAULT false,
    amount_paid DECIMAL(12, 2),

    -- Delivery details
    delivery_method VARCHAR(20) NOT NULL, -- sms, email, push, whatsapp, webhook
    delivery_status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, failed, read

    -- Timing
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,

    -- Delivery info
    phone VARCHAR(20),
    email VARCHAR(255),
    webhook_url TEXT,

    -- Response tracking
    provider VARCHAR(50), -- twilio, africastalking, aws_sns, etc.
    provider_message_id VARCHAR(255),
    provider_response JSONB,
    delivery_attempts INTEGER DEFAULT 0,
    last_error TEXT,

    -- Customer engagement
    customer_acknowledged BOOLEAN DEFAULT false,
    customer_feedback TEXT,
    feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    CONSTRAINT valid_delivery_method CHECK (delivery_method IN ('sms', 'email', 'push', 'whatsapp', 'webhook')),
    CONSTRAINT valid_delivery_status CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'read'))
);

CREATE INDEX idx_alert_deliveries_alert ON alert_deliveries(alert_id);
CREATE INDEX idx_alert_deliveries_customer ON alert_deliveries(customer_id);
CREATE INDEX idx_alert_deliveries_status ON alert_deliveries(delivery_status);
CREATE INDEX idx_alert_deliveries_method ON alert_deliveries(delivery_method);
CREATE INDEX idx_alert_deliveries_sent ON alert_deliveries(sent_at DESC);

-- ============================================
-- DISASTER ALERTS TABLE (For Pillar 6)
-- ============================================

CREATE TABLE disaster_alerts (
    id SERIAL PRIMARY KEY,
    alert_hash VARCHAR(66) UNIQUE NOT NULL,
    disaster_type VARCHAR(50) NOT NULL,
    region VARCHAR(100) NOT NULL,
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    issued_at TIMESTAMP DEFAULT NOW(),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_disaster_alerts_type ON disaster_alerts(disaster_type);
CREATE INDEX idx_disaster_alerts_region ON disaster_alerts(region);
CREATE INDEX idx_disaster_alerts_active ON disaster_alerts(resolved) WHERE resolved = false;

-- ============================================
-- CLIMATE MODELS TABLE (For AI/ML tracking)
-- ============================================

CREATE TABLE climate_models (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    risk_type VARCHAR(50), -- flood, drought, etc.
    accuracy DECIMAL(5, 2),
    last_trained_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- Daily Revenue View
CREATE OR REPLACE VIEW daily_revenue AS
SELECT
    revenue_date,
    COUNT(*) as transactions,
    SUM(usd_equivalent) as revenue_usd,
    SUM(CASE WHEN currency = 'TZS' THEN amount ELSE 0 END) as revenue_tzs,
    SUM(CASE WHEN currency = 'KES' THEN amount ELSE 0 END) as revenue_kes,
    SUM(CASE WHEN currency = 'NGN' THEN amount ELSE 0 END) as revenue_ngn,
    COUNT(DISTINCT customer_id) as unique_customers,
    AVG(usd_equivalent) as avg_transaction_value
FROM revenue
WHERE is_refunded = false
GROUP BY revenue_date
ORDER BY revenue_date DESC;

-- Monthly Revenue by Pillar
CREATE OR REPLACE VIEW monthly_revenue_by_pillar AS
SELECT
    revenue_month,
    pillar,
    COUNT(*) as transactions,
    SUM(usd_equivalent) as revenue_usd,
    COUNT(DISTINCT customer_id) as unique_customers
FROM revenue
WHERE is_refunded = false
GROUP BY revenue_month, pillar
ORDER BY revenue_month DESC, pillar;

-- Customer Lifetime Value
CREATE OR REPLACE VIEW customer_ltv AS
SELECT
    c.id,
    c.customer_reference,
    c.phone,
    c.country_code,
    c.total_spent_usd,
    COUNT(DISTINCT r.id) as total_transactions,
    MAX(r.created_at) as last_purchase,
    MIN(r.created_at) as first_purchase,
    COUNT(DISTINCT s.id) as total_subscriptions,
    SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) as active_subscriptions
FROM customers c
LEFT JOIN revenue r ON c.id = r.customer_id
LEFT JOIN subscriptions s ON c.id = s.customer_id
GROUP BY c.id, c.customer_reference, c.phone, c.country_code, c.total_spent_usd
ORDER BY c.total_spent_usd DESC;

-- Active Subscriptions Summary
CREATE OR REPLACE VIEW active_subscriptions_summary AS
SELECT
    plan,
    pillar,
    COUNT(*) as count,
    SUM(usd_equivalent) as mrr_usd,
    AVG(usd_equivalent) as avg_price
FROM subscriptions
WHERE status = 'active'
GROUP BY plan, pillar;

-- Alert Delivery Success Rate
CREATE OR REPLACE VIEW alert_delivery_metrics AS
SELECT
    delivery_method,
    COUNT(*) as total_deliveries,
    SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END) as failed,
    ROUND(100.0 * SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM alert_deliveries
GROUP BY delivery_method;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update customer lifetime value
CREATE OR REPLACE FUNCTION update_customer_ltv()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        UPDATE customers
        SET
            total_spent_usd = total_spent_usd + NEW.usd_equivalent,
            total_spent_local = total_spent_local + NEW.amount,
            lifetime_value_usd = total_spent_usd + NEW.usd_equivalent,
            last_purchase_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update LTV
CREATE TRIGGER trigger_update_ltv
    AFTER UPDATE ON transactions
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
    EXECUTE FUNCTION update_customer_ltv();

-- Function to record revenue when transaction completes
CREATE OR REPLACE FUNCTION record_completed_transaction()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO revenue (
            transaction_id,
            amount,
            currency,
            usd_equivalent,
            provider,
            product,
            pillar,
            customer_id,
            customer_reference,
            revenue_date,
            revenue_month,
            revenue_year,
            reference
        ) VALUES (
            NEW.id,
            NEW.amount,
            NEW.currency,
            NEW.usd_equivalent,
            NEW.provider,
            NEW.product_type,
            NEW.pillar,
            NEW.customer_id,
            NEW.customer_reference,
            CURRENT_DATE,
            TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
            EXTRACT(YEAR FROM CURRENT_DATE),
            NEW.provider_reference
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-record revenue
CREATE TRIGGER trigger_record_revenue
    AFTER UPDATE ON transactions
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION record_completed_transaction();

-- Function to expire subscriptions
CREATE OR REPLACE FUNCTION expire_subscriptions()
RETURNS void AS $$
BEGIN
    UPDATE subscriptions
    SET status = 'expired'
    WHERE status = 'active'
    AND expires_at < NOW();

    -- Log expiration events
    INSERT INTO subscription_history (subscription_id, event_type, previous_status, new_status, event_date)
    SELECT id, 'expired', 'active', 'expired', NOW()
    FROM subscriptions
    WHERE status = 'expired'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA (For testing)
-- ============================================

-- Insert sample user
INSERT INTO users (wallet_address, phone, email, country_code, region, user_type)
VALUES
    ('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7', '255712345678', 'farmer@example.com', 'TZ', 'Morogoro', 'farmer'),
    (NULL, '254712345678', NULL, 'KE', 'Kisumu', 'farmer'),
    (NULL, '234802345678', 'enterprise@example.com', 'NG', 'Lagos', 'enterprise');

-- Insert sample customer
INSERT INTO customers (user_id, customer_reference, phone, country_code, preferred_currency)
SELECT id, 'CUST-' || LPAD(id::TEXT, 6, '0'), phone, country_code,
    CASE country_code
        WHEN 'TZ' THEN 'TZS'
        WHEN 'KE' THEN 'KES'
        WHEN 'NG' THEN 'NGN'
        ELSE 'USD'
    END
FROM users;

-- Grant permissions (adjust for your database user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kai_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kai_user;

-- ============================================
-- MAINTENANCE JOBS
-- ============================================

-- Run daily to expire subscriptions
-- SELECT expire_subscriptions();

-- Run monthly to cleanup old data (optional)
-- DELETE FROM transactions WHERE initiated_at < NOW() - INTERVAL '2 years' AND status IN ('failed', 'refunded');

COMMENT ON TABLE users IS 'Core user accounts';
COMMENT ON TABLE customers IS 'Extended customer information for payment processing';
COMMENT ON TABLE transactions IS 'All payment transactions across all pillars';
COMMENT ON TABLE revenue IS 'Completed transactions for revenue analytics';
COMMENT ON TABLE subscriptions IS 'Active and historical subscriptions';
COMMENT ON TABLE climate_alerts IS 'Climate intelligence alerts (Pillar 1)';
COMMENT ON TABLE alert_deliveries IS 'Tracking delivery of alerts to customers';

-- ============================================
-- SCHEMA COMPLETE!
-- ============================================
-- Run this file: psql -d kai_database -f schema.sql
