# KAI - Resilience Token API Documentation

## Base URL
```
http://localhost:3333/api/v1
```

## WebSocket
```
ws://localhost:3333
```

---

## Health & Status

### GET /health
Simple health check.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-29T10:00:00.000Z"
}
```

### GET /api/v1/health
Detailed health check with service status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-29T10:00:00.000Z",
  "services": {
    "database": "connected",
    "cache": "connected",
    "blockchain": "connected"
  }
}
```

### GET /api/v1/stats
System statistics.

**Response:**
```json
{
  "totalUsers": 0,
  "activeAlerts": 0,
  "tokenTotalSupply": "100000000.0",
  "tokenTotalBurned": "0.0",
  "timestamp": "2025-12-29T10:00:00.000Z"
}
```

---

## Token Endpoints

### GET /api/v1/token/info
Get KAI token information.

**Response:**
```json
{
  "name": "KAI",
  "symbol": "KAI",
  "decimals": 18,
  "totalSupply": "100000000.0",
  "totalBurned": "0.0",
  "circulatingSupply": "100000000.0",
  "contractAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
}
```

### GET /api/v1/token/balance/:address
Get KAI token balance for an address.

**Parameters:**
- `address` (path) - Ethereum address

**Response:**
```json
{
  "address": "0x...",
  "balance": "1000.0",
  "balanceWei": "1000000000000000000000"
}
```

---

## User Endpoints

### POST /api/v1/users/register
Register a new user.

**Request Body:**
```json
{
  "walletAddress": "0x...",
  "region": "East Africa",
  "countryCode": "KE",
  "userType": "individual"
}
```

**Response:**
```json
{
  "id": "uuid",
  "wallet_address": "0x...",
  "region": "East Africa",
  "country_code": "KE",
  "user_type": "individual",
  "created_at": "2025-12-29T10:00:00.000Z"
}
```

### GET /api/v1/users/:address
Get user by wallet address.

**Parameters:**
- `address` (path) - Ethereum address

---

## Disaster Alert Endpoints (Pillar 6)

### GET /api/v1/disaster/alerts
List disaster alerts.

**Query Parameters:**
- `region` (optional) - Filter by region
- `type` (optional) - Filter by disaster type
- `active` (optional) - Set to "true" for active alerts only

**Response:**
```json
[
  {
    "id": 1,
    "alert_hash": "0x...",
    "disaster_type": "flood",
    "region": "East Africa",
    "risk_score": 75,
    "resolved": false,
    "issued_at": "2025-12-29T10:00:00.000Z"
  }
]
```

### POST /api/v1/disaster/alerts
Create a new disaster alert.

**Request Body:**
```json
{
  "disasterType": "flood",
  "region": "East Africa",
  "riskScore": 75,
  "metadata": {}
}
```

**Disaster Types:**
- `flood` - Flooding
- `drought` - Drought
- `cyclone` - Cyclone/Hurricane
- `earthquake` - Earthquake
- `wildfire` - Wildfire
- `locusts` - Locust Swarm
- `disease` - Disease Outbreak

---

## Climate Risk Endpoints (Pillar 7)

### GET /api/v1/climate/risk/:region
Get climate risk scores for a region.

**Parameters:**
- `region` (path) - Region name

**Query Parameters:**
- `year` (optional) - Projection year

---

## Contract Information

### GET /api/v1/contracts
Get deployed contract addresses.

**Response:**
```json
{
  "network": "localhost",
  "timestamp": "2025-12-29T10:00:00.000Z",
  "deployer": "0x...",
  "contracts": {
    "KaiToken": "0x...",
    "KaiGovernance": "0x...",
    "KaiDisaster": "0x...",
    "KaiAgriculture": "0x...",
    "KaiHealth": "0x...",
    "KaiAI": "0x...",
    "KaiLaw": "0x...",
    "KaiClimate": "0x..."
  }
}
```

---

## WebSocket Events

### Connection
```javascript
import { io } from 'socket.io-client'
const socket = io('http://localhost:3333')
```

### Events from Server

| Event | Description | Payload |
|-------|-------------|---------|
| `welcome` | Connection established | `{ message, timestamp, clientId }` |
| `clients:count` | Connected client count | `{ count }` |
| `stats:update` | Live statistics | `{ totalUsers, activeAlerts, ... }` |
| `alert:new` | New disaster alert | Alert object |
| `alert:region` | Regional alert | Alert object |

### Events to Server

| Event | Description | Payload |
|-------|-------------|---------|
| `subscribe:region` | Subscribe to region alerts | Region string |
| `unsubscribe:region` | Unsubscribe from region | Region string |
| `stats:request` | Request current stats | None |

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error message description"
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error
- `503` - Service Unavailable

---

## Rate Limiting

- **Limit:** 1000 requests per 15 minutes
- **Headers:** Standard rate limit headers returned

---

## 7 Pillars of Resilience

| Pillar | Contract | Description |
|--------|----------|-------------|
| 1 | KaiGovernance | Decentralized decision making |
| 2 | KaiLaw | Evidence registry & legal protection |
| 3 | KaiAgriculture | Parametric insurance for farmers |
| 4 | KaiHealth | Food safety & inspections |
| 5 | KaiAI | Decentralized AI marketplace |
| 6 | KaiDisaster | Early warning & response |
| 7 | KaiClimate | Risk modeling & adaptation |
