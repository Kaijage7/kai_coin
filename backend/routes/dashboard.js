/**
 * 📊 Customer Dashboard API
 *
 * Endpoints for customers to:
 * - View subscription status
 * - View alert history
 * - Manage profile
 * - View payment history
 * - Renew subscriptions
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

// ============================================
// CUSTOMER PROFILE
// ============================================

/**
 * @route GET /api/dashboard/profile/:phone
 * @desc Get customer profile by phone number
 */
router.get('/profile/:phone', async (req, res) => {
    try {
        const { phone } = req.params;

        const result = await db.query(`
            SELECT
                c.*,
                u.wallet_address,
                u.user_type,
                u.created_at as member_since
            FROM customers c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.phone = $1
        `, [phone]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customer = result.rows[0];

        // Remove sensitive data
        delete customer.metadata;

        res.json({
            success: true,
            customer
        });

    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route PUT /api/dashboard/profile/:phone
 * @desc Update customer profile
 */
router.put('/profile/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const { full_name, email, preferred_currency, language, region } = req.body;

        const result = await db.query(`
            UPDATE customers
            SET
                full_name = COALESCE($2, full_name),
                email = COALESCE($3, email),
                preferred_currency = COALESCE($4, preferred_currency),
                metadata = metadata || jsonb_build_object('language', $5, 'region', $6)
            WHERE phone = $1
            RETURNING *
        `, [phone, full_name, email, preferred_currency, language || 'sw', region]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.json({
            success: true,
            message: 'Profile updated',
            customer: result.rows[0]
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// SUBSCRIPTIONS
// ============================================

/**
 * @route GET /api/dashboard/subscriptions/:phone
 * @desc Get all subscriptions for a customer
 */
router.get('/subscriptions/:phone', async (req, res) => {
    try {
        const { phone } = req.params;

        // Get customer ID first
        const customerResult = await db.query(
            'SELECT id FROM customers WHERE phone = $1',
            [phone]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customerId = customerResult.rows[0].id;

        // Get subscriptions
        const result = await db.query(`
            SELECT
                s.*,
                CASE
                    WHEN s.expires_at > NOW() THEN 'active'
                    ELSE 'expired'
                END as current_status,
                EXTRACT(DAY FROM s.expires_at - NOW()) as days_remaining
            FROM subscriptions s
            WHERE s.customer_id = $1
            ORDER BY s.created_at DESC
        `, [customerId]);

        // Get active subscription summary
        const activeResult = await db.query(`
            SELECT
                plan,
                alerts_used,
                alerts_included,
                expires_at,
                auto_renew
            FROM subscriptions
            WHERE customer_id = $1 AND status = 'active'
            LIMIT 1
        `, [customerId]);

        res.json({
            success: true,
            active_subscription: activeResult.rows[0] || null,
            all_subscriptions: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('Subscriptions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route POST /api/dashboard/subscriptions/:phone/toggle-auto-renew
 * @desc Toggle auto-renewal for subscription
 */
router.post('/subscriptions/:phone/toggle-auto-renew', async (req, res) => {
    try {
        const { phone } = req.params;

        const result = await db.query(`
            UPDATE subscriptions s
            SET auto_renew = NOT auto_renew
            FROM customers c
            WHERE s.customer_id = c.id
            AND c.phone = $1
            AND s.status = 'active'
            RETURNING s.auto_renew
        `, [phone]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No active subscription found' });
        }

        res.json({
            success: true,
            auto_renew: result.rows[0].auto_renew,
            message: result.rows[0].auto_renew
                ? 'Auto-renewal enabled'
                : 'Auto-renewal disabled'
        });

    } catch (error) {
        console.error('Toggle auto-renew error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// ALERTS
// ============================================

/**
 * @route GET /api/dashboard/alerts/:phone
 * @desc Get alert history for a customer
 */
router.get('/alerts/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        // Get customer ID
        const customerResult = await db.query(
            'SELECT id FROM customers WHERE phone = $1',
            [phone]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customerId = customerResult.rows[0].id;

        // Get alerts delivered to this customer
        const result = await db.query(`
            SELECT
                ca.id,
                ca.alert_type,
                ca.severity,
                ca.title,
                ca.description,
                ca.region,
                ca.forecast_date,
                ca.recommendations,
                ad.delivery_status,
                ad.sent_at,
                ad.delivered_at,
                ad.is_paid,
                ad.amount_paid
            FROM alert_deliveries ad
            INNER JOIN climate_alerts ca ON ad.alert_id = ca.id
            WHERE ad.customer_id = $1
            ORDER BY ad.sent_at DESC
            LIMIT $2 OFFSET $3
        `, [customerId, parseInt(limit), parseInt(offset)]);

        // Get total count
        const countResult = await db.query(`
            SELECT COUNT(*) FROM alert_deliveries WHERE customer_id = $1
        `, [customerId]);

        res.json({
            success: true,
            alerts: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Alerts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route GET /api/dashboard/alerts/active
 * @desc Get current active alerts (public)
 */
router.get('/alerts/active', async (req, res) => {
    try {
        const { region } = req.query;

        let query = `
            SELECT
                id,
                alert_type,
                severity,
                title,
                description,
                region,
                forecast_date,
                lead_time_hours,
                issued_at,
                confidence_score
            FROM climate_alerts
            WHERE status = 'active'
            AND valid_until > NOW()
        `;

        const params = [];
        if (region) {
            query += ' AND region = $1';
            params.push(region);
        }

        query += ' ORDER BY severity DESC, issued_at DESC LIMIT 50';

        const result = await db.query(query, params);

        res.json({
            success: true,
            alerts: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('Active alerts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// PAYMENT HISTORY
// ============================================

/**
 * @route GET /api/dashboard/payments/:phone
 * @desc Get payment history for a customer
 */
router.get('/payments/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        // Get customer ID
        const customerResult = await db.query(
            'SELECT id FROM customers WHERE phone = $1',
            [phone]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customerId = customerResult.rows[0].id;

        // Get transactions
        const result = await db.query(`
            SELECT
                transaction_id,
                amount,
                currency,
                usd_equivalent,
                provider,
                product_type,
                status,
                initiated_at,
                completed_at,
                provider_reference
            FROM transactions
            WHERE customer_id = $1
            ORDER BY initiated_at DESC
            LIMIT $2 OFFSET $3
        `, [customerId, parseInt(limit), parseInt(offset)]);

        // Get summary
        const summaryResult = await db.query(`
            SELECT
                COUNT(*) as total_transactions,
                SUM(CASE WHEN status = 'completed' THEN usd_equivalent ELSE 0 END) as total_spent,
                MAX(initiated_at) as last_payment
            FROM transactions
            WHERE customer_id = $1
        `, [customerId]);

        res.json({
            success: true,
            payments: result.rows,
            summary: summaryResult.rows[0],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Payments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// USAGE STATISTICS
// ============================================

/**
 * @route GET /api/dashboard/stats/:phone
 * @desc Get usage statistics for a customer
 */
router.get('/stats/:phone', async (req, res) => {
    try {
        const { phone } = req.params;

        // Get customer
        const customerResult = await db.query(
            'SELECT id, total_spent_usd, lifetime_value_usd, total_alerts_purchased FROM customers WHERE phone = $1',
            [phone]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const customer = customerResult.rows[0];

        // Get alerts this month
        const alertsThisMonth = await db.query(`
            SELECT COUNT(*) FROM alert_deliveries
            WHERE customer_id = $1
            AND DATE_TRUNC('month', sent_at) = DATE_TRUNC('month', CURRENT_DATE)
        `, [customer.id]);

        // Get active subscription usage
        const subscriptionUsage = await db.query(`
            SELECT
                alerts_used,
                alerts_included,
                ROUND(100.0 * alerts_used / NULLIF(alerts_included, 0), 1) as usage_percent
            FROM subscriptions
            WHERE customer_id = $1 AND status = 'active'
            LIMIT 1
        `, [customer.id]);

        // Get savings estimate (based on average crop loss prevented)
        const avgSavingsPerAlert = 2000; // $2000 average crop saved per alert
        const estimatedSavings = customer.total_alerts_purchased * avgSavingsPerAlert;

        res.json({
            success: true,
            stats: {
                total_spent: parseFloat(customer.total_spent_usd),
                lifetime_value: parseFloat(customer.lifetime_value_usd),
                total_alerts: customer.total_alerts_purchased,
                alerts_this_month: parseInt(alertsThisMonth.rows[0].count),
                subscription_usage: subscriptionUsage.rows[0] || null,
                estimated_savings: estimatedSavings,
                roi: customer.total_spent_usd > 0
                    ? Math.round(estimatedSavings / customer.total_spent_usd)
                    : 0
            }
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================
// REGIONS
// ============================================

/**
 * @route GET /api/dashboard/regions
 * @desc Get list of supported regions
 */
router.get('/regions', async (req, res) => {
    const regions = [
        { name: 'Dar es Salaam', code: 'DAR', country: 'TZ' },
        { name: 'Morogoro', code: 'MOR', country: 'TZ' },
        { name: 'Dodoma', code: 'DOD', country: 'TZ' },
        { name: 'Mwanza', code: 'MWZ', country: 'TZ' },
        { name: 'Arusha', code: 'ARU', country: 'TZ' },
        { name: 'Mbeya', code: 'MBY', country: 'TZ' },
        { name: 'Tanga', code: 'TNG', country: 'TZ' },
        { name: 'Zanzibar', code: 'ZNZ', country: 'TZ' },
        { name: 'Kilimanjaro', code: 'KIL', country: 'TZ' },
        { name: 'Iringa', code: 'IRN', country: 'TZ' },
        { name: 'Nairobi', code: 'NBO', country: 'KE' },
        { name: 'Mombasa', code: 'MBA', country: 'KE' },
        { name: 'Kisumu', code: 'KIS', country: 'KE' }
    ];

    res.json({
        success: true,
        regions,
        total: regions.length
    });
});

// ============================================
// PRICING
// ============================================

/**
 * @route GET /api/dashboard/pricing
 * @desc Get current pricing
 */
router.get('/pricing', async (req, res) => {
    const { country = 'TZ' } = req.query;

    const exchangeRates = {
        TZ: 2300,
        KE: 130,
        NG: 750,
        US: 1
    };

    const rate = exchangeRates[country] || 1;
    const currency = {
        TZ: 'TZS',
        KE: 'KES',
        NG: 'NGN',
        US: 'USD'
    }[country] || 'USD';

    const pricing = {
        alerts: {
            flood: { usd: 20, local: Math.round(20 * rate), currency },
            drought: { usd: 15, local: Math.round(15 * rate), currency },
            cyclone: { usd: 30, local: Math.round(30 * rate), currency },
            locust: { usd: 25, local: Math.round(25 * rate), currency },
            disease: { usd: 20, local: Math.round(20 * rate), currency }
        },
        subscriptions: {
            basic: {
                usd: 30,
                local: Math.round(30 * rate),
                currency,
                alerts_included: 10,
                features: ['Drought alerts only', 'SMS delivery', 'Email support']
            },
            premium: {
                usd: 80,
                local: Math.round(80 * rate),
                currency,
                alerts_included: null, // Unlimited
                features: ['All alert types', 'SMS + WhatsApp', 'Priority support', 'Daily digest']
            },
            enterprise: {
                usd: 300,
                local: Math.round(300 * rate),
                currency,
                alerts_included: null,
                features: ['All premium features', 'API access', 'Historical data', 'Custom reports', 'Dedicated support']
            }
        }
    };

    res.json({
        success: true,
        pricing,
        country,
        currency
    });
});

module.exports = router;
