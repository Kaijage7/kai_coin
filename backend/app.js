/**
 * 🚀 KAI Intelligence - Main Application
 *
 * Complete integrated system:
 * - Payment processing (M-Pesa, Stripe, Paystack)
 * - Weather monitoring & alerts
 * - SMS/WebSocket delivery
 * - Revenue tracking
 */

require('dotenv').config();

// ============================================
// Environment Validation (Fail Fast)
// ============================================

const ENV_CONFIG = {
    // Critical - app won't start without these
    required: {
        DATABASE_URL: 'PostgreSQL connection string for data storage'
    },
    // Important - features will be disabled without these
    recommended: {
        OPENWEATHER_API_KEY: 'Weather data for climate alerts',
        MPESA_API_KEY: 'M-Pesa payment processing',
        AFRICASTALKING_API_KEY: 'SMS alert delivery'
    }
};

function validateEnvironment() {
    const missing = [];
    const warnings = [];

    // Check required variables
    for (const [key, description] of Object.entries(ENV_CONFIG.required)) {
        if (!process.env[key]) {
            missing.push(`  ❌ ${key}: ${description}`);
        }
    }

    // Check recommended variables
    for (const [key, description] of Object.entries(ENV_CONFIG.recommended)) {
        if (!process.env[key]) {
            warnings.push(`  ⚠️  ${key}: ${description}`);
        }
    }

    // Fail if critical vars missing
    if (missing.length > 0) {
        console.error('\n╔═══════════════════════════════════════════════════════════╗');
        console.error('║          ❌ MISSING REQUIRED CONFIGURATION ❌              ║');
        console.error('╚═══════════════════════════════════════════════════════════╝\n');
        console.error('The following environment variables are required:\n');
        missing.forEach(msg => console.error(msg));
        console.error('\nSet these in your .env file and restart the server.\n');
        process.exit(1);
    }

    // Warn about optional vars
    if (warnings.length > 0 && process.env.NODE_ENV !== 'test') {
        console.warn('\n⚠️  Missing recommended configuration:');
        warnings.forEach(msg => console.warn(msg));
        console.warn('Some features may be limited.\n');
    }
}

// Run validation immediately
validateEnvironment();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

// Services
const AlertScheduler = require('./services/alert-scheduler');
const AlertDelivery = require('./services/alert-delivery');
const WeatherOracle = require('./services/weather-oracle');

// Routes
const apiRoutes = require('./routes/api');
const dashboardRoutes = require('./routes/dashboard');
const { setupRoutes: setupWhatsAppRoutes } = require('./services/whatsapp-bot');

const app = express();
const server = http.createServer(app);

// WebSocket setup
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:3000', 'http://localhost:5173', '*'],
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3333;

// ============================================
// Middleware
// ============================================

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    message: { error: 'Too many requests' }
});
app.use(limiter);

// ============================================
// Routes
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            scheduler: AlertScheduler.isRunning ? 'running' : 'stopped',
            websocket: io.engine.clientsCount
        }
    });
});

// API routes (payments, alerts, revenue)
app.use('/api', apiRoutes);

// Customer dashboard routes
app.use('/api/dashboard', dashboardRoutes);

// WhatsApp bot routes
setupWhatsAppRoutes(app);

// System stats
app.get('/api/system/stats', (req, res) => {
    res.json({
        scheduler: AlertScheduler.getStats(),
        delivery: AlertDelivery.getStats(),
        oracle: WeatherOracle.getStats(),
        websocket: {
            connected_clients: io.engine.clientsCount
        }
    });
});

// Manual weather check trigger
app.post('/api/system/weather-check', async (req, res) => {
    try {
        const result = await AlertScheduler.runNow();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dashboard endpoint
app.get('/api/dashboard', async (req, res) => {
    try {
        const { Pool } = require('pg');
        const db = new Pool({ connectionString: process.env.DATABASE_URL });

        // Get summary stats
        const [revenueResult, customersResult, alertsResult, subscriptionsResult] = await Promise.all([
            db.query(`SELECT COALESCE(SUM(usd_equivalent), 0) as total FROM revenue WHERE DATE(created_at) = CURRENT_DATE`),
            db.query(`SELECT COUNT(*) as total FROM customers`),
            db.query(`SELECT COUNT(*) as total FROM climate_alerts WHERE status = 'active'`),
            db.query(`SELECT COUNT(*) as total FROM subscriptions WHERE status = 'active'`)
        ]);

        res.json({
            today_revenue: parseFloat(revenueResult.rows[0].total),
            total_customers: parseInt(customersResult.rows[0].total),
            active_alerts: parseInt(alertsResult.rows[0].total),
            active_subscriptions: parseInt(subscriptionsResult.rows[0].total),
            scheduler: AlertScheduler.getStats(),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// WebSocket Events
// ============================================

io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Subscribe to regions
    socket.on('subscribe:region', (region) => {
        socket.join(`region:${region}`);
        console.log(`📍 ${socket.id} subscribed to ${region}`);
    });

    // Subscribe to user-specific alerts
    socket.on('subscribe:user', (walletAddress) => {
        socket.join(`user:${walletAddress}`);
        console.log(`👤 ${socket.id} subscribed as ${walletAddress.slice(0, 8)}...`);
    });

    // Request stats
    socket.on('stats:request', () => {
        socket.emit('stats:update', {
            scheduler: AlertScheduler.getStats(),
            oracle: WeatherOracle.getStats(),
            timestamp: new Date().toISOString()
        });
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// Connect WebSocket to alert delivery
AlertDelivery.setWebSocket(io);

// ============================================
// Error Handling
// ============================================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ============================================
// Startup
// ============================================

async function start() {
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║     🌍 KAI INTELLIGENCE - CLIMATE ALERT SYSTEM 🌍        ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('\n');

    // Check configuration
    console.log('📋 Configuration Check:');
    console.log('─────────────────────────────────────────');
    console.log(`   Database: ${process.env.DATABASE_URL ? '✅' : '❌'}`);
    console.log(`   M-Pesa: ${process.env.MPESA_API_KEY ? '✅' : '⚠️  Not configured'}`);
    console.log(`   OpenWeather: ${process.env.OPENWEATHER_API_KEY ? '✅' : '⚠️  Not configured'}`);
    console.log(`   Africa's Talking SMS: ${process.env.AFRICASTALKING_API_KEY ? '✅' : '⚠️  Not configured'}`);
    console.log('');

    // Start HTTP server
    server.listen(PORT, () => {
        console.log('🌐 Server Status:');
        console.log('─────────────────────────────────────────');
        console.log(`   HTTP: http://localhost:${PORT}`);
        console.log(`   WebSocket: ws://localhost:${PORT}`);
        console.log(`   Health: http://localhost:${PORT}/health`);
        console.log(`   Dashboard: http://localhost:${PORT}/api/dashboard`);
        console.log('');
    });

    // Start alert scheduler
    if (process.env.ENABLE_SCHEDULER !== 'false') {
        AlertScheduler.start();
    } else {
        console.log('⚠️  Scheduler disabled (ENABLE_SCHEDULER=false)');
    }

    // Run initial weather check (optional)
    if (process.env.RUN_INITIAL_CHECK === 'true') {
        console.log('\n🔄 Running initial weather check...');
        await AlertScheduler.runNow();
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ KAI Intelligence System Started Successfully!');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('📱 Ready to accept payments and send alerts!');
    console.log('💰 Revenue API: POST /api/climate/alert/buy');
    console.log('📊 Dashboard: GET /api/dashboard');
    console.log('🌤️  Manual check: POST /api/system/weather-check');
    console.log('\n');
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n⏹️  Shutting down...');
    AlertScheduler.stop();
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n⏹️  Shutting down...');
    AlertScheduler.stop();
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

// Start the application
start().catch(err => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
});

module.exports = { app, server, io };
