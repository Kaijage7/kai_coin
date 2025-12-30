#!/bin/bash

# KAI Coin - Complete Startup Script
# Starts all services: Blockchain, Backend, Infrastructure

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           KAI COIN - AFRICA RESILIENCE TOKEN                 ║"
echo "║                   Starting All Services                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to wait for a service
wait_for_service() {
    local host=$1
    local port=$2
    local name=$3
    local max_attempts=30
    local attempt=1

    echo -n "Waiting for $name..."
    while ! nc -z $host $port 2>/dev/null; do
        if [ $attempt -ge $max_attempts ]; then
            echo -e " ${RED}FAILED${NC}"
            return 1
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo -e " ${GREEN}OK${NC}"
    return 0
}

# Step 1: Start Docker Infrastructure
echo ""
echo -e "${YELLOW}[1/4] Starting Docker Infrastructure...${NC}"
echo "────────────────────────────────────────"

cd "$PROJECT_DIR/infrastructure/docker"

if docker compose -f docker-compose.local.yml ps 2>/dev/null | grep -q "Up"; then
    echo "Docker services already running"
else
    docker compose -f docker-compose.local.yml up -d postgres redis mongodb
    echo "Docker services started"
fi

cd "$PROJECT_DIR"

# Wait for databases
sleep 3
wait_for_service localhost 5432 "PostgreSQL"
wait_for_service localhost 6379 "Redis"
wait_for_service localhost 27017 "MongoDB"

# Step 2: Initialize Database (if needed)
echo ""
echo -e "${YELLOW}[2/4] Initializing Database...${NC}"
echo "────────────────────────────────────────"

# Check if tables exist
TABLE_EXISTS=$(PGPASSWORD=kaipass123 psql -h localhost -U kai_admin -d kai_main -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users');" 2>/dev/null || echo "f")

if [[ "$TABLE_EXISTS" == *"t"* ]]; then
    echo "Database already initialized"
else
    echo "Creating database schema..."
    PGPASSWORD=kaipass123 psql -h localhost -U kai_admin -d kai_main -f "$PROJECT_DIR/infrastructure/database/init/01_schema.sql" 2>/dev/null || echo "Schema creation skipped (may already exist)"
fi

# Step 3: Start Hardhat Node & Deploy Contracts
echo ""
echo -e "${YELLOW}[3/4] Starting Blockchain & Deploying Contracts...${NC}"
echo "────────────────────────────────────────"

if check_port 8545; then
    echo "Hardhat node already running on port 8545"
else
    echo "Starting Hardhat node..."
    cd "$PROJECT_DIR"
    npx hardhat node > /tmp/hardhat.log 2>&1 &
    HARDHAT_PID=$!
    echo "Hardhat PID: $HARDHAT_PID"
    sleep 5
fi

wait_for_service localhost 8545 "Hardhat Node"

# Deploy contracts if not already deployed
if [ ! -f "$PROJECT_DIR/deployments/localhost-latest.json" ]; then
    echo "Deploying contracts..."
    cd "$PROJECT_DIR"
    npx hardhat run scripts/deploy.js --network localhost
else
    echo "Contracts already deployed"
    cat "$PROJECT_DIR/deployments/localhost-latest.json" | grep -E '"Kai|"deployer'
fi

# Step 4: Start Backend API
echo ""
echo -e "${YELLOW}[4/4] Starting Backend API...${NC}"
echo "────────────────────────────────────────"

cd "$PROJECT_DIR/backend"

# Install backend dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Get KAI Token address from deployment
if [ -f "$PROJECT_DIR/deployments/localhost-latest.json" ]; then
    KAI_TOKEN_ADDRESS=$(cat "$PROJECT_DIR/deployments/localhost-latest.json" | grep -o '"KaiToken": "[^"]*"' | cut -d'"' -f4)
    export KAI_TOKEN_ADDRESS
    echo "KAI Token Address: $KAI_TOKEN_ADDRESS"
fi

if check_port 3001; then
    echo "Backend already running on port 3001"
else
    echo "Starting backend server..."
    KAI_TOKEN_ADDRESS=$KAI_TOKEN_ADDRESS node server.js > /tmp/kai-backend.log 2>&1 &
    BACKEND_PID=$!
    echo "Backend PID: $BACKEND_PID"
    sleep 3
fi

wait_for_service localhost 3001 "Backend API"

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   🎉 KAI COIN IS RUNNING! 🎉                 ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  📡 API Server:     http://localhost:3001                    ║"
echo "║  🔗 Blockchain:     http://localhost:8545                    ║"
echo "║  🗄️  PostgreSQL:    localhost:5432                           ║"
echo "║  📦 Redis:          localhost:6379                           ║"
echo "║  🍃 MongoDB:        localhost:27017                          ║"
echo "║  🔧 Adminer (DB UI): http://localhost:8081                   ║"
echo "║                                                              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                        API Endpoints                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Health:      GET  /api/v1/health                            ║"
echo "║  Token Info:  GET  /api/v1/token/info                        ║"
echo "║  Balance:     GET  /api/v1/token/balance/:address            ║"
echo "║  Register:    POST /api/v1/users/register                    ║"
echo "║  Alerts:      GET  /api/v1/disaster/alerts                   ║"
echo "║  Contracts:   GET  /api/v1/contracts                         ║"
echo "║  Stats:       GET  /api/v1/stats                             ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Test API
echo "Testing API..."
curl -s http://localhost:3001/api/v1/health | head -c 200
echo ""
echo ""
echo -e "${GREEN}All services are running!${NC}"
echo ""
echo "Logs:"
echo "  - Hardhat: tail -f /tmp/hardhat.log"
echo "  - Backend: tail -f /tmp/kai-backend.log"
echo ""
echo "To stop all services: ./stop.sh"
