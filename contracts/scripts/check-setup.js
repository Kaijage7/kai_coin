const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔍 Checking Deployment Setup...\n");

  // Check .env file exists
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.log("❌ .env file not found!");
    console.log("📝 Create it with: cp .env.example .env");
    console.log("   Then add your PRIVATE_KEY\n");
    process.exit(1);
  }
  console.log("✅ .env file found");

  // Check private key is set
  if (!process.env.PRIVATE_KEY) {
    console.log("❌ PRIVATE_KEY not set in .env");
    console.log("📝 Add your MetaMask private key to .env file\n");
    process.exit(1);
  }
  console.log("✅ PRIVATE_KEY configured");

  // Get signer
  const [deployer] = await hre.ethers.getSigners();
  console.log("✅ Deployer address:", deployer.address);

  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceInMatic = hre.ethers.formatEther(balance);
  console.log("💰 Balance:", balanceInMatic, "MATIC");

  if (parseFloat(balanceInMatic) < 0.5) {
    console.log("\n⚠️  WARNING: Low balance!");
    console.log("   You need at least 1-2 MATIC for deployment");
    console.log("   Get free testnet MATIC at: https://faucet.polygon.technology/\n");
    process.exit(1);
  }
  console.log("✅ Sufficient balance for deployment");

  // Check network
  const network = await hre.ethers.provider.getNetwork();
  console.log("✅ Network:", network.name, "(chainId:", network.chainId + ")");

  if (network.chainId !== 80002n) {
    console.log("\n⚠️  WARNING: Not on Polygon Amoy testnet!");
    console.log("   Expected chainId: 80002");
    console.log("   Current chainId:", network.chainId.toString());
    console.log("   Run with: npm run deploy:testnet\n");
  }

  console.log("\n🚀 Setup Complete! Ready to deploy.");
  console.log("   Run: npm run deploy:testnet\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
