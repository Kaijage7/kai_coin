require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// ✅ FIX: Validate private key and use development fallback if invalid
const PRIVATE_KEY_ENV = process.env.PRIVATE_KEY || "";
const isValidPrivateKey = PRIVATE_KEY_ENV.length === 66 && PRIVATE_KEY_ENV.startsWith("0x");
const PRIVATE_KEY = isValidPrivateKey
  ? PRIVATE_KEY_ENV
  : "0x0000000000000000000000000000000000000000000000000000000000000001"; // Development fallback

if (!isValidPrivateKey && process.env.NODE_ENV !== "development") {
  console.warn("\n⚠️  WARNING: Invalid or missing PRIVATE_KEY in .env");
  console.warn("Using development fallback key. Run: node scripts/generate-wallet.js\n");
}

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: [PRIVATE_KEY],
      chainId: 80002,
      gasPrice: 30000000000
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: [PRIVATE_KEY],
      chainId: 137
    }
  },
  etherscan: {
    apiKey: {
      polygon: POLYGONSCAN_API_KEY,
      polygonAmoy: POLYGONSCAN_API_KEY
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD"
  }
};
