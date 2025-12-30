# KAI Coin - Deployment Guide

Complete guide for deploying the KAI ecosystem locally and to production networks.

## Quick Start (Local Development)

```bash
# Start all services
./start.sh

# Or manually:
# 1. Start infrastructure
cd infrastructure/docker
docker compose -f docker-compose.local.yml up -d postgres redis mongodb

# 2. Start blockchain
npx hardhat node

# 3. Deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# 4. Start backend
cd backend
KAI_TOKEN_ADDRESS=<deployed_address> node server.js
```

## Service Ports (Local Development)

| Service      | Port  | Description                    |
|--------------|-------|--------------------------------|
| PostgreSQL   | 5433  | Primary database               |
| Redis        | 6380  | Cache layer                    |
| MongoDB      | 27017 | Document storage               |
| Hardhat      | 8545  | Local blockchain RPC           |
| Backend API  | 3002  | REST API endpoints             |
| Adminer      | 8082  | Database management UI         |
| IPFS         | 5002  | IPFS API (optional)            |
| IPFS Gateway | 8083  | IPFS Gateway (optional)        |
| Nginx        | 8088  | Reverse proxy (optional)       |

## Deployed Contract Addresses (Localhost)

```json
{
  "KaiToken": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "KaiGovernance": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  "KaiDisaster": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  "KaiAgriculture": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  "KaiHealth": "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
  "KaiAI": "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
  "KaiLaw": "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  "KaiClimate": "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"
}
```

## API Endpoints

### Health & Status
- `GET /health` - Basic health check
- `GET /api/v1/health` - Detailed health with service status
- `GET /api/v1/stats` - System statistics
- `GET /api/v1/contracts` - Deployed contract addresses

### Token Operations
- `GET /api/v1/token/info` - Token name, symbol, supply, burned
- `GET /api/v1/token/balance/:address` - Get KAI balance for address

### User Management
- `POST /api/v1/users/register` - Register new user
- `GET /api/v1/users/:address` - Get user profile

### Disaster Alerts (Pillar 6)
- `GET /api/v1/disaster/alerts` - List alerts (filter by region, type, active)
- `POST /api/v1/disaster/alerts` - Create new alert

### Climate Risk (Pillar 7)
- `GET /api/v1/climate/risk/:region` - Get climate risk scores

## Deploying to Polygon Testnet (Amoy)

### Prerequisites
1. Get MATIC from faucet: https://faucet.polygon.technology/
2. Get Polygonscan API key: https://polygonscan.com/apis
3. Configure environment:

```bash
# .env file
PRIVATE_KEY=your_wallet_private_key
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

### Deploy to Testnet

```bash
# Deploy contracts
npx hardhat run scripts/deploy.js --network mumbai

# Verify contracts
npx hardhat verify --network mumbai <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Deploying to Polygon Mainnet

```bash
# .env file
PRIVATE_KEY=your_wallet_private_key
POLYGON_RPC_URL=https://polygon-rpc.com
POLYGONSCAN_API_KEY=your_polygonscan_api_key

# Deploy
npx hardhat run scripts/deploy.js --network polygon
```

## Production Checklist

- [ ] Secure private keys with hardware wallet or KMS
- [ ] Configure proper CORS origins
- [ ] Set up SSL/TLS certificates
- [ ] Configure rate limiting for production
- [ ] Set up monitoring (Prometheus, Grafana)
- [ ] Configure log aggregation (ELK stack)
- [ ] Set up database backups
- [ ] Configure Redis persistence
- [ ] Set up multi-sig for admin roles
- [ ] Audit smart contracts before mainnet

## Stopping Services

```bash
# Stop all services
./stop.sh

# Or manually:
pkill -f "hardhat node"
pkill -f "node server.js"
docker compose -f infrastructure/docker/docker-compose.local.yml down
```

## Logs

```bash
# Hardhat node
tail -f /tmp/hardhat.log

# Backend API
tail -f /tmp/kai-backend.log

# Docker services
docker logs kai-postgres
docker logs kai-redis
docker logs kai-mongodb
```

## Troubleshooting

### Port Conflicts
If you have existing services on default ports, the local setup uses alternative ports:
- PostgreSQL: 5433 instead of 5432
- Redis: 6380 instead of 6379
- Backend: 3002 instead of 3001

### Database Connection Failed
```bash
# Check PostgreSQL status
docker ps | grep kai-postgres

# View PostgreSQL logs
docker logs kai-postgres

# Restart PostgreSQL
docker restart kai-postgres
```

### Blockchain Connection Failed
```bash
# Check if Hardhat node is running
lsof -i :8545

# Restart Hardhat node
pkill -f "hardhat node"
npx hardhat node > /tmp/hardhat.log 2>&1 &
```

### Redis Connection Failed
```bash
# Check Redis status
docker exec kai-redis redis-cli ping

# Restart Redis
docker restart kai-redis
```
