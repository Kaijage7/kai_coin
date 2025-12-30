/**
 * KAI Coin - Deployment Script
 * Deploys all contracts to the target network
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting KAI Coin Deployment...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  const network = hre.network.name;
  console.log("Network:", network);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId.toString());
  console.log("");

  // Deployment addresses storage
  const deployments = {
    network,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {}
  };

  // ============================================
  // 1. Deploy KAI Token
  // ============================================
  console.log("📦 Deploying KAI Token...");

  const KaiToken = await hre.ethers.getContractFactory("KaiToken");
  const treasuryAddress = deployer.address; // Use deployer as initial treasury
  const kaiToken = await KaiToken.deploy(deployer.address, treasuryAddress);
  await kaiToken.waitForDeployment();

  const kaiTokenAddress = await kaiToken.getAddress();
  console.log("   KAI Token deployed to:", kaiTokenAddress);
  deployments.contracts.KaiToken = kaiTokenAddress;

  // Verify initial supply
  const totalSupply = await kaiToken.totalSupply();
  console.log("   Initial supply:", hre.ethers.formatEther(totalSupply), "KAI\n");

  // ============================================
  // 2. Deploy Governance Contract
  // ============================================
  console.log("📦 Deploying KAI Governance...");

  const KaiGovernance = await hre.ethers.getContractFactory("KaiGovernance");
  const kaiGovernance = await KaiGovernance.deploy(kaiTokenAddress, deployer.address);
  await kaiGovernance.waitForDeployment();

  const kaiGovernanceAddress = await kaiGovernance.getAddress();
  console.log("   KAI Governance deployed to:", kaiGovernanceAddress);
  deployments.contracts.KaiGovernance = kaiGovernanceAddress;
  console.log("");

  // ============================================
  // 3. Deploy Pillar Contracts
  // ============================================

  // Disaster Pillar
  console.log("📦 Deploying KAI Disaster Pillar...");
  const KaiDisaster = await hre.ethers.getContractFactory("KaiDisaster");
  const kaiDisaster = await KaiDisaster.deploy(kaiTokenAddress, deployer.address);
  await kaiDisaster.waitForDeployment();
  const kaiDisasterAddress = await kaiDisaster.getAddress();
  console.log("   KAI Disaster deployed to:", kaiDisasterAddress);
  deployments.contracts.KaiDisaster = kaiDisasterAddress;

  // Agriculture Pillar
  console.log("📦 Deploying KAI Agriculture Pillar...");
  const KaiAgriculture = await hre.ethers.getContractFactory("KaiAgriculture");
  const kaiAgriculture = await KaiAgriculture.deploy(kaiTokenAddress, deployer.address);
  await kaiAgriculture.waitForDeployment();
  const kaiAgricultureAddress = await kaiAgriculture.getAddress();
  console.log("   KAI Agriculture deployed to:", kaiAgricultureAddress);
  deployments.contracts.KaiAgriculture = kaiAgricultureAddress;

  // Health Pillar
  console.log("📦 Deploying KAI Health Pillar...");
  const KaiHealth = await hre.ethers.getContractFactory("KaiHealth");
  const kaiHealth = await KaiHealth.deploy(kaiTokenAddress, deployer.address);
  await kaiHealth.waitForDeployment();
  const kaiHealthAddress = await kaiHealth.getAddress();
  console.log("   KAI Health deployed to:", kaiHealthAddress);
  deployments.contracts.KaiHealth = kaiHealthAddress;

  // AI Pillar
  console.log("📦 Deploying KAI AI Pillar...");
  const KaiAI = await hre.ethers.getContractFactory("KaiAI");
  const kaiAI = await KaiAI.deploy(kaiTokenAddress, deployer.address);
  await kaiAI.waitForDeployment();
  const kaiAIAddress = await kaiAI.getAddress();
  console.log("   KAI AI deployed to:", kaiAIAddress);
  deployments.contracts.KaiAI = kaiAIAddress;

  // Law Pillar
  console.log("📦 Deploying KAI Law Pillar...");
  const KaiLaw = await hre.ethers.getContractFactory("KaiLaw");
  const kaiLaw = await KaiLaw.deploy(kaiTokenAddress, deployer.address);
  await kaiLaw.waitForDeployment();
  const kaiLawAddress = await kaiLaw.getAddress();
  console.log("   KAI Law deployed to:", kaiLawAddress);
  deployments.contracts.KaiLaw = kaiLawAddress;

  // Climate Pillar
  console.log("📦 Deploying KAI Climate Pillar...");
  const KaiClimate = await hre.ethers.getContractFactory("KaiClimate");
  const kaiClimate = await KaiClimate.deploy(kaiTokenAddress, deployer.address);
  await kaiClimate.waitForDeployment();
  const kaiClimateAddress = await kaiClimate.getAddress();
  console.log("   KAI Climate deployed to:", kaiClimateAddress);
  deployments.contracts.KaiClimate = kaiClimateAddress;
  console.log("");

  // ============================================
  // 4. Configure Pillar Roles
  // ============================================
  console.log("🔧 Configuring pillar roles...");

  // Grant PILLAR_ROLE to each pillar contract for reward minting
  const pillarContracts = [
    kaiDisasterAddress,
    kaiAgricultureAddress,
    kaiHealthAddress,
    kaiAIAddress,
    kaiLawAddress,
    kaiClimateAddress
  ];

  for (const pillarAddress of pillarContracts) {
    const tx = await kaiToken.grantPillarRole(pillarAddress);
    await tx.wait();
    console.log("   Granted PILLAR_ROLE to:", pillarAddress);
  }
  console.log("");

  // ============================================
  // 5. Initial Treasury Setup
  // ============================================
  console.log("💰 Setting up initial treasury...");

  // Transfer tokens to governance treasury
  const treasuryAllocation = hre.ethers.parseEther("20000000"); // 20M KAI for governance
  const governanceTx = await kaiToken.transfer(kaiGovernanceAddress, treasuryAllocation);
  await governanceTx.wait();
  console.log("   Transferred 20M KAI to Governance treasury");

  // Fund pillar contracts for initial rewards
  const pillarFunding = hre.ethers.parseEther("1000000"); // 1M KAI each

  for (const pillarAddress of pillarContracts) {
    const tx = await kaiToken.transfer(pillarAddress, pillarFunding);
    await tx.wait();
  }
  console.log("   Funded each pillar with 1M KAI for rewards");
  console.log("");

  // ============================================
  // 6. Save Deployment Info
  // ============================================
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${network}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(deployments, null, 2));
  console.log("📄 Deployment info saved to:", filepath);

  // Also save as latest for the network
  const latestPath = path.join(deploymentsDir, `${network}-latest.json`);
  fs.writeFileSync(latestPath, JSON.stringify(deployments, null, 2));
  console.log("📄 Latest deployment saved to:", latestPath);
  console.log("");

  // ============================================
  // 7. Summary
  // ============================================
  console.log("═══════════════════════════════════════════════════════════");
  console.log("                    DEPLOYMENT COMPLETE                     ");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log("Contract Addresses:");
  console.log("───────────────────────────────────────────────────────────");
  console.log("KAI Token:        ", kaiTokenAddress);
  console.log("KAI Governance:   ", kaiGovernanceAddress);
  console.log("KAI Disaster:     ", kaiDisasterAddress);
  console.log("KAI Agriculture:  ", kaiAgricultureAddress);
  console.log("KAI Health:       ", kaiHealthAddress);
  console.log("KAI AI:           ", kaiAIAddress);
  console.log("KAI Law:          ", kaiLawAddress);
  console.log("KAI Climate:      ", kaiClimateAddress);
  console.log("───────────────────────────────────────────────────────────");
  console.log("");

  // Verification commands
  if (network !== "hardhat" && network !== "localhost") {
    console.log("🔍 To verify contracts on block explorer, run:");
    console.log("");
    console.log(`npx hardhat verify --network ${network} ${kaiTokenAddress} "${deployer.address}" "${treasuryAddress}"`);
    console.log(`npx hardhat verify --network ${network} ${kaiGovernanceAddress} "${kaiTokenAddress}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network} ${kaiDisasterAddress} "${kaiTokenAddress}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network} ${kaiAgricultureAddress} "${kaiTokenAddress}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network} ${kaiHealthAddress} "${kaiTokenAddress}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network} ${kaiAIAddress} "${kaiTokenAddress}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network} ${kaiLawAddress} "${kaiTokenAddress}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network} ${kaiClimateAddress} "${kaiTokenAddress}" "${deployer.address}"`);
    console.log("");
  }

  console.log("✅ Deployment successful!");

  return deployments;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
