/**
 * 📲 Automated Alert Delivery System
 *
 * Delivers climate alerts to customers via:
 * - SMS (primary for farmers)
 * - WebSocket (real-time web/app)
 * - Email (backup/enterprise)
 * - WhatsApp (premium feature)
 */

const axios = require('axios');
const { Pool } = require('pg');

class AlertDeliveryService {
    constructor() {
        this.db = new Pool({
            connectionString: process.env.DATABASE_URL
        });

        // Africa's Talking SMS (best for Tanzania/Kenya)
        this.africasTalkingConfig = {
            apiKey: process.env.AFRICASTALKING_API_KEY,
            username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
            shortcode: process.env.SMS_SHORTCODE || 'KAI'
        };

        // Twilio SMS (fallback for other countries)
        this.twilioConfig = {
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            fromNumber: process.env.TWILIO_PHONE_NUMBER
        };

        // WebSocket reference (set from server.js)
        this.io = null;

        // Delivery stats
        this.stats = {
            sms_sent: 0,
            sms_delivered: 0,
            sms_failed: 0,
            websocket_sent: 0,
            email_sent: 0
        };
    }

    /**
     * @dev Set WebSocket.io instance
     */
    setWebSocket(io) {
        this.io = io;
        console.log('✅ WebSocket connected to alert delivery system');
    }

    /**
     * @dev Main method: Deliver alert to customer
     * @param alertData Alert information
     * @param customer Customer to receive alert
     * @param options Delivery options
     */
    async deliverAlert(alertData, customer, options = {}) {
        console.log('\n📲 Delivering Alert');
        console.log('═══════════════════════════════════════');
        console.log(`Alert: ${alertData.type} - ${alertData.title}`);
        console.log(`Customer: ${customer.phone || customer.email}`);
        console.log(`Methods: ${options.methods || ['sms', 'websocket']}`);

        const deliveryResults = [];
        const methods = options.methods || ['sms', 'websocket'];

        try {
            // 1. Send via SMS (primary for farmers)
            if (methods.includes('sms') && customer.phone) {
                const smsResult = await this.sendSMS(alertData, customer);
                deliveryResults.push(smsResult);

                // Record delivery in database
                await this.recordDelivery({
                    alert_id: alertData.id,
                    customer_id: customer.id,
                    delivery_method: 'sms',
                    phone: customer.phone,
                    provider: smsResult.provider,
                    provider_message_id: smsResult.messageId,
                    delivery_status: smsResult.success ? 'sent' : 'failed',
                    sent_at: new Date(),
                    last_error: smsResult.error
                });
            }

            // 2. Send via WebSocket (real-time for web users)
            if (methods.includes('websocket') && this.io) {
                const wsResult = await this.sendWebSocket(alertData, customer);
                deliveryResults.push(wsResult);

                if (wsResult.success) {
                    await this.recordDelivery({
                        alert_id: alertData.id,
                        customer_id: customer.id,
                        delivery_method: 'push',
                        delivery_status: 'delivered',
                        sent_at: new Date()
                    });
                }
            }

            // 3. Send via Email (optional for enterprise)
            if (methods.includes('email') && customer.email) {
                const emailResult = await this.sendEmail(alertData, customer);
                deliveryResults.push(emailResult);

                await this.recordDelivery({
                    alert_id: alertData.id,
                    customer_id: customer.id,
                    delivery_method: 'email',
                    email: customer.email,
                    delivery_status: emailResult.success ? 'sent' : 'failed',
                    sent_at: new Date(),
                    last_error: emailResult.error
                });
            }

            // Summary
            const successCount = deliveryResults.filter(r => r.success).length;
            console.log(`\n✅ Alert delivered via ${successCount}/${deliveryResults.length} methods\n`);

            return {
                success: successCount > 0,
                results: deliveryResults,
                alert_id: alertData.id,
                customer_id: customer.id
            };

        } catch (error) {
            console.error('❌ Alert delivery error:', error.message);
            return {
                success: false,
                error: error.message,
                results: deliveryResults
            };
        }
    }

    /**
     * @dev Send SMS via Africa's Talking (Tanzania/Kenya)
     */
    async sendSMS(alertData, customer) {
        try {
            // Format alert message
            const message = this.formatSMSMessage(alertData, customer);

            console.log(`\n📱 Sending SMS via Africa's Talking...`);
            console.log(`To: ${customer.phone}`);
            console.log(`Message: ${message.substring(0, 100)}...`);

            // Africa's Talking API
            const response = await axios.post(
                'https://api.africastalking.com/version1/messaging',
                {
                    username: this.africasTalkingConfig.username,
                    to: customer.phone,
                    message: message,
                    from: this.africasTalkingConfig.shortcode
                },
                {
                    headers: {
                        'apiKey': this.africasTalkingConfig.apiKey,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json'
                    }
                }
            );

            if (response.data.SMSMessageData.Recipients.length > 0) {
                const recipient = response.data.SMSMessageData.Recipients[0];

                if (recipient.status === 'Success') {
                    this.stats.sms_sent++;
                    console.log('✅ SMS sent successfully!');
                    console.log(`Message ID: ${recipient.messageId}`);

                    return {
                        success: true,
                        provider: 'africastalking',
                        messageId: recipient.messageId,
                        status: recipient.status,
                        cost: recipient.cost
                    };
                } else {
                    this.stats.sms_failed++;
                    return {
                        success: false,
                        provider: 'africastalking',
                        error: recipient.status
                    };
                }
            } else {
                this.stats.sms_failed++;
                return {
                    success: false,
                    provider: 'africastalking',
                    error: 'No recipients'
                };
            }

        } catch (error) {
            this.stats.sms_failed++;
            console.error('❌ SMS sending failed:', error.response?.data || error.message);

            // Fallback to Twilio if Africa's Talking fails
            if (this.twilioConfig.accountSid) {
                return await this.sendSMSTwilio(alertData, customer);
            }

            return {
                success: false,
                provider: 'africastalking',
                error: error.message
            };
        }
    }

    /**
     * @dev Send SMS via Twilio (fallback/international)
     */
    async sendSMSTwilio(alertData, customer) {
        try {
            const message = this.formatSMSMessage(alertData, customer);

            console.log(`\n📱 Sending SMS via Twilio (fallback)...`);

            // Twilio API
            const twilio = require('twilio')(
                this.twilioConfig.accountSid,
                this.twilioConfig.authToken
            );

            const result = await twilio.messages.create({
                body: message,
                from: this.twilioConfig.fromNumber,
                to: customer.phone
            });

            this.stats.sms_sent++;
            console.log('✅ SMS sent via Twilio!');

            return {
                success: true,
                provider: 'twilio',
                messageId: result.sid,
                status: result.status
            };

        } catch (error) {
            this.stats.sms_failed++;
            console.error('❌ Twilio SMS failed:', error.message);

            return {
                success: false,
                provider: 'twilio',
                error: error.message
            };
        }
    }

    /**
     * @dev Send alert via WebSocket (real-time)
     */
    async sendWebSocket(alertData, customer) {
        try {
            if (!this.io) {
                return {
                    success: false,
                    provider: 'websocket',
                    error: 'WebSocket not configured'
                };
            }

            console.log(`\n🌐 Broadcasting via WebSocket...`);

            // Broadcast to specific user (if they have wallet address)
            if (customer.wallet_address) {
                this.io.to(`user:${customer.wallet_address}`).emit('alert:new', {
                    alert: alertData,
                    timestamp: new Date().toISOString(),
                    priority: alertData.severity || 'medium'
                });
            }

            // Broadcast to region
            if (alertData.region) {
                this.io.to(`region:${alertData.region}`).emit('alert:region', {
                    alert: alertData,
                    timestamp: new Date().toISOString()
                });
            }

            // Broadcast to all connected clients
            this.io.emit('alert:broadcast', {
                id: alertData.id,
                type: alertData.type,
                region: alertData.region,
                severity: alertData.severity,
                title: alertData.title,
                timestamp: new Date().toISOString()
            });

            this.stats.websocket_sent++;
            console.log('✅ WebSocket broadcast sent!');

            return {
                success: true,
                provider: 'websocket',
                method: 'broadcast'
            };

        } catch (error) {
            console.error('❌ WebSocket error:', error.message);

            return {
                success: false,
                provider: 'websocket',
                error: error.message
            };
        }
    }

    /**
     * @dev Send alert via Email
     */
    async sendEmail(alertData, customer) {
        try {
            // Using AWS SES or SendGrid (implement based on preference)
            console.log(`\n📧 Sending email...`);
            console.log(`To: ${customer.email}`);

            // TODO: Implement actual email sending
            // For now, just log
            console.log('⚠️  Email provider not configured yet');

            return {
                success: false,
                provider: 'email',
                error: 'Email provider not configured'
            };

        } catch (error) {
            return {
                success: false,
                provider: 'email',
                error: error.message
            };
        }
    }

    /**
     * @dev Format alert message for SMS (160 characters max)
     */
    formatSMSMessage(alertData, customer) {
        const lang = customer.language || 'sw';

        // Swahili messages (Tanzania/Kenya)
        if (lang === 'sw') {
            const templates = {
                flood: `⚠️ TAHADHARI YA MAFURIKO!\n${alertData.title}\nMwezi: ${alertData.region}\nTarehe: ${this.formatDate(alertData.forecast_date)}\n\nOKOA MAZAO YAKO! Hamisha kwa mahali salama.\n- KAI Intelligence`,

                drought: `☀️ TAHADHARI YA UKAME!\n${alertData.title}\nMwezi: ${alertData.region}\nMvua: Hazijakuja kwa siku ${alertData.days_without_rain}\n\nPANDA MAZAO YA UKAME.\n- KAI Intelligence`,

                cyclone: `🌀 TAHADHARI YA KIMBUNGA!\n${alertData.title}\nMwezi: ${alertData.region}\nKasi: ${alertData.wind_speed} km/h\n\nKIMBIA HARAKA! Nenda mahali salama.\n- KAI Intelligence`,

                locust: `🦗 TAHADHARI YA NZIGE!\n${alertData.title}\nEneo: ${alertData.region}\nWingi: ${alertData.swarm_size}\n\nLINDA SHAMBA LAKO!\n- KAI Intelligence`,

                disease: `🦠 TAHADHARI YA UGONJWA!\n${alertData.title}\nMazao: ${alertData.affected_crops}\n\nFANYA DAWA HARAKA!\n- KAI Intelligence`
            };

            return templates[alertData.type] || `⚠️ ${alertData.title}\n${alertData.description}\n- KAI Intelligence`;
        }

        // English messages
        const templates = {
            flood: `⚠️ FLOOD ALERT!\n${alertData.title}\nArea: ${alertData.region}\nExpected: ${this.formatDate(alertData.forecast_date)}\n\nMove harvest to high ground NOW!\n- KAI Intelligence`,

            drought: `☀️ DROUGHT ALERT!\n${alertData.title}\nArea: ${alertData.region}\n${alertData.days_without_rain} days without rain\n\nPlant drought-resistant crops.\n- KAI Intelligence`,

            cyclone: `🌀 CYCLONE ALERT!\n${alertData.title}\nArea: ${alertData.region}\nSpeed: ${alertData.wind_speed} km/h\n\nEVACUATE NOW! Seek shelter.\n- KAI Intelligence`,

            locust: `🦗 LOCUST SWARM ALERT!\n${alertData.title}\nArea: ${alertData.region}\n\nProtect your crops immediately!\n- KAI Intelligence`,

            disease: `🦠 CROP DISEASE ALERT!\n${alertData.title}\nCrops: ${alertData.affected_crops}\n\nApply treatment now!\n- KAI Intelligence`
        };

        return templates[alertData.type] || `⚠️ ${alertData.title}\n${alertData.description}\n- KAI Intelligence`;
    }

    /**
     * @dev Format date for SMS
     */
    formatDate(dateString) {
        if (!dateString) return 'Soon';
        const date = new Date(dateString);
        const now = new Date();
        const diffHours = Math.round((date - now) / (1000 * 60 * 60));

        if (diffHours < 24) {
            return `${diffHours}hrs`;
        } else if (diffHours < 48) {
            return 'Tomorrow';
        } else {
            return `${Math.round(diffHours / 24)} days`;
        }
    }

    /**
     * @dev Record delivery in database
     */
    async recordDelivery(deliveryData) {
        try {
            const query = `
                INSERT INTO alert_deliveries (
                    alert_id, customer_id, delivery_method, delivery_status,
                    phone, email, webhook_url, provider, provider_message_id,
                    sent_at, last_error
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            `;

            const values = [
                deliveryData.alert_id,
                deliveryData.customer_id,
                deliveryData.delivery_method,
                deliveryData.delivery_status,
                deliveryData.phone || null,
                deliveryData.email || null,
                deliveryData.webhook_url || null,
                deliveryData.provider || null,
                deliveryData.provider_message_id || null,
                deliveryData.sent_at,
                deliveryData.last_error || null
            ];

            const result = await this.db.query(query, values);
            return result.rows[0].id;

        } catch (error) {
            console.error('Failed to record delivery:', error.message);
            return null;
        }
    }

    /**
     * @dev Deliver alert to all subscribers in a region
     */
    async deliverToRegion(alertData) {
        console.log(`\n📡 Broadcasting alert to region: ${alertData.region}`);

        try {
            // Get all customers in the region with active subscriptions
            const query = `
                SELECT DISTINCT c.*
                FROM customers c
                INNER JOIN subscriptions s ON c.id = s.customer_id
                WHERE s.status = 'active'
                AND s.expires_at > NOW()
                AND (
                    c.metadata->>'region' = $1
                    OR c.metadata->>'regions' @> $2
                )
            `;

            const result = await this.db.query(query, [
                alertData.region,
                JSON.stringify([alertData.region])
            ]);

            console.log(`Found ${result.rows.length} subscribers in region`);

            // Deliver to each customer
            const deliveryPromises = result.rows.map(customer =>
                this.deliverAlert(alertData, customer)
            );

            const results = await Promise.allSettled(deliveryPromises);

            const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failed = results.length - successful;

            console.log(`\n✅ Delivered to ${successful} customers`);
            if (failed > 0) {
                console.log(`❌ Failed to deliver to ${failed} customers`);
            }

            return {
                success: true,
                total: result.rows.length,
                successful,
                failed
            };

        } catch (error) {
            console.error('Regional broadcast error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * @dev Get delivery statistics
     */
    getStats() {
        return {
            ...this.stats,
            success_rate: this.stats.sms_sent > 0
                ? ((this.stats.sms_delivered / this.stats.sms_sent) * 100).toFixed(2) + '%'
                : 'N/A'
        };
    }

    /**
     * @dev Retry failed deliveries
     */
    async retryFailedDeliveries() {
        console.log('\n🔄 Retrying failed deliveries...');

        try {
            const query = `
                SELECT ad.*, ca.*, c.*
                FROM alert_deliveries ad
                INNER JOIN climate_alerts ca ON ad.alert_id = ca.id
                INNER JOIN customers c ON ad.customer_id = c.id
                WHERE ad.delivery_status = 'failed'
                AND ad.delivery_attempts < 3
                AND ad.sent_at > NOW() - INTERVAL '24 hours'
            `;

            const result = await this.db.query(query);

            console.log(`Found ${result.rows.length} failed deliveries to retry`);

            for (const row of result.rows) {
                await this.deliverAlert(
                    {
                        id: row.alert_id,
                        type: row.alert_type,
                        title: row.title,
                        description: row.description,
                        region: row.region,
                        forecast_date: row.forecast_date
                    },
                    {
                        id: row.customer_id,
                        phone: row.phone,
                        email: row.email,
                        language: row.language
                    }
                );

                // Update retry count
                await this.db.query(
                    'UPDATE alert_deliveries SET delivery_attempts = delivery_attempts + 1 WHERE id = $1',
                    [row.id]
                );
            }

            return {
                success: true,
                retried: result.rows.length
            };

        } catch (error) {
            console.error('Retry failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new AlertDeliveryService();
