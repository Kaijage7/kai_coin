/**
 * 🔐 Secure Wallet Generator for KAI Coin Deployment
 *
 * This script generates a new secure wallet for deployment.
 * Run: node scripts/generate-wallet.js
 *
 * IMPORTANT:
 * - Never commit the generated private key to git
 * - Store it securely (password manager, hardware wallet backup)
 * - Fund the address with testnet MATIC before deployment
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

console.log('\n🔐 KAI Coin Secure Wallet Generator\n');
console.log('═'.repeat(60));

// Generate new random wallet
const wallet = ethers.Wallet.createRandom();

// Display wallet information
console.log('\n✅ NEW WALLET GENERATED:\n');
console.log(`📍 Address:     ${wallet.address}`);
console.log(`🔑 Private Key: ${wallet.privateKey}`);
console.log(`📝 Mnemonic:    ${wallet.mnemonic.phrase}`);
console.log('\n═'.repeat(60));

// Security warnings
console.log('\n⚠️  SECURITY WARNINGS:\n');
console.log('1. 🔴 NEVER share your private key with anyone');
console.log('2. 🔴 NEVER commit your private key to git');
console.log('3. 🔴 Store mnemonic phrase in a secure location (offline)');
console.log('4. 🔵 Fund this address with testnet MATIC before deploying');
console.log('5. 🔵 For mainnet, use a hardware wallet (Ledger/Trezor)');

// Create .env.example if it doesn't exist
const envExamplePath = path.join(__dirname, '..', '.env.example');
const envExampleContent = `# KAI Coin Deployment Configuration
# Copy this to .env and fill in your values

# Deployer wallet private key (generate with: node scripts/generate-wallet.js)
# NEVER commit your actual .env file to git!
PRIVATE_KEY=your_private_key_here

# Polygon Amoy Testnet RPC
AMOY_RPC_URL=https://rpc-amoy.polygon.technology

# Polygon Mainnet RPC (for production)
POLYGON_RPC_URL=https://polygon-rpc.com

# Polygonscan API key for contract verification
# Get from: https://polygonscan.com/apis
POLYGONSCAN_API_KEY=your_api_key_here

# Database URL (for backend)
DATABASE_URL=postgresql://username:password@host:port/database

# Redis URL (for backend)
REDIS_URL=redis://localhost:6380

# Gas reporting
REPORT_GAS=true
`;

try {
  fs.writeFileSync(envExamplePath, envExampleContent);
  console.log(`\n✅ Created .env.example template`);
} catch (error) {
  console.log(`\n⚠️  Could not create .env.example: ${error.message}`);
}

// Prompt to update .env
console.log('\n📝 NEXT STEPS:\n');
console.log('1. Copy the private key above');
console.log('2. Update your .env file:');
console.log(`   PRIVATE_KEY=${wallet.privateKey}`);
console.log('3. Fund the address with testnet MATIC:');
console.log(`   https://faucet.polygon.technology/`);
console.log('4. Verify balance before deployment:');
console.log(`   https://amoy.polygonscan.com/address/${wallet.address}`);

console.log('\n═'.repeat(60));
console.log('\n💾 Save your mnemonic phrase offline for recovery!\n');

// Option to automatically update .env (with user confirmation)
console.log('⚠️  To automatically update .env, run:');
console.log(`   echo 'PRIVATE_KEY=${wallet.privateKey}' >> .env\n`);
