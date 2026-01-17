require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

// Private key validation
const PRIVATE_KEY_ENV = process.env.PRIVATE_KEY || "";
const isValidPrivateKey = PRIVATE_KEY_ENV.length === 66 && PRIVATE_KEY_ENV.startsWith("0x");

// Development fallback key (Hardhat default account #0)
const DEV_FALLBACK_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Check if deploying to external network without valid key
const targetNetwork = process.env.HARDHAT_NETWORK || process.argv.find(arg => arg.startsWith("--network"))?.split("=")[1] || "hardhat";
const isExternalNetwork = !["hardhat", "localhost"].includes(targetNetwork);

if (isExternalNetwork && !isValidPrivateKey) {
  console.error("\n❌ CRITICAL: Valid PRIVATE_KEY required for network:", targetNetwork);
  console.error("Set PRIVATE_KEY in .env file. Format: 0x followed by 64 hex characters");
  console.error("Generate a wallet: node scripts/generate-wallet.js\n");
  process.exit(1);
}

// Use valid key or fallback for local development
const PRIVATE_KEY = isValidPrivateKey ? PRIVATE_KEY_ENV : DEV_FALLBACK_KEY;

if (!isValidPrivateKey && !isExternalNetwork) {
  console.warn("\n⚠️  Using development fallback key (hardhat account #0)");
  console.warn("Run 'node scripts/generate-wallet.js' for production deployment.\n");
}

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.8.22",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
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
