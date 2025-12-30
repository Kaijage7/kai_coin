const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying KAI Coin Contracts to", hre.network.name);
  console.log("=========================================\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString(), "wei\n");

  // ============================================
  // 1. Deploy KAI Token
  // ============================================
  console.log("📝 Deploying KAI Token...");

  const treasury = deployer.address; // Treasury receives initial 40% supply
  const admin = deployer.address; // Admin controls roles

  const KAIToken = await hre.ethers.getContractFactory("KAIToken");
  const kaiToken = await KAIToken.deploy(admin, treasury);
  await kaiToken.waitForDeployment();

  const kaiAddress = await kaiToken.getAddress();
  console.log("✅ KAI Token deployed to:", kaiAddress);
  console.log("   - Initial Supply: 400,000,000 KAI (40%)");
  console.log("   - Treasury:", treasury);
  console.log("   - Max Supply: 1,000,000,000 KAI\n");

  // ============================================
  // 2. Deploy Climate Alert Staking
  // ============================================
  console.log("🌍 Deploying Climate Alert Staking...");

  const oracle = deployer.address; // Oracle role (will be backend AI service)

  const ClimateAlertStaking = await hre.ethers.getContractFactory("ClimateAlertStaking");
  const climateStaking = await ClimateAlertStaking.deploy(kaiAddress, admin, oracle);
  await climateStaking.waitForDeployment();

  const stakingAddress = await climateStaking.getAddress();
  console.log("✅ Climate Alert Staking deployed to:", stakingAddress);
  console.log("   - Min Stake: 100 KAI");
  console.log("   - Burn Rate: 10% per alert\n");

  // ============================================
  // 3. Deploy KAI DAO
  // ============================================
  console.log("🏛️  Deploying KAI DAO Governance...");

  // Guardian council (3-7 guardians for multi-sig security)
  const guardians = [
    deployer.address,
    // For testnet/local, using additional addresses as guardians
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Test guardian #1
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"  // Test guardian #2
    // For production, replace with real guardian addresses
  ];

  const KAI_DAO = await hre.ethers.getContractFactory("KAI_DAO");
  const kaiDAO = await KAI_DAO.deploy(kaiAddress, guardians);
  await kaiDAO.waitForDeployment();

  const daoAddress = await kaiDAO.getAddress();
  console.log("✅ KAI DAO deployed to:", daoAddress);
  console.log("   - Guardians:", guardians.length);
  console.log("   - Proposal Threshold: 10,000 KAI");
  console.log("   - Voting Period: 7 days");
  console.log("   - Timelock: 48 hours\n");

  // ============================================
  // 4. Deploy KAI Oracle
  // ============================================
  console.log("🔮 Deploying KAI Oracle (AI Alert Bridge)...");

  const oracleOperator = deployer.address; // Will be backend AI service

  const KAI_Oracle = await hre.ethers.getContractFactory("KAI_Oracle");
  const kaiOracle = await KAI_Oracle.deploy(
    kaiAddress,
    stakingAddress,
    admin,
    oracleOperator,
    guardians
  );
  await kaiOracle.waitForDeployment();

  const oracleAddress = await kaiOracle.getAddress();
  console.log("✅ KAI Oracle deployed to:", oracleAddress);
  console.log("   - Min Confidence: 80%");
  console.log("   - Oracle Reward: 3% of burns");
  console.log("   - Alert Cooldown: 6 hours\n");

  // ============================================
  // 5. Grant Roles & Link Components
  // ============================================
  console.log("🔐 Granting Roles & Linking Contracts...");

  // Grant BURNER_ROLE to staking contract
  const BURNER_ROLE = await kaiToken.BURNER_ROLE();
  const grantTx = await kaiToken.grantRole(BURNER_ROLE, stakingAddress);
  await grantTx.wait();
  console.log("✅ BURNER_ROLE granted to Climate Staking contract");

  // Grant MINTER_ROLE to DAO for treasury management
  const MINTER_ROLE = await kaiToken.MINTER_ROLE();
  const grantMinterTx = await kaiToken.grantRole(MINTER_ROLE, daoAddress);
  await grantMinterTx.wait();
  console.log("✅ MINTER_ROLE granted to DAO contract");

  // Grant MINTER_ROLE to Oracle for operator rewards
  const grantOracleMinterTx = await kaiToken.grantRole(MINTER_ROLE, oracleAddress);
  await grantOracleMinterTx.wait();
  console.log("✅ MINTER_ROLE granted to Oracle contract");

  // Grant ORACLE_ROLE to staking contract so oracle can trigger alerts
  const ORACLE_ROLE = await climateStaking.ORACLE_ROLE();
  const grantOracleTx = await climateStaking.grantRole(ORACLE_ROLE, oracleAddress);
  await grantOracleTx.wait();
  console.log("✅ ORACLE_ROLE granted to Oracle contract (for triggering alerts)\n");

  // ============================================
  // 6. Summary
  // ============================================
  console.log("=========================================");
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=========================================\n");
  console.log("📋 Contract Addresses:");
  console.log("--------------------");
  console.log(`KAI Token:              ${kaiAddress}`);
  console.log(`Climate Alert Staking:  ${stakingAddress}`);
  console.log(`KAI DAO Governance:     ${daoAddress}`);
  console.log(`KAI Oracle (AI Bridge): ${oracleAddress}`);
  console.log("");
  console.log("🔗 Verify on PolygonScan:");
  console.log(`https://polygonscan.com/address/${kaiAddress}`);
  console.log(`https://polygonscan.com/address/${stakingAddress}`);
  console.log(`https://polygonscan.com/address/${daoAddress}`);
  console.log(`https://polygonscan.com/address/${oracleAddress}`);
  console.log("");
  console.log("📊 Next Steps:");
  console.log("1. Update frontend with contract addresses");
  console.log("2. Configure backend AI oracle with ORACLE_ROLE");
  console.log("3. Fund treasury for initial liquidity");
  console.log("4. Start Kenya pilot (10,000 farmers)");
  console.log("");
  console.log("💡 Utility Flywheel Status: ACTIVATED");
  console.log("   - Farmers can stake 100+ KAI for climate alerts");
  console.log("   - Oracle sends alerts → 10% burn → deflation");
  console.log("   - Real business value: $5M+ annual subscriptions");
  console.log("");

  // Save deployment info
  const fs = require('fs');
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      KAIToken: {
        address: kaiAddress,
        maxSupply: "1000000000",
        initialMint: "400000000",
        roles: {
          BURNER_ROLE: stakingAddress,
          MINTER_ROLE: daoAddress
        }
      },
      ClimateAlertStaking: {
        address: stakingAddress,
        minStake: "100",
        burnRate: "10%",
        oracle: oracle
      },
      KAI_DAO: {
        address: daoAddress,
        proposalThreshold: "10000",
        votingPeriod: "7 days",
        timelockDelay: "48 hours",
        quorumPercentage: "4%",
        guardians: guardians
      },
      KAI_Oracle: {
        address: oracleAddress,
        minConfidence: "80%",
        oracleRewardRate: "3%",
        alertCooldown: "6 hours",
        maxAlertsPerDay: 10,
        operator: oracleOperator
      }
    },
    componentLinkage: {
      "KAIToken → ClimateStaking": "BURNER_ROLE granted",
      "KAIToken → DAO": "MINTER_ROLE granted",
      "KAIToken → Oracle": "MINTER_ROLE granted (rewards)",
      "ClimateStaking → Oracle": "ORACLE_ROLE granted (trigger alerts)"
    }
  };

  fs.writeFileSync(
    `deployment-${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(`📄 Deployment info saved to: deployment-${hre.network.name}.json`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
