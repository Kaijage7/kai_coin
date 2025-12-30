/**
 * KAI Coin - Main API Gateway Service
 * Continental-scale backend for 2 billion users
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { ethers } from 'ethers';

// Configuration
const config = {
  port: process.env.PORT || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  kafkaBrokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  blockchainRpc: process.env.BLOCKCHAIN_RPC,
  jwtSecret: process.env.JWT_SECRET,
};

// Initialize Express
const app: Express = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Database connection pool
const pgPool = new Pool({
  connectionString: config.databaseUrl,
  max: 100, // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis client
let redisClient: ReturnType<typeof createClient>;

// Kafka producer
const kafka = new Kafka({
  clientId: 'kai-api',
  brokers: config.kafkaBrokers,
});
const kafkaProducer = kafka.producer();

// Blockchain provider
let blockchainProvider: ethers.JsonRpcProvider;

// Health check endpoints
app.get('/health/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req: Request, res: Response) => {
  try {
    // Check database
    await pgPool.query('SELECT 1');

    // Check Redis
    await redisClient.ping();

    res.status(200).json({
      status: 'ready',
      services: {
        database: 'connected',
        cache: 'connected',
        kafka: 'connected',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API Routes
// ============================================

// User Management
app.post('/api/v1/users/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, region, countryCode, userType } = req.body;

    // Validate wallet address
    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Insert user
    const result = await pgPool.query(
      `INSERT INTO users (wallet_address, region, country_code, user_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wallet_address) DO UPDATE SET last_active_at = NOW()
       RETURNING id, wallet_address, region, country_code, user_type, created_at`,
      [walletAddress.toLowerCase(), region, countryCode, userType || 'individual']
    );

    // Publish event to Kafka
    await kafkaProducer.send({
      topic: 'kai.users.events',
      messages: [{
        key: walletAddress,
        value: JSON.stringify({
          event: 'USER_REGISTERED',
          data: result.rows[0],
          timestamp: new Date().toISOString(),
        }),
      }],
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Pillar 1: Governance
app.get('/api/v1/governance/proposals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM governance_proposals';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pgPool.query(query, params);

    res.json({
      proposals: result.rows,
      pagination: { limit, offset, total: result.rowCount },
    });
  } catch (error) {
    next(error);
  }
});

// Pillar 3: Agriculture - Farmer Registration
app.post('/api/v1/agriculture/farmers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, walletAddress, farmRegion, farmSize, latitude, longitude } = req.body;

    const result = await pgPool.query(
      `INSERT INTO farmers (user_id, wallet_address, farm_region, farm_size_hectares, farm_location)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326))
       RETURNING *`,
      [userId, walletAddress.toLowerCase(), farmRegion, farmSize, longitude, latitude]
    );

    await kafkaProducer.send({
      topic: 'kai.agriculture.events',
      messages: [{
        key: walletAddress,
        value: JSON.stringify({
          event: 'FARMER_REGISTERED',
          data: result.rows[0],
          timestamp: new Date().toISOString(),
        }),
      }],
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Pillar 6: Disaster - Subscribe to Alerts
app.post('/api/v1/disaster/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subscriberId, walletAddress, tier } = req.body;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days subscription

    const result = await pgPool.query(
      `INSERT INTO disaster_subscriptions (subscriber_id, wallet_address, tier, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [subscriberId, walletAddress.toLowerCase(), tier, expiresAt]
    );

    // Cache subscription status
    await redisClient.set(
      `disaster:subscription:${walletAddress.toLowerCase()}`,
      JSON.stringify({ tier, expiresAt }),
      { EX: 30 * 24 * 60 * 60 } // 30 days TTL
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Pillar 6: Disaster - Get Active Alerts
app.get('/api/v1/disaster/alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region, type, active = 'true' } = req.query;

    // Try cache first
    const cacheKey = `disaster:alerts:${region || 'all'}:${type || 'all'}:${active}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    let query = 'SELECT * FROM disaster_alerts WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (region) {
      query += ` AND region = $${paramIndex++}`;
      params.push(region);
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

    // Cache for 5 minutes
    await redisClient.set(cacheKey, JSON.stringify(result.rows), { EX: 300 });

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Pillar 7: Climate - Get Risk Scores
app.get('/api/v1/climate/risk/:region', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { region } = req.params;
    const { projectionYear } = req.query;

    const result = await pgPool.query(
      `SELECT crs.*, cm.name as model_name, cm.risk_type
       FROM climate_risk_scores crs
       JOIN climate_models cm ON cm.id = crs.model_id
       WHERE crs.region ILIKE $1
       ${projectionYear ? 'AND crs.projection_year = $2' : ''}
       ORDER BY crs.calculated_at DESC
       LIMIT 50`,
      projectionYear ? [`%${region}%`, projectionYear] : [`%${region}%`]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Blockchain interaction - Get token balance
app.get('/api/v1/token/balance/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    // Cache key
    const cacheKey = `token:balance:${address.toLowerCase()}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Get from blockchain
    const kaiTokenABI = ['function balanceOf(address) view returns (uint256)'];
    const kaiTokenAddress = process.env.KAI_TOKEN_ADDRESS;

    if (!kaiTokenAddress) {
      return res.status(500).json({ error: 'Token address not configured' });
    }

    const contract = new ethers.Contract(kaiTokenAddress, kaiTokenABI, blockchainProvider);
    const balance = await contract.balanceOf(address);

    const result = {
      address,
      balance: ethers.formatEther(balance),
      balanceWei: balance.toString(),
    };

    // Cache for 30 seconds
    await redisClient.set(cacheKey, JSON.stringify(result), { EX: 30 });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);

  res.status(500).json({
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down gracefully...');

  await kafkaProducer.disconnect();
  await redisClient.quit();
  await pgPool.end();

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
  try {
    // Connect to Redis
    redisClient = createClient({ url: config.redisUrl });
    redisClient.on('error', (err) => console.error('Redis error:', err));
    await redisClient.connect();
    console.log('Connected to Redis');

    // Connect to Kafka
    await kafkaProducer.connect();
    console.log('Connected to Kafka');

    // Connect to blockchain
    if (config.blockchainRpc) {
      blockchainProvider = new ethers.JsonRpcProvider(config.blockchainRpc);
      console.log('Connected to blockchain RPC');
    }

    // Test database connection
    await pgPool.query('SELECT 1');
    console.log('Connected to PostgreSQL');

    // Start server
    app.listen(config.port, () => {
      console.log(`KAI API server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
