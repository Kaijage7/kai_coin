/**
 * KAI Token - Polygon Amoy Testnet Deployment
 *
 * Deploys all KAI contracts to Polygon Amoy testnet
 *
 * Prerequisites:
 * 1. Set PRIVATE_KEY in .env (use: node scripts/generate-wallet.js)
 * 2. Get testnet MATIC from: https://faucet.polygon.technology/
 * 3. Set POLYGONSCAN_API_KEY for verification (optional)
 *
 * Usage:
 *   npx hardhat run scripts/deploy-amoy.js --network amoy
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Deployment configuration
const CONFIG = {
    // Initial token supply: 1 billion KAI
    initialSupply: ethers.parseEther("1000000000"),

    // Revenue contract settings
    treasury: null, // Will be set to deployer if not specified

    // Staking settings
    minimumStake: ethers.parseEther("100"),
    stakingDuration: 30 * 24 * 60 * 60, // 30 days

    // Governance settings
    quorumThreshold: ethers.parseEther("1000000"), // 1M KAI for quorum
    votingPeriod: 7 * 24 * 60 * 60, // 7 days

    // Oracle settings
    minConfidence: 70,

    // Health pillar
    inspectionFee: ethers.parseEther("50"),

    // Vesting
    vestingCliff: 365 * 24 * 60 * 60, // 1 year
    vestingDuration: 4 * 365 * 24 * 60 * 60 // 4 years
};

async function main() {
    console.log("\n");
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                                                            ║");
    console.log("║     KAI TOKEN - POLYGON AMOY TESTNET DEPLOYMENT           ║");
    console.log("║                                                            ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n");

    // Get deployer
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    // Validate network
    if (network.chainId !== 80002n) {
        console.error("ERROR: This script is for Polygon Amoy (chainId: 80002)");
        console.error(`Current network: ${network.name} (chainId: ${network.chainId})`);
        process.exit(1);
    }

    const balance = await ethers.provider.getBalance(deployer.address);

    console.log("Deployment Configuration:");
    console.log("─────────────────────────────────────────");
    console.log(`  Network: Polygon Amoy Testnet`);
    console.log(`  Chain ID: ${network.chainId}`);
    console.log(`  Deployer: ${deployer.address}`);
    console.log(`  Balance: ${ethers.formatEther(balance)} MATIC`);
    console.log("");

    // Check balance
    if (balance < ethers.parseEther("0.5")) {
        console.error("ERROR: Insufficient MATIC balance");
        console.error("Get testnet MATIC from: https://faucet.polygon.technology/");
        process.exit(1);
    }

    // Treasury address (defaults to deployer)
    const treasury = CONFIG.treasury || deployer.address;
    console.log(`  Treasury: ${treasury}`);
    console.log("");

    // Storage for deployed addresses
    const deployed = {};
    const gasUsed = {};

    // ============================================
    // Deploy Contracts
    // ============================================

    try {
        // 1. Deploy KAI Token
        console.log("Step 1/10: Deploying KAI Token...");
        const KAIToken = await ethers.getContractFactory("KAIToken");
        const kaiToken = await KAIToken.deploy();
        await kaiToken.waitForDeployment();
        deployed.KAIToken = await kaiToken.getAddress();
        gasUsed.KAIToken = (await kaiToken.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KAIToken: ${deployed.KAIToken}`);

        // 2. Deploy Revenue Contract
        console.log("Step 2/10: Deploying KAI Revenue...");
        const KAIRevenue = await ethers.getContractFactory("KAIRevenue");
        const kaiRevenue = await KAIRevenue.deploy(deployed.KAIToken, treasury);
        await kaiRevenue.waitForDeployment();
        deployed.KAIRevenue = await kaiRevenue.getAddress();
        gasUsed.KAIRevenue = (await kaiRevenue.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KAIRevenue: ${deployed.KAIRevenue}`);

        // 3. Deploy Governance
        console.log("Step 3/10: Deploying KAI Governance...");
        const KAIGovernance = await ethers.getContractFactory("KAIGovernance");
        const kaiGovernance = await KAIGovernance.deploy(
            deployed.KAIToken,
            CONFIG.quorumThreshold,
            CONFIG.votingPeriod
        );
        await kaiGovernance.waitForDeployment();
        deployed.KAIGovernance = await kaiGovernance.getAddress();
        gasUsed.KAIGovernance = (await kaiGovernance.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KAIGovernance: ${deployed.KAIGovernance}`);

        // 4. Deploy Staking
        console.log("Step 4/10: Deploying Climate Alert Staking...");
        const ClimateAlertStaking = await ethers.getContractFactory("ClimateAlertStaking");
        const staking = await ClimateAlertStaking.deploy(
            deployed.KAIToken,
            CONFIG.minimumStake,
            CONFIG.stakingDuration
        );
        await staking.waitForDeployment();
        deployed.ClimateAlertStaking = await staking.getAddress();
        gasUsed.ClimateAlertStaking = (await staking.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ ClimateAlertStaking: ${deployed.ClimateAlertStaking}`);

        // 5. Deploy Oracle
        console.log("Step 5/10: Deploying KAI Oracle...");
        const KAI_Oracle = await ethers.getContractFactory("KAI_Oracle");
        const oracle = await KAI_Oracle.deploy(deployed.KAIToken, CONFIG.minConfidence);
        await oracle.waitForDeployment();
        deployed.KAI_Oracle = await oracle.getAddress();
        gasUsed.KAI_Oracle = (await oracle.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KAI_Oracle: ${deployed.KAI_Oracle}`);

        // 6. Deploy Health Pillar
        console.log("Step 6/10: Deploying KAI Health...");
        const KaiHealth = await ethers.getContractFactory("KaiHealth");
        const health = await KaiHealth.deploy(deployed.KAIToken, CONFIG.inspectionFee);
        await health.waitForDeployment();
        deployed.KaiHealth = await health.getAddress();
        gasUsed.KaiHealth = (await health.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KaiHealth: ${deployed.KaiHealth}`);

        // 7. Deploy Agriculture Pillar
        console.log("Step 7/10: Deploying KAI Agriculture...");
        const KAI_Agriculture = await ethers.getContractFactory("KAI_Agriculture");
        const agriculture = await KAI_Agriculture.deploy(deployed.KAIToken, deployed.KAI_Oracle);
        await agriculture.waitForDeployment();
        deployed.KAI_Agriculture = await agriculture.getAddress();
        gasUsed.KAI_Agriculture = (await agriculture.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KAI_Agriculture: ${deployed.KAI_Agriculture}`);

        // 8. Deploy Law/Evidence Pillar
        console.log("Step 8/10: Deploying KAI Law Evidence...");
        const KAI_LawEvidence = await ethers.getContractFactory("KAI_LawEvidence");
        const lawEvidence = await KAI_LawEvidence.deploy(deployed.KAIToken);
        await lawEvidence.waitForDeployment();
        deployed.KAI_LawEvidence = await lawEvidence.getAddress();
        gasUsed.KAI_LawEvidence = (await lawEvidence.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KAI_LawEvidence: ${deployed.KAI_LawEvidence}`);

        // 9. Deploy Disaster Response Pillar
        console.log("Step 9/10: Deploying KAI Disaster Response...");
        const KaiDisasterResponse = await ethers.getContractFactory("KaiDisasterResponse");
        const disaster = await KaiDisasterResponse.deploy(deployed.KAIToken, deployed.KAI_Oracle);
        await disaster.waitForDeployment();
        deployed.KaiDisasterResponse = await disaster.getAddress();
        gasUsed.KaiDisasterResponse = (await disaster.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KaiDisasterResponse: ${deployed.KaiDisasterResponse}`);

        // 10. Deploy Vesting
        console.log("Step 10/10: Deploying KAI Vesting...");
        const KAIVesting = await ethers.getContractFactory("KAIVesting");
        const vesting = await KAIVesting.deploy(deployed.KAIToken);
        await vesting.waitForDeployment();
        deployed.KAIVesting = await vesting.getAddress();
        gasUsed.KAIVesting = (await vesting.deploymentTransaction().wait()).gasUsed;
        console.log(`  ✓ KAIVesting: ${deployed.KAIVesting}`);

        console.log("");
        console.log("All contracts deployed!");
        console.log("");

        // ============================================
        // Grant Roles
        // ============================================

        console.log("Granting roles...");
        console.log("─────────────────────────────────────────");

        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));

        // Grant MINTER_ROLE to staking and vesting contracts
        await kaiToken.grantRole(MINTER_ROLE, deployed.ClimateAlertStaking);
        console.log("  ✓ Granted MINTER_ROLE to ClimateAlertStaking");

        await kaiToken.grantRole(MINTER_ROLE, deployed.KAIVesting);
        console.log("  ✓ Granted MINTER_ROLE to KAIVesting");

        // Grant BURNER_ROLE to governance and pillars
        await kaiToken.grantRole(BURNER_ROLE, deployed.KAIGovernance);
        console.log("  ✓ Granted BURNER_ROLE to KAIGovernance");

        await kaiToken.grantRole(BURNER_ROLE, deployed.KaiHealth);
        console.log("  ✓ Granted BURNER_ROLE to KaiHealth");

        await kaiToken.grantRole(BURNER_ROLE, deployed.KAI_Agriculture);
        console.log("  ✓ Granted BURNER_ROLE to KAI_Agriculture");

        await kaiToken.grantRole(BURNER_ROLE, deployed.KaiDisasterResponse);
        console.log("  ✓ Granted BURNER_ROLE to KaiDisasterResponse");

        console.log("");

        // ============================================
        // Save Deployment Info
        // ============================================

        const totalGas = Object.values(gasUsed).reduce((a, b) => a + b, 0n);
        const finalBalance = await ethers.provider.getBalance(deployer.address);
        const spent = balance - finalBalance;

        const deploymentInfo = {
            network: "amoy",
            chainId: Number(network.chainId),
            deployer: deployer.address,
            treasury: treasury,
            timestamp: new Date().toISOString(),
            contracts: deployed,
            gasUsed: Object.fromEntries(
                Object.entries(gasUsed).map(([k, v]) => [k, v.toString()])
            ),
            totalGasUsed: totalGas.toString(),
            totalCost: ethers.formatEther(spent) + " MATIC",
            explorerBaseUrl: "https://www.oklink.com/amoy"
        };

        // Save to deployments folder
        const deploymentsDir = path.join(__dirname, "..", "deployments");
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const filename = `amoy-${Date.now()}.json`;
        const filepath = path.join(deploymentsDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

        // Also save as latest
        fs.writeFileSync(
            path.join(deploymentsDir, "amoy-latest.json"),
            JSON.stringify(deploymentInfo, null, 2)
        );

        // ============================================
        // Summary
        // ============================================

        console.log("═══════════════════════════════════════════════════════════");
        console.log("              DEPLOYMENT SUCCESSFUL!");
        console.log("═══════════════════════════════════════════════════════════");
        console.log("");
        console.log("Contract Addresses:");
        console.log("─────────────────────────────────────────");
        Object.entries(deployed).forEach(([name, address]) => {
            console.log(`  ${name.padEnd(25)} ${address}`);
        });
        console.log("");
        console.log("Gas Usage:");
        console.log("─────────────────────────────────────────");
        Object.entries(gasUsed).forEach(([name, gas]) => {
            console.log(`  ${name.padEnd(25)} ${gas.toString()} gas`);
        });
        console.log(`  ${'TOTAL'.padEnd(25)} ${totalGas.toString()} gas`);
        console.log("");
        console.log(`Deployment Cost: ${ethers.formatEther(spent)} MATIC`);
        console.log(`Remaining Balance: ${ethers.formatEther(finalBalance)} MATIC`);
        console.log("");
        console.log(`Deployment saved to: ${filepath}`);
        console.log("");
        console.log("Explorer Links:");
        console.log("─────────────────────────────────────────");
        Object.entries(deployed).forEach(([name, address]) => {
            console.log(`  ${name}: https://www.oklink.com/amoy/address/${address}`);
        });
        console.log("");
        console.log("Next Steps:");
        console.log("  1. Verify contracts: npx hardhat verify --network amoy <address>");
        console.log("  2. Update frontend contract config with addresses");
        console.log("  3. Fund treasury with initial liquidity");
        console.log("  4. Test all contract interactions");
        console.log("");

        return deploymentInfo;

    } catch (error) {
        console.error("\nDEPLOYMENT FAILED!");
        console.error("─────────────────────────────────────────");
        console.error(error);
        process.exit(1);
    }
}

// Verify contracts helper
async function verifyContracts(deploymentFile) {
    const { run } = require("hardhat");
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

    console.log("Verifying contracts on explorer...");

    for (const [name, address] of Object.entries(deployment.contracts)) {
        try {
            console.log(`Verifying ${name}...`);
            await run("verify:verify", {
                address: address,
                constructorArguments: [] // Would need to store constructor args
            });
            console.log(`  ✓ ${name} verified`);
        } catch (error) {
            console.log(`  ✗ ${name} verification failed: ${error.message}`);
        }
    }
}

// Export for programmatic use
module.exports = { main, verifyContracts };

// Run if called directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
