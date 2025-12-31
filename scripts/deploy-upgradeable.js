/**
 * Deploy KAI Token with UUPS Proxy Pattern
 *
 * This script deploys the upgradeable version of KAI Token
 * using OpenZeppelin's hardhat-upgrades plugin.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-upgradeable.js --network <network>
 */

const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("\n");
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                                                            ║");
    console.log("║     KAI TOKEN - UPGRADEABLE DEPLOYMENT (UUPS)             ║");
    console.log("║                                                            ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n");

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    console.log("Deployment Configuration:");
    console.log("─────────────────────────────────────────");
    console.log(`  Network: ${network.name} (chainId: ${network.chainId})`);
    console.log(`  Deployer: ${deployer.address}`);
    console.log(`  Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log("");

    // ============================================
    // Deploy KAI Token (Upgradeable)
    // ============================================

    console.log("Step 1: Deploying KAI Token (UUPS Proxy)...");
    console.log("─────────────────────────────────────────");

    const KAITokenUpgradeable = await ethers.getContractFactory("KAITokenUpgradeable");

    // Deploy with proxy
    const kaiToken = await upgrades.deployProxy(
        KAITokenUpgradeable,
        [deployer.address], // initialize(admin)
        {
            initializer: "initialize",
            kind: "uups"
        }
    );

    await kaiToken.waitForDeployment();

    const proxyAddress = await kaiToken.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const adminAddress = await upgrades.erc1967.getAdminAddress(proxyAddress);

    console.log(`  Proxy Address: ${proxyAddress}`);
    console.log(`  Implementation: ${implementationAddress}`);
    console.log(`  Proxy Admin: ${adminAddress}`);
    console.log("");

    // Verify deployment
    console.log("Step 2: Verifying Deployment...");
    console.log("─────────────────────────────────────────");

    const name = await kaiToken.name();
    const symbol = await kaiToken.symbol();
    const totalSupply = await kaiToken.totalSupply();
    const version = await kaiToken.version();
    const decimals = await kaiToken.decimals();

    console.log(`  Name: ${name}`);
    console.log(`  Symbol: ${symbol}`);
    console.log(`  Decimals: ${decimals}`);
    console.log(`  Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
    console.log(`  Version: ${version}`);
    console.log("");

    // Verify roles
    console.log("Step 3: Verifying Roles...");
    console.log("─────────────────────────────────────────");

    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));

    const hasAdmin = await kaiToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    const hasMinter = await kaiToken.hasRole(MINTER_ROLE, deployer.address);
    const hasBurner = await kaiToken.hasRole(BURNER_ROLE, deployer.address);
    const hasPauser = await kaiToken.hasRole(PAUSER_ROLE, deployer.address);
    const hasUpgrader = await kaiToken.hasRole(UPGRADER_ROLE, deployer.address);

    console.log(`  DEFAULT_ADMIN_ROLE: ${hasAdmin ? '✅' : '❌'}`);
    console.log(`  MINTER_ROLE: ${hasMinter ? '✅' : '❌'}`);
    console.log(`  BURNER_ROLE: ${hasBurner ? '✅' : '❌'}`);
    console.log(`  PAUSER_ROLE: ${hasPauser ? '✅' : '❌'}`);
    console.log(`  UPGRADER_ROLE: ${hasUpgrader ? '✅' : '❌'}`);
    console.log("");

    // Test upgrade capability
    console.log("Step 4: Testing Upgrade Capability...");
    console.log("─────────────────────────────────────────");

    try {
        // Validate that the contract can be upgraded
        const KAITokenUpgradeableV2 = await ethers.getContractFactory("KAITokenUpgradeableV2");
        await upgrades.validateUpgrade(proxyAddress, KAITokenUpgradeableV2, {
            kind: "uups"
        });
        console.log("  V2 Upgrade Validation: ✅ PASSED");
    } catch (error) {
        console.log(`  V2 Upgrade Validation: ❌ FAILED - ${error.message}`);
    }
    console.log("");

    // Save deployment info
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            KAITokenUpgradeable: {
                proxy: proxyAddress,
                implementation: implementationAddress,
                version: version.toString()
            }
        },
        roles: {
            admin: deployer.address,
            minter: deployer.address,
            burner: deployer.address,
            pauser: deployer.address,
            upgrader: deployer.address
        }
    };

    // Write deployment file
    const fs = require("fs");
    const path = require("path");

    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const filename = `upgradeable-${network.name}-${Date.now()}.json`;
    fs.writeFileSync(
        path.join(deploymentsDir, filename),
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("═══════════════════════════════════════════════════════════");
    console.log("              DEPLOYMENT COMPLETE!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log(`Deployment saved to: deployments/${filename}`);
    console.log("");
    console.log("Important Addresses:");
    console.log(`  Proxy (use this): ${proxyAddress}`);
    console.log(`  Implementation: ${implementationAddress}`);
    console.log("");
    console.log("Next Steps:");
    console.log("  1. Verify contracts on block explorer");
    console.log("  2. Transfer UPGRADER_ROLE to multisig");
    console.log("  3. Test all functionality via proxy");
    console.log("");

    return deploymentInfo;
}

// Upgrade function for future use
async function upgrade(proxyAddress) {
    console.log("\n");
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                                                            ║");
    console.log("║     KAI TOKEN - UPGRADE TO V2                             ║");
    console.log("║                                                            ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n");

    const [deployer] = await ethers.getSigners();

    console.log(`Upgrading proxy at: ${proxyAddress}`);
    console.log(`Upgrader: ${deployer.address}`);
    console.log("");

    // Get current version
    const currentToken = await ethers.getContractAt("KAITokenUpgradeable", proxyAddress);
    const currentVersion = await currentToken.version();
    console.log(`Current Version: ${currentVersion}`);

    // Deploy new implementation
    console.log("Deploying V2 implementation...");
    const KAITokenUpgradeableV2 = await ethers.getContractFactory("KAITokenUpgradeableV2");

    const upgraded = await upgrades.upgradeProxy(proxyAddress, KAITokenUpgradeableV2, {
        kind: "uups"
    });

    await upgraded.waitForDeployment();

    // Initialize V2
    console.log("Initializing V2...");
    await upgraded.initializeV2();

    const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const newVersion = await upgraded.version();

    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("              UPGRADE COMPLETE!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  New Implementation: ${newImplementation}`);
    console.log(`  New Version: ${newVersion}`);
    console.log("");

    // Test new feature
    const v2Feature = await upgraded.newV2Feature();
    console.log(`  V2 Feature Test: ${v2Feature}`);

    return upgraded;
}

// Export for programmatic use
module.exports = { main, upgrade };

// Run if called directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
