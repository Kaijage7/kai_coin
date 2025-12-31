/**
 * KAI WhatsApp Bot Service
 *
 * Handles customer interactions via WhatsApp:
 * - Check subscription status
 * - Purchase alerts
 * - Manage subscriptions
 * - Receive alerts
 * - Check weather conditions
 *
 * Uses Twilio WhatsApp API
 */

const twilio = require('twilio');
const { Pool } = require('pg');

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Twilio client
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

// Session storage (in production, use Redis)
const sessions = new Map();

// Message templates
const TEMPLATES = {
    welcome: (name) => `
🌍 *Karibu KAI Intelligence!*

Hello ${name || 'there'}! I'm your climate alert assistant.

*Quick Commands:*
1️⃣ Type *STATUS* - Check subscription
2️⃣ Type *BUY* - Purchase an alert
3️⃣ Type *SUBSCRIBE* - View plans
4️⃣ Type *WEATHER* - Current conditions
5️⃣ Type *ALERTS* - Active alerts
6️⃣ Type *HELP* - All commands

_Protecting farmers across Tanzania_ 🇹🇿
`,

    status: (subscription) => {
        if (!subscription) {
            return `
📊 *Your Status*

❌ No active subscription

You're missing out on early warnings!

Type *SUBSCRIBE* to view plans
Type *BUY* for pay-per-use alerts
`;
        }

        const daysLeft = Math.ceil((new Date(subscription.expires_at) - new Date()) / (1000 * 60 * 60 * 24));

        return `
📊 *Your Subscription*

✅ Plan: *${subscription.plan.toUpperCase()}*
📅 Expires: ${new Date(subscription.expires_at).toLocaleDateString()}
⏰ Days Left: ${daysLeft}
📬 Alerts Used: ${subscription.alerts_used}/${subscription.alerts_included || '∞'}
🔄 Auto-Renew: ${subscription.auto_renew ? 'Yes' : 'No'}

Type *RENEW* to extend subscription
Type *TOGGLE* to change auto-renewal
`;
    },

    pricing: `
💰 *KAI Alert Pricing*

*Pay-Per-Use Alerts:*
• Flood Alert: TZS 46,000 (~$20)
• Drought Alert: TZS 34,500 (~$15)
• Cyclone Alert: TZS 69,000 (~$30)
• Locust Alert: TZS 57,500 (~$25)

*Monthly Subscriptions:*
📦 *BASIC* - TZS 69,000/mo
   • 10 alerts/month
   • Drought alerts only
   • SMS delivery

💎 *PREMIUM* - TZS 184,000/mo
   • Unlimited alerts
   • All alert types
   • SMS + WhatsApp
   • Priority delivery

🏢 *ENTERPRISE* - TZS 690,000/mo
   • Everything in Premium
   • API access
   • Custom reports
   • Dedicated support

Reply with plan name to subscribe:
• Type *BASIC*
• Type *PREMIUM*
• Type *ENTERPRISE*
`,

    buyAlert: `
🛒 *Buy Single Alert*

Which alert type do you need?

1️⃣ *FLOOD* - TZS 46,000
2️⃣ *DROUGHT* - TZS 34,500
3️⃣ *CYCLONE* - TZS 69,000
4️⃣ *LOCUST* - TZS 57,500
5️⃣ *DISEASE* - TZS 46,000

Reply with the alert name (e.g., *FLOOD*)
`,

    paymentInstructions: (type, amount, reference) => `
💳 *Payment Instructions*

Product: ${type}
Amount: TZS ${amount.toLocaleString()}
Reference: ${reference}

*M-Pesa Payment:*
1. Go to M-Pesa menu
2. Select *Lipa na M-Pesa*
3. Enter Paybill: *123456*
4. Account: *${reference}*
5. Amount: *${amount}*
6. Confirm payment

Or dial: *150*00#

⏰ Complete within 15 minutes

After payment, type *CONFIRM ${reference}*
`,

    weather: (data) => `
🌤️ *Weather Conditions*

📍 Region: ${data.region}
🌡️ Temperature: ${data.temperature}°C
💧 Humidity: ${data.humidity}%
🌧️ Rain (24h): ${data.rainfall}mm
💨 Wind: ${data.wind_speed} km/h

*Risk Assessment:*
${data.risks.map(r => `• ${r.type}: ${r.level}`).join('\n')}

${data.alert ? `⚠️ *ACTIVE ALERT:* ${data.alert}` : '✅ No active alerts'}

Type *ALERTS* for detailed alert info
`,

    activeAlerts: (alerts) => {
        if (!alerts.length) {
            return `
✅ *No Active Alerts*

Current conditions are normal in your region.

Stay prepared! Type *SUBSCRIBE* for early warnings.
`;
        }

        return `
⚠️ *Active Alerts (${alerts.length})*

${alerts.map((a, i) => `
${i + 1}. *${a.alert_type.toUpperCase()}* - ${a.severity}
📍 ${a.region}
📅 ${new Date(a.forecast_date).toLocaleDateString()}
📝 ${a.title}
`).join('\n---\n')}

Type alert number for full details
`;
    },

    help: `
📚 *KAI Bot Commands*

*Account:*
• STATUS - Your subscription
• PROFILE - Your details
• HISTORY - Alert history

*Payments:*
• BUY - Purchase single alert
• SUBSCRIBE - View/buy plans
• RENEW - Renew subscription
• BALANCE - Check KAI balance

*Alerts:*
• WEATHER - Current conditions
• ALERTS - Active alerts
• FORECAST - 7-day forecast

*Settings:*
• REGION [name] - Change region
• TOGGLE - Toggle auto-renew
• LANGUAGE [sw/en] - Change language

*Support:*
• HELP - This menu
• SUPPORT - Contact support

_Questions? Type SUPPORT_
`,

    error: `
❌ Sorry, I didn't understand that.

Type *HELP* for available commands.
`,

    support: `
📞 *Contact Support*

📧 Email: support@kai-intelligence.com
📱 Phone: +255 123 456 789
🌐 Web: kai-intelligence.com/support

Business Hours:
Mon-Fri: 8AM - 6PM (EAT)
Sat: 9AM - 1PM

Type *HELP* to return to main menu
`
};

class WhatsAppBot {
    constructor() {
        this.sessions = sessions;
    }

    /**
     * Process incoming WhatsApp message
     */
    async processMessage(from, body, profileName) {
        const phone = from.replace('whatsapp:', '');
        const message = body.trim().toUpperCase();

        console.log(`📱 WhatsApp from ${phone}: ${message}`);

        // Get or create session
        let session = this.sessions.get(phone) || { state: 'idle', data: {} };

        // Get customer info
        const customer = await this.getOrCreateCustomer(phone, profileName);

        // Process based on state and message
        let response;

        // Check for state-specific handlers first
        if (session.state !== 'idle') {
            response = await this.handleStatefulMessage(phone, message, session, customer);
            if (response) return response;
        }

        // Handle commands
        switch (message) {
            case 'HI':
            case 'HELLO':
            case 'START':
            case 'MENU':
                response = TEMPLATES.welcome(customer?.full_name);
                break;

            case 'STATUS':
                const subscription = await this.getSubscription(customer.id);
                response = TEMPLATES.status(subscription);
                break;

            case 'SUBSCRIBE':
            case 'PLANS':
            case 'PRICING':
                response = TEMPLATES.pricing;
                break;

            case 'BUY':
                session.state = 'buying_alert';
                this.sessions.set(phone, session);
                response = TEMPLATES.buyAlert;
                break;

            case 'BASIC':
            case 'PREMIUM':
            case 'ENTERPRISE':
                response = await this.initiateSubscription(customer, message.toLowerCase());
                break;

            case 'FLOOD':
            case 'DROUGHT':
            case 'CYCLONE':
            case 'LOCUST':
            case 'DISEASE':
                response = await this.initiateAlertPurchase(customer, message.toLowerCase());
                break;

            case 'WEATHER':
                const weather = await this.getWeatherData(customer.region || 'DAR');
                response = TEMPLATES.weather(weather);
                break;

            case 'ALERTS':
                const alerts = await this.getActiveAlerts(customer.region);
                response = TEMPLATES.activeAlerts(alerts);
                break;

            case 'HELP':
            case '?':
                response = TEMPLATES.help;
                break;

            case 'SUPPORT':
            case 'CONTACT':
                response = TEMPLATES.support;
                break;

            case 'TOGGLE':
                response = await this.toggleAutoRenew(customer);
                break;

            case 'RENEW':
                response = await this.initiateRenewal(customer);
                break;

            default:
                // Check for CONFIRM command
                if (message.startsWith('CONFIRM ')) {
                    const reference = message.replace('CONFIRM ', '');
                    response = await this.confirmPayment(customer, reference);
                }
                // Check for REGION command
                else if (message.startsWith('REGION ')) {
                    const region = message.replace('REGION ', '');
                    response = await this.setRegion(customer, region);
                }
                else {
                    response = TEMPLATES.error;
                }
        }

        return response;
    }

    /**
     * Handle stateful conversation
     */
    async handleStatefulMessage(phone, message, session, customer) {
        switch (session.state) {
            case 'buying_alert':
                if (['FLOOD', 'DROUGHT', 'CYCLONE', 'LOCUST', 'DISEASE'].includes(message)) {
                    session.state = 'idle';
                    this.sessions.set(phone, session);
                    return await this.initiateAlertPurchase(customer, message.toLowerCase());
                }
                if (message === 'CANCEL' || message === 'BACK') {
                    session.state = 'idle';
                    this.sessions.set(phone, session);
                    return TEMPLATES.welcome(customer?.full_name);
                }
                return TEMPLATES.buyAlert + '\n\n_Type CANCEL to go back_';

            case 'awaiting_payment':
                if (message.startsWith('CONFIRM')) {
                    session.state = 'idle';
                    this.sessions.set(phone, session);
                    return await this.confirmPayment(customer, session.data.reference);
                }
                return `⏳ Waiting for payment...\n\nReference: ${session.data.reference}\n\nAfter payment, type *CONFIRM ${session.data.reference}*`;

            default:
                return null;
        }
    }

    /**
     * Get or create customer from phone number
     */
    async getOrCreateCustomer(phone, name) {
        try {
            let result = await db.query(
                'SELECT * FROM customers WHERE phone = $1',
                [phone]
            );

            if (result.rows.length === 0) {
                // Create new customer
                result = await db.query(`
                    INSERT INTO customers (phone, full_name, preferred_currency, channel)
                    VALUES ($1, $2, 'TZS', 'whatsapp')
                    RETURNING *
                `, [phone, name || 'WhatsApp User']);
            }

            return result.rows[0];
        } catch (error) {
            console.error('Customer lookup error:', error);
            return { id: null, phone, full_name: name };
        }
    }

    /**
     * Get customer subscription
     */
    async getSubscription(customerId) {
        if (!customerId) return null;

        try {
            const result = await db.query(`
                SELECT * FROM subscriptions
                WHERE customer_id = $1
                AND status = 'active'
                AND expires_at > NOW()
                LIMIT 1
            `, [customerId]);

            return result.rows[0] || null;
        } catch (error) {
            console.error('Subscription lookup error:', error);
            return null;
        }
    }

    /**
     * Initiate alert purchase
     */
    async initiateAlertPurchase(customer, alertType) {
        const prices = {
            flood: 46000,
            drought: 34500,
            cyclone: 69000,
            locust: 57500,
            disease: 46000
        };

        const amount = prices[alertType];
        const reference = `KAI-${alertType.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

        // Store pending transaction
        try {
            await db.query(`
                INSERT INTO transactions (
                    transaction_id, customer_id, amount, currency,
                    product_type, status, provider
                ) VALUES ($1, $2, $3, 'TZS', $4, 'pending', 'mpesa')
            `, [reference, customer.id, amount, `alert_${alertType}`]);
        } catch (error) {
            console.error('Transaction creation error:', error);
        }

        // Update session
        this.sessions.set(customer.phone, {
            state: 'awaiting_payment',
            data: { reference, alertType, amount }
        });

        return TEMPLATES.paymentInstructions(
            `${alertType.charAt(0).toUpperCase() + alertType.slice(1)} Alert`,
            amount,
            reference
        );
    }

    /**
     * Initiate subscription
     */
    async initiateSubscription(customer, plan) {
        const prices = {
            basic: 69000,
            premium: 184000,
            enterprise: 690000
        };

        const amount = prices[plan];
        if (!amount) return TEMPLATES.error;

        const reference = `KAI-SUB-${plan.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

        try {
            await db.query(`
                INSERT INTO transactions (
                    transaction_id, customer_id, amount, currency,
                    product_type, status, provider
                ) VALUES ($1, $2, $3, 'TZS', $4, 'pending', 'mpesa')
            `, [reference, customer.id, amount, `subscription_${plan}`]);
        } catch (error) {
            console.error('Transaction creation error:', error);
        }

        this.sessions.set(customer.phone, {
            state: 'awaiting_payment',
            data: { reference, plan, amount }
        });

        return TEMPLATES.paymentInstructions(
            `${plan.charAt(0).toUpperCase() + plan.slice(1)} Subscription`,
            amount,
            reference
        );
    }

    /**
     * Confirm payment (simulated - real implementation checks M-Pesa)
     */
    async confirmPayment(customer, reference) {
        try {
            // Check transaction exists
            const txResult = await db.query(
                'SELECT * FROM transactions WHERE transaction_id = $1',
                [reference]
            );

            if (txResult.rows.length === 0) {
                return `❌ Reference not found: ${reference}\n\nPlease check and try again.`;
            }

            const tx = txResult.rows[0];

            if (tx.status === 'completed') {
                return `✅ This payment was already processed!\n\nType *STATUS* to check your subscription.`;
            }

            // In production, verify with M-Pesa API
            // For now, simulate successful payment

            // Update transaction
            await db.query(`
                UPDATE transactions
                SET status = 'completed', completed_at = NOW()
                WHERE transaction_id = $1
            `, [reference]);

            // Process based on product type
            if (tx.product_type.startsWith('subscription_')) {
                const plan = tx.product_type.replace('subscription_', '');
                const alertsIncluded = plan === 'basic' ? 10 : null;

                await db.query(`
                    INSERT INTO subscriptions (
                        customer_id, plan, status,
                        expires_at, alerts_included, alerts_used
                    ) VALUES ($1, $2, 'active', NOW() + INTERVAL '30 days', $3, 0)
                    ON CONFLICT (customer_id) WHERE status = 'active'
                    DO UPDATE SET
                        plan = EXCLUDED.plan,
                        expires_at = NOW() + INTERVAL '30 days',
                        alerts_included = EXCLUDED.alerts_included
                `, [customer.id, plan, alertsIncluded]);

                return `
✅ *Subscription Activated!*

Plan: *${plan.toUpperCase()}*
Valid Until: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}

You will now receive climate alerts via WhatsApp!

Type *STATUS* to view details
`;
            } else {
                // Alert purchase
                const alertType = tx.product_type.replace('alert_', '');

                return `
✅ *Alert Purchased!*

Type: *${alertType.toUpperCase()}*
Status: Active

You will receive the next ${alertType} alert for your region.

Type *ALERTS* to see current alerts
`;
            }

        } catch (error) {
            console.error('Payment confirmation error:', error);
            return `❌ Error processing payment. Please contact support.\n\nReference: ${reference}`;
        }
    }

    /**
     * Get weather data
     */
    async getWeatherData(region) {
        // In production, fetch from weather oracle
        return {
            region: region,
            temperature: 28,
            humidity: 75,
            rainfall: 12,
            wind_speed: 15,
            risks: [
                { type: 'Flood', level: 'Medium' },
                { type: 'Drought', level: 'Low' }
            ],
            alert: null
        };
    }

    /**
     * Get active alerts
     */
    async getActiveAlerts(region) {
        try {
            const result = await db.query(`
                SELECT * FROM climate_alerts
                WHERE status = 'active'
                AND valid_until > NOW()
                ${region ? 'AND region = $1' : ''}
                ORDER BY severity DESC, issued_at DESC
                LIMIT 5
            `, region ? [region] : []);

            return result.rows;
        } catch (error) {
            console.error('Alerts fetch error:', error);
            return [];
        }
    }

    /**
     * Toggle auto-renewal
     */
    async toggleAutoRenew(customer) {
        try {
            const result = await db.query(`
                UPDATE subscriptions
                SET auto_renew = NOT auto_renew
                WHERE customer_id = $1 AND status = 'active'
                RETURNING auto_renew
            `, [customer.id]);

            if (result.rows.length === 0) {
                return `❌ No active subscription found.\n\nType *SUBSCRIBE* to view plans.`;
            }

            const autoRenew = result.rows[0].auto_renew;
            return `✅ Auto-renewal ${autoRenew ? 'enabled' : 'disabled'}!\n\n${autoRenew ? 'Your subscription will automatically renew.' : 'You will need to manually renew.'}`;
        } catch (error) {
            console.error('Toggle auto-renew error:', error);
            return `❌ Error updating settings. Please try again.`;
        }
    }

    /**
     * Set customer region
     */
    async setRegion(customer, regionCode) {
        const validRegions = ['DAR', 'MOR', 'DOD', 'MWZ', 'ARU', 'MBY', 'TNG', 'ZNZ', 'KIL', 'IRN'];

        if (!validRegions.includes(regionCode)) {
            return `❌ Invalid region: ${regionCode}\n\nValid regions:\n${validRegions.join(', ')}`;
        }

        try {
            await db.query(
                'UPDATE customers SET region = $1 WHERE id = $2',
                [regionCode, customer.id]
            );

            return `✅ Region updated to *${regionCode}*\n\nYou will now receive alerts for this region.`;
        } catch (error) {
            console.error('Set region error:', error);
            return `❌ Error updating region. Please try again.`;
        }
    }

    /**
     * Initiate subscription renewal
     */
    async initiateRenewal(customer) {
        const subscription = await this.getSubscription(customer.id);

        if (!subscription) {
            return `❌ No active subscription to renew.\n\nType *SUBSCRIBE* to view plans.`;
        }

        return await this.initiateSubscription(customer, subscription.plan);
    }

    /**
     * Send WhatsApp message
     */
    async sendMessage(to, body) {
        const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

        try {
            const message = await twilioClient.messages.create({
                from: WHATSAPP_NUMBER,
                to: toNumber,
                body: body
            });

            console.log(`📤 WhatsApp sent to ${to}: ${message.sid}`);
            return message;
        } catch (error) {
            console.error('WhatsApp send error:', error);
            throw error;
        }
    }

    /**
     * Send alert to customer
     */
    async sendAlert(customer, alert) {
        const message = `
⚠️ *CLIMATE ALERT*

🚨 Type: *${alert.alert_type.toUpperCase()}*
📍 Region: ${alert.region}
⚡ Severity: ${alert.severity}

📝 ${alert.title}

${alert.description}

*Recommendations:*
${alert.recommendations || 'Follow local authority guidelines.'}

📅 Valid until: ${new Date(alert.valid_until).toLocaleDateString()}

Stay safe! 🙏
`;

        return await this.sendMessage(customer.phone, message);
    }
}

// Express routes for WhatsApp webhook
function setupRoutes(app) {
    const bot = new WhatsAppBot();

    // Webhook for incoming messages
    app.post('/api/whatsapp/webhook', async (req, res) => {
        try {
            const { From, Body, ProfileName } = req.body;

            if (!From || !Body) {
                return res.status(400).send('Missing parameters');
            }

            const response = await bot.processMessage(From, Body, ProfileName);

            // Send response via Twilio
            await bot.sendMessage(From, response);

            res.status(200).send('OK');
        } catch (error) {
            console.error('Webhook error:', error);
            res.status(500).send('Error');
        }
    });

    // Status callback
    app.post('/api/whatsapp/status', (req, res) => {
        const { MessageSid, MessageStatus } = req.body;
        console.log(`📱 Message ${MessageSid}: ${MessageStatus}`);
        res.status(200).send('OK');
    });

    // Send alert endpoint (internal use)
    app.post('/api/whatsapp/send-alert', async (req, res) => {
        try {
            const { phone, alert } = req.body;

            // Get customer
            const customer = await bot.getOrCreateCustomer(phone);

            await bot.sendAlert(customer, alert);

            res.json({ success: true, message: 'Alert sent' });
        } catch (error) {
            console.error('Send alert error:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return bot;
}

module.exports = { WhatsAppBot, setupRoutes };
