/**
 * KAI Coin - Backend API Server
 * Express server for the KAI ecosystem
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { createClient } = require('redis');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://127.0.0.1:5175'],
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});
const PORT = process.env.PORT || 3333;

// Configuration
const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://kai_admin:kaipass123@localhost:5433/kai_main',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6380',
  blockchainRpc: process.env.BLOCKCHAIN_RPC || 'http://localhost:8545',
  kaiTokenAddress: process.env.KAI_TOKEN_ADDRESS,
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests' },
});
app.use(limiter);

// Database connection
const pgPool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis client
let redisClient;

// Blockchain provider
let provider;
let kaiToken;

// KAI Token ABI (minimal for balance queries)
const KAI_TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalBurned() view returns (uint256)',
];

// ============================================
// Health Endpoints
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/v1/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {},
  };

  try {
    await pgPool.query('SELECT 1');
    health.services.database = 'connected';
  } catch (e) {
    health.services.database = 'disconnected';
    health.status = 'degraded';
  }

  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.ping();
      health.services.cache = 'connected';
    } else {
      health.services.cache = 'disconnected';
    }
  } catch (e) {
    health.services.cache = 'disconnected';
  }

  try {
    if (provider) {
      await provider.getBlockNumber();
      health.services.blockchain = 'connected';
    } else {
      health.services.blockchain = 'not_configured';
    }
  } catch (e) {
    health.services.blockchain = 'disconnected';
  }

  res.json(health);
});

// ============================================
// Token Endpoints
// ============================================

app.get('/api/v1/token/info', async (req, res) => {
  try {
    if (!kaiToken) {
      return res.status(503).json({ error: 'Token contract not configured' });
    }

    const [name, symbol, decimals, totalSupply, totalBurned] = await Promise.all([
      kaiToken.name(),
      kaiToken.symbol(),
      kaiToken.decimals(),
      kaiToken.totalSupply(),
      kaiToken.totalBurned(),
    ]);

    res.json({
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: ethers.formatEther(totalSupply),
      totalBurned: ethers.formatEther(totalBurned),
      circulatingSupply: ethers.formatEther(totalSupply),
      contractAddress: config.kaiTokenAddress,
    });
  } catch (error) {
    console.error('Token info error:', error);
    res.status(500).json({ error: 'Failed to fetch token info' });
  }
});

app.get('/api/v1/token/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    if (!kaiToken) {
      return res.status(503).json({ error: 'Token contract not configured' });
    }

    // Try cache first
    if (redisClient && redisClient.isOpen) {
      const cached = await redisClient.get(`balance:${address.toLowerCase()}`);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    }

    const balance = await kaiToken.balanceOf(address);
    const result = {
      address,
      balance: ethers.formatEther(balance),
      balanceWei: balance.toString(),
    };

    // Cache for 30 seconds
    if (redisClient && redisClient.isOpen) {
      await redisClient.set(`balance:${address.toLowerCase()}`, JSON.stringify(result), { EX: 30 });
    }

    res.json(result);
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// ============================================
// User Endpoints
// ============================================

app.post('/api/v1/users/register', async (req, res) => {
  try {
    const { walletAddress, region, countryCode, userType } = req.body;

    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    if (!region || !countryCode) {
      return res.status(400).json({ error: 'Region and country code required' });
    }

    const result = await pgPool.query(
      `INSERT INTO users (wallet_address, region, country_code, user_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wallet_address) DO UPDATE SET last_active_at = NOW()
       RETURNING id, wallet_address, region, country_code, user_type, created_at`,
      [walletAddress.toLowerCase(), region, countryCode, userType || 'individual']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.get('/api/v1/users/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const result = await pgPool.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [address.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ============================================
// Disaster Alert Endpoints (Pillar 6)
// ============================================

app.get('/api/v1/disaster/alerts', async (req, res) => {
  try {
    const { region, type, active } = req.query;

    let query = 'SELECT * FROM disaster_alerts WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (region) {
      query += ` AND region ILIKE $${paramIndex++}`;
      params.push(`%${region}%`);
    }
    if (type) {
      query += ` AND disaster_type = $${paramIndex++}`;
      params.push(type);
    }
    if (active === 'true') {
      query += ' AND resolved = false';
    }

    query += ' ORDER BY risk_score DESC, issued_at DESC LIMIT 100';

    const result = await pgPool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.post('/api/v1/disaster/alerts', async (req, res) => {
  try {
    const { disasterType, region, riskScore, metadata } = req.body;

    if (!disasterType || !region || riskScore === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const alertHash = '0x' + Buffer.from(uuidv4()).toString('hex').slice(0, 64);

    const result = await pgPool.query(
      `INSERT INTO disaster_alerts (alert_hash, disaster_type, region, risk_score, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [alertHash, disasterType, region, riskScore, JSON.stringify(metadata || {})]
    );

    const newAlert = result.rows[0];

    // Broadcast alert to all connected clients via WebSocket
    io.emit('alert:new', {
      ...newAlert,
      timestamp: new Date().toISOString(),
    });

    // Also notify region-specific subscribers
    if (region) {
      io.to(`region:${region}`).emit('alert:region', newAlert);
    }

    res.status(201).json(newAlert);
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// ============================================
// Climate Risk Endpoints (Pillar 7)
// ============================================

app.get('/api/v1/climate/risk/:region', async (req, res) => {
  try {
    const { region } = req.params;
    const { year } = req.query;

    let query = `
      SELECT crs.*, cm.name as model_name, cm.risk_type
      FROM climate_risk_scores crs
      JOIN climate_models cm ON cm.id = crs.model_id
      WHERE crs.region ILIKE $1
    `;
    const params = [`%${region}%`];

    if (year) {
      query += ' AND crs.projection_year = $2';
      params.push(year);
    }

    query += ' ORDER BY crs.calculated_at DESC LIMIT 50';

    const result = await pgPool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Climate risk error:', error);
    res.status(500).json({ error: 'Failed to fetch climate risk data' });
  }
});

// ============================================
// Statistics Endpoint
// ============================================

app.get('/api/v1/stats', async (req, res) => {
  try {
    const stats = {};

    // User count
    const userResult = await pgPool.query('SELECT COUNT(*) FROM users');
    stats.totalUsers = parseInt(userResult.rows[0].count);

    // Active alerts
    const alertResult = await pgPool.query('SELECT COUNT(*) FROM disaster_alerts WHERE resolved = false');
    stats.activeAlerts = parseInt(alertResult.rows[0].count);

    // Token stats (if available)
    if (kaiToken) {
      try {
        const totalSupply = await kaiToken.totalSupply();
        const totalBurned = await kaiToken.totalBurned();
        stats.tokenTotalSupply = ethers.formatEther(totalSupply);
        stats.tokenTotalBurned = ethers.formatEther(totalBurned);
      } catch (e) {
        stats.tokenStats = 'unavailable';
      }
    }

    stats.timestamp = new Date().toISOString();

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// Contracts Info Endpoint
// ============================================

app.get('/api/v1/contracts', (req, res) => {
  // Load from deployments if available
  const fs = require('fs');
  const path = require('path');

  try {
    const deploymentsPath = path.join(__dirname, '..', 'deployments', 'localhost-latest.json');
    if (fs.existsSync(deploymentsPath)) {
      const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
      res.json(deployments);
    } else {
      res.json({ message: 'No deployments found', contracts: {} });
    }
  } catch (error) {
    res.json({ message: 'Deployments not available', contracts: {} });
  }
});

// ============================================
// Error Handler
// ============================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================
// WebSocket Events
// ============================================

// Track connected clients
const connectedClients = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  connectedClients.set(socket.id, {
    connectedAt: new Date(),
    subscriptions: [],
  });

  // Send welcome message
  socket.emit('welcome', {
    message: 'Connected to KAI Network',
    timestamp: new Date().toISOString(),
    clientId: socket.id,
  });

  // Broadcast updated client count
  io.emit('clients:count', { count: connectedClients.size });

  // Subscribe to regions
  socket.on('subscribe:region', (region) => {
    const client = connectedClients.get(socket.id);
    if (client && !client.subscriptions.includes(region)) {
      client.subscriptions.push(region);
      socket.join(`region:${region}`);
      console.log(`📍 ${socket.id} subscribed to region: ${region}`);
    }
  });

  // Unsubscribe from regions
  socket.on('unsubscribe:region', (region) => {
    const client = connectedClients.get(socket.id);
    if (client) {
      client.subscriptions = client.subscriptions.filter(r => r !== region);
      socket.leave(`region:${region}`);
    }
  });

  // Request live stats
  socket.on('stats:request', async () => {
    try {
      const stats = await getLiveStats();
      socket.emit('stats:update', stats);
    } catch (error) {
      socket.emit('error', { message: 'Failed to fetch stats' });
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    connectedClients.delete(socket.id);
    io.emit('clients:count', { count: connectedClients.size });
  });
});

// Helper function to get live stats
async function getLiveStats() {
  const stats = {
    timestamp: new Date().toISOString(),
    connectedClients: connectedClients.size,
  };

  try {
    const userResult = await pgPool.query('SELECT COUNT(*) FROM users');
    stats.totalUsers = parseInt(userResult.rows[0].count);
  } catch (e) {
    stats.totalUsers = 0;
  }

  try {
    const alertResult = await pgPool.query('SELECT COUNT(*) FROM disaster_alerts WHERE resolved = false');
    stats.activeAlerts = parseInt(alertResult.rows[0].count);
  } catch (e) {
    stats.activeAlerts = 0;
  }

  if (kaiToken) {
    try {
      const totalSupply = await kaiToken.totalSupply();
      stats.tokenTotalSupply = ethers.formatEther(totalSupply);
    } catch (e) {
      stats.tokenTotalSupply = '0';
    }
  }

  return stats;
}

// Broadcast alert to all clients and specific regions
function broadcastAlert(alert) {
  io.emit('alert:new', alert);
  if (alert.region) {
    io.to(`region:${alert.region}`).emit('alert:region', alert);
  }
}

// Periodic stats broadcast (every 10 seconds)
let statsInterval;
function startStatsBroadcast() {
  statsInterval = setInterval(async () => {
    if (connectedClients.size > 0) {
      try {
        const stats = await getLiveStats();
        io.emit('stats:update', stats);
      } catch (error) {
        console.error('Stats broadcast error:', error.message);
      }
    }
  }, 10000);
}

// ============================================
// Startup
// ============================================

async function start() {
  console.log('🚀 Starting KAI Backend Server...\n');

  // Test database connection
  try {
    await pgPool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
  } catch (error) {
    console.log('⚠️  PostgreSQL not available (will retry on requests)');
  }

  // Connect to Redis
  try {
    redisClient = createClient({ url: config.redisUrl });
    redisClient.on('error', (err) => console.log('Redis error:', err.message));
    await redisClient.connect();
    console.log('✅ Redis connected');
  } catch (error) {
    console.log('⚠️  Redis not available (caching disabled)');
  }

  // Connect to blockchain
  try {
    provider = new ethers.JsonRpcProvider(config.blockchainRpc);
    const network = await provider.getNetwork();
    console.log(`✅ Blockchain connected (Chain ID: ${network.chainId})`);

    // Connect to KAI Token if address is configured
    if (config.kaiTokenAddress) {
      kaiToken = new ethers.Contract(config.kaiTokenAddress, KAI_TOKEN_ABI, provider);
      const name = await kaiToken.name();
      console.log(`✅ KAI Token connected: ${name}`);
    } else {
      console.log('⚠️  KAI Token address not configured');
    }
  } catch (error) {
    console.log('⚠️  Blockchain not available:', error.message);
  }

  // Start server with WebSocket
  server.listen(PORT, () => {
    console.log(`\n🌍 KAI Backend running on http://localhost:${PORT}`);
    console.log(`📡 API endpoints: http://localhost:${PORT}/api/v1/`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`❤️  Health check: http://localhost:${PORT}/api/v1/health\n`);

    // Start broadcasting stats
    startStatsBroadcast();
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  if (redisClient) await redisClient.quit();
  await pgPool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (redisClient) await redisClient.quit();
  await pgPool.end();
  process.exit(0);
});

start();
