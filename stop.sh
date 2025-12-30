#!/bin/bash

# KAI Coin - Stop Script
# Stops all running services

echo "Stopping KAI Coin services..."

# Stop backend
echo "Stopping backend API..."
pkill -f "node server.js" 2>/dev/null || echo "Backend not running"

# Stop Hardhat node
echo "Stopping Hardhat node..."
pkill -f "hardhat node" 2>/dev/null || echo "Hardhat not running"

# Stop Docker services
echo "Stopping Docker services..."
cd "$(dirname "$0")/infrastructure/docker"
docker compose -f docker-compose.local.yml down 2>/dev/null || echo "Docker services not running"

echo ""
echo "All services stopped!"
