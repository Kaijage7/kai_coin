/**
 * ⏰ Alert Scheduler Service
 *
 * Automated system that:
 * 1. Runs weather oracle periodically
 * 2. Generates alerts from weather data
 * 3. Delivers alerts to subscribers
 * 4. Tracks delivery metrics
 */

const cron = require('node-cron');
const { Pool } = require('pg');
const WeatherOracle = require('./weather-oracle');
const AlertDelivery = require('./alert-delivery');

class AlertScheduler {
    constructor() {
        this.db = new Pool({
            connectionString: process.env.DATABASE_URL
        });

        this.jobs = [];
        this.isRunning = false;

        this.config = {
            // How often to check weather (default: every hour)
            weatherCheckInterval: process.env.WEATHER_CHECK_INTERVAL || '0 * * * *',

            // How often to retry failed deliveries (default: every 15 min)
            retryInterval: process.env.RETRY_INTERVAL || '*/15 * * * *',

            // How often to send daily digest (default: 6am local time)
            dailyDigestTime: process.env.DAILY_DIGEST_TIME || '0 6 * * *',

            // Max alerts per customer per day
            maxAlertsPerDay: parseInt(process.env.MAX_ALERTS_PER_DAY) || 10
        };

        this.stats = {
            weather_checks: 0,
            alerts_generated: 0,
            alerts_delivered: 0,
            delivery_failures: 0,
            last_weather_check: null,
            last_delivery: null,
            uptime_start: new Date()
        };
    }

    /**
     * @dev Start all scheduled jobs
     */
    start() {
        console.log('\n⏰ Starting Alert Scheduler...');
        console.log('═══════════════════════════════════════\n');

        // Job 1: Weather monitoring (every hour by default)
        const weatherJob = cron.schedule(this.config.weatherCheckInterval, async () => {
            console.log('\n🔄 [Scheduled] Running weather check...');
            await this.runWeatherCheck();
        }, {
            scheduled: true,
            timezone: 'Africa/Dar_es_Salaam'
        });
        this.jobs.push(weatherJob);
        console.log(`✅ Weather monitoring: ${this.config.weatherCheckInterval}`);

        // Job 2: Retry failed deliveries (every 15 min)
        const retryJob = cron.schedule(this.config.retryInterval, async () => {
            console.log('\n🔄 [Scheduled] Retrying failed deliveries...');
            await this.retryFailedDeliveries();
        }, {
            scheduled: true,
            timezone: 'Africa/Dar_es_Salaam'
        });
        this.jobs.push(retryJob);
        console.log(`✅ Retry failed deliveries: ${this.config.retryInterval}`);

        // Job 3: Daily digest (6am by default)
        const digestJob = cron.schedule(this.config.dailyDigestTime, async () => {
            console.log('\n🔄 [Scheduled] Sending daily digest...');
            await this.sendDailyDigest();
        }, {
            scheduled: true,
            timezone: 'Africa/Dar_es_Salaam'
        });
        this.jobs.push(digestJob);
        console.log(`✅ Daily digest: ${this.config.dailyDigestTime}`);

        // Job 4: Subscription expiry check (daily at midnight)
        const expiryJob = cron.schedule('0 0 * * *', async () => {
            console.log('\n🔄 [Scheduled] Checking subscription expiries...');
            await this.checkSubscriptionExpiries();
        }, {
            scheduled: true,
            timezone: 'Africa/Dar_es_Salaam'
        });
        this.jobs.push(expiryJob);
        console.log(`✅ Subscription expiry check: Daily at midnight`);

        this.isRunning = true;
        console.log('\n═══════════════════════════════════════');
        console.log('✅ Alert Scheduler started successfully!');
        console.log(`   Jobs running: ${this.jobs.length}`);
        console.log(`   Timezone: Africa/Dar_es_Salaam`);
        console.log('═══════════════════════════════════════\n');
    }

    /**
     * @dev Stop all scheduled jobs
     */
    stop() {
        console.log('\n⏹️  Stopping Alert Scheduler...');
        this.jobs.forEach(job => job.stop());
        this.jobs = [];
        this.isRunning = false;
        console.log('✅ Alert Scheduler stopped');
    }

    /**
     * @dev Run weather check and generate alerts
     */
    async runWeatherCheck() {
        const startTime = Date.now();

        try {
            console.log('\n🌤️  Running Weather Check');
            console.log('─────────────────────────────────────');

            // 1. Fetch weather and generate alerts
            const alerts = await WeatherOracle.monitorAllRegions();

            this.stats.weather_checks++;
            this.stats.last_weather_check = new Date();
            this.stats.alerts_generated += alerts.length;

            if (alerts.length === 0) {
                console.log('✅ No new alerts generated');
                return { success: true, alerts: 0, delivered: 0 };
            }

            console.log(`\n📢 ${alerts.length} alerts generated, starting delivery...`);

            // 2. Deliver alerts to subscribers
            let deliveredCount = 0;
            let failedCount = 0;

            for (const alert of alerts) {
                try {
                    const result = await this.deliverAlertToSubscribers(alert);
                    deliveredCount += result.successful;
                    failedCount += result.failed;
                } catch (error) {
                    console.error(`Failed to deliver alert ${alert.id}:`, error.message);
                    failedCount++;
                }
            }

            this.stats.alerts_delivered += deliveredCount;
            this.stats.delivery_failures += failedCount;
            this.stats.last_delivery = new Date();

            const duration = Date.now() - startTime;
            console.log(`\n✅ Weather check complete in ${duration}ms`);
            console.log(`   Alerts: ${alerts.length}, Delivered: ${deliveredCount}, Failed: ${failedCount}`);

            return {
                success: true,
                alerts: alerts.length,
                delivered: deliveredCount,
                failed: failedCount,
                duration
            };

        } catch (error) {
            console.error('❌ Weather check failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * @dev Deliver a single alert to all relevant subscribers
     */
    async deliverAlertToSubscribers(alert) {
        try {
            // Get subscribers in the alert region with active subscriptions
            const query = `
                SELECT DISTINCT c.*, s.plan, s.alerts_used, s.alerts_included
                FROM customers c
                INNER JOIN subscriptions s ON c.id = s.customer_id
                WHERE s.status = 'active'
                AND s.expires_at > NOW()
                AND (
                    c.metadata->>'region' = $1
                    OR c.metadata->>'regions' @> $2
                    OR s.plan = 'enterprise'
                )
                AND (s.alerts_included IS NULL OR s.alerts_used < s.alerts_included)
            `;

            const result = await this.db.query(query, [
                alert.region,
                JSON.stringify([alert.region])
            ]);

            const subscribers = result.rows;
            console.log(`\n📬 Delivering "${alert.type}" alert to ${subscribers.length} subscribers in ${alert.region}`);

            let successful = 0;
            let failed = 0;

            for (const subscriber of subscribers) {
                try {
                    // Check daily limit
                    const todayAlerts = await this.getCustomerAlertsToday(subscriber.id);
                    if (todayAlerts >= this.config.maxAlertsPerDay) {
                        console.log(`⚠️  ${subscriber.phone}: Daily limit reached (${todayAlerts}/${this.config.maxAlertsPerDay})`);
                        continue;
                    }

                    // Deliver alert
                    const deliveryResult = await AlertDelivery.deliverAlert(
                        {
                            id: alert.id,
                            type: alert.type,
                            title: alert.title,
                            description: alert.description,
                            region: alert.region,
                            severity: alert.severity,
                            forecast_date: alert.forecast_date,
                            recommendations: alert.recommendations
                        },
                        {
                            id: subscriber.id,
                            phone: subscriber.phone,
                            email: subscriber.email,
                            language: subscriber.metadata?.language || 'sw',
                            wallet_address: subscriber.wallet_address
                        }
                    );

                    if (deliveryResult.success) {
                        successful++;

                        // Update alerts_used counter
                        await this.db.query(
                            'UPDATE subscriptions SET alerts_used = alerts_used + 1 WHERE customer_id = $1 AND status = $2',
                            [subscriber.id, 'active']
                        );
                    } else {
                        failed++;
                    }

                } catch (error) {
                    console.error(`Failed to deliver to ${subscriber.phone}:`, error.message);
                    failed++;
                }
            }

            return { successful, failed, total: subscribers.length };

        } catch (error) {
            console.error('Delivery error:', error.message);
            return { successful: 0, failed: 0, error: error.message };
        }
    }

    /**
     * @dev Get number of alerts sent to customer today
     */
    async getCustomerAlertsToday(customerId) {
        try {
            const result = await this.db.query(`
                SELECT COUNT(*) as count
                FROM alert_deliveries
                WHERE customer_id = $1
                AND DATE(sent_at) = CURRENT_DATE
                AND delivery_status IN ('sent', 'delivered')
            `, [customerId]);

            return parseInt(result.rows[0].count);
        } catch (error) {
            return 0;
        }
    }

    /**
     * @dev Retry failed deliveries
     */
    async retryFailedDeliveries() {
        try {
            const result = await AlertDelivery.retryFailedDeliveries();
            console.log(`✅ Retried ${result.retried || 0} failed deliveries`);
            return result;
        } catch (error) {
            console.error('Retry failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * @dev Send daily weather digest to premium subscribers
     */
    async sendDailyDigest() {
        try {
            console.log('\n📰 Sending Daily Weather Digest');
            console.log('─────────────────────────────────────');

            // Get premium/enterprise subscribers
            const query = `
                SELECT DISTINCT c.*, s.plan
                FROM customers c
                INNER JOIN subscriptions s ON c.id = s.customer_id
                WHERE s.status = 'active'
                AND s.plan IN ('premium', 'enterprise')
                AND s.expires_at > NOW()
            `;

            const result = await this.db.query(query);
            const subscribers = result.rows;

            console.log(`📤 Sending digest to ${subscribers.length} premium subscribers`);

            // Get today's weather summary for all regions
            const weatherSummary = await this.getWeatherSummary();

            let sent = 0;
            for (const subscriber of subscribers) {
                try {
                    const message = this.formatDailyDigest(weatherSummary, subscriber);

                    // Send via SMS (shortened version)
                    if (subscriber.phone) {
                        await AlertDelivery.sendSMS(
                            { title: 'KAI Daily Digest', description: message },
                            subscriber
                        );
                        sent++;
                    }
                } catch (error) {
                    console.error(`Failed to send digest to ${subscriber.phone}:`, error.message);
                }
            }

            console.log(`✅ Daily digest sent to ${sent}/${subscribers.length} subscribers`);
            return { success: true, sent };

        } catch (error) {
            console.error('Daily digest failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * @dev Get weather summary for all regions
     */
    async getWeatherSummary() {
        try {
            const result = await this.db.query(`
                SELECT region, alert_type, severity, COUNT(*) as count
                FROM climate_alerts
                WHERE status = 'active'
                AND issued_at > NOW() - INTERVAL '24 hours'
                GROUP BY region, alert_type, severity
                ORDER BY region, severity DESC
            `);

            return result.rows;
        } catch (error) {
            return [];
        }
    }

    /**
     * @dev Format daily digest message
     */
    formatDailyDigest(summary, subscriber) {
        const lang = subscriber.metadata?.language || 'sw';

        if (lang === 'sw') {
            let message = '🌤️ HALI YA HEWA LEO\n\n';

            if (summary.length === 0) {
                message += '✅ Hakuna tahadhari za hali ya hewa leo.\n';
                message += 'Siku njema ya kilimo!\n';
            } else {
                message += `⚠️ Tahadhari ${summary.length}:\n\n`;
                summary.forEach(s => {
                    message += `• ${s.region}: ${s.alert_type} (${s.severity})\n`;
                });
            }

            message += '\n- KAI Intelligence';
            return message;
        }

        // English
        let message = '🌤️ TODAY\'S WEATHER SUMMARY\n\n';

        if (summary.length === 0) {
            message += '✅ No weather alerts today.\n';
            message += 'Have a great farming day!\n';
        } else {
            message += `⚠️ ${summary.length} Active Alerts:\n\n`;
            summary.forEach(s => {
                message += `• ${s.region}: ${s.alert_type} (${s.severity})\n`;
            });
        }

        message += '\n- KAI Intelligence';
        return message;
    }

    /**
     * @dev Check and handle subscription expiries
     */
    async checkSubscriptionExpiries() {
        try {
            console.log('\n📅 Checking Subscription Expiries');
            console.log('─────────────────────────────────────');

            // Find subscriptions expiring in next 3 days
            const expiringQuery = `
                SELECT s.*, c.phone, c.email
                FROM subscriptions s
                INNER JOIN customers c ON s.customer_id = c.id
                WHERE s.status = 'active'
                AND s.expires_at BETWEEN NOW() AND NOW() + INTERVAL '3 days'
                AND s.auto_renew = false
            `;

            const expiring = await this.db.query(expiringQuery);
            console.log(`📢 ${expiring.rows.length} subscriptions expiring soon`);

            // Send reminder to each
            for (const sub of expiring.rows) {
                const daysLeft = Math.ceil((new Date(sub.expires_at) - new Date()) / (1000 * 60 * 60 * 24));

                const message = `⚠️ KAI REMINDER\n\n` +
                    `Your ${sub.plan} subscription expires in ${daysLeft} days.\n\n` +
                    `Renew now to keep getting alerts!\n` +
                    `Reply RENEW or visit kai.io/renew\n\n` +
                    `- KAI Intelligence`;

                if (sub.phone) {
                    try {
                        await AlertDelivery.sendSMS({ title: 'Subscription Expiring', description: message }, sub);
                    } catch (e) {
                        console.error(`Failed to notify ${sub.phone}:`, e.message);
                    }
                }
            }

            // Expire subscriptions that have passed
            const expireResult = await this.db.query(`
                UPDATE subscriptions
                SET status = 'expired'
                WHERE status = 'active'
                AND expires_at < NOW()
                RETURNING id
            `);

            console.log(`📛 ${expireResult.rowCount} subscriptions expired`);

            return {
                success: true,
                expiring_soon: expiring.rows.length,
                expired: expireResult.rowCount
            };

        } catch (error) {
            console.error('Expiry check failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * @dev Run weather check immediately (manual trigger)
     */
    async runNow() {
        console.log('\n⚡ Manual weather check triggered...');
        return await this.runWeatherCheck();
    }

    /**
     * @dev Get scheduler statistics
     */
    getStats() {
        const uptime = Date.now() - this.stats.uptime_start.getTime();
        const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
        const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

        return {
            ...this.stats,
            is_running: this.isRunning,
            jobs_count: this.jobs.length,
            uptime: `${uptimeHours}h ${uptimeMinutes}m`,
            delivery_success_rate: this.stats.alerts_delivered > 0
                ? ((this.stats.alerts_delivered / (this.stats.alerts_delivered + this.stats.delivery_failures)) * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }
}

module.exports = new AlertScheduler();
