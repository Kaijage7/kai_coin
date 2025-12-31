/**
 * Update Frontend Contract Configuration
 *
 * After deployment, run this script to automatically update
 * the frontend contract addresses from the deployment file.
 *
 * Usage:
 *   node scripts/update-frontend-config.js [deployment-file]
 *
 * Example:
 *   node scripts/update-frontend-config.js deployments/amoy-latest.json
 */

const fs = require("fs");
const path = require("path");

const FRONTEND_CONFIG_PATH = path.join(
    __dirname,
    "..",
    "frontend",
    "src",
    "contracts",
    "config.js"
);

function main() {
    // Get deployment file
    const deploymentFile = process.argv[2] || path.join(__dirname, "..", "deployments", "amoy-latest.json");

    console.log("\n");
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                                                            ║");
    console.log("║     UPDATE FRONTEND CONTRACT CONFIGURATION                ║");
    console.log("║                                                            ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n");

    // Check deployment file exists
    if (!fs.existsSync(deploymentFile)) {
        console.error(`ERROR: Deployment file not found: ${deploymentFile}`);
        console.error("\nRun deployment first:");
        console.error("  npx hardhat run scripts/deploy-amoy.js --network amoy");
        process.exit(1);
    }

    // Load deployment
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    console.log(`Loading deployment from: ${deploymentFile}`);
    console.log(`Network: ${deployment.network}`);
    console.log(`Timestamp: ${deployment.timestamp}`);
    console.log("");

    // Check frontend config exists
    if (!fs.existsSync(FRONTEND_CONFIG_PATH)) {
        console.error(`ERROR: Frontend config not found: ${FRONTEND_CONFIG_PATH}`);
        process.exit(1);
    }

    // Read current config
    let configContent = fs.readFileSync(FRONTEND_CONFIG_PATH, "utf8");

    // Update contract addresses for the network
    const networkKey = deployment.network;
    const contracts = deployment.contracts;

    console.log("Updating contract addresses:");
    console.log("─────────────────────────────────────────");

    Object.entries(contracts).forEach(([name, address]) => {
        // Create regex to find and replace the address
        const regex = new RegExp(
            `(${networkKey}:\\s*\\{[^}]*${name}:\\s*')[^']*(')`
            , "g"
        );

        if (configContent.match(regex)) {
            configContent = configContent.replace(regex, `$1${address}$2`);
            console.log(`  ✓ ${name}: ${address}`);
        } else {
            // Try alternative format
            const altRegex = new RegExp(
                `(${name}:\\s*')[^']*('.*?// ${networkKey})`
                , "g"
            );
            if (configContent.match(altRegex)) {
                configContent = configContent.replace(altRegex, `$1${address}$2`);
                console.log(`  ✓ ${name}: ${address}`);
            } else {
                console.log(`  ⚠ ${name}: Could not find in config (manual update needed)`);
            }
        }
    });

    // Also update DEFAULT_NETWORK if needed
    if (networkKey === "amoy") {
        configContent = configContent.replace(
            /export const DEFAULT_NETWORK = '[^']*'/,
            `export const DEFAULT_NETWORK = 'amoy'`
        );
        console.log(`\n  ✓ DEFAULT_NETWORK set to 'amoy'`);
    }

    // Write updated config
    fs.writeFileSync(FRONTEND_CONFIG_PATH, configContent);

    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("              FRONTEND CONFIG UPDATED!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log(`Updated file: ${FRONTEND_CONFIG_PATH}`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. cd frontend");
    console.log("  2. npm run build");
    console.log("  3. npm run preview (to test)");
    console.log("");

    // Generate a simple JSON file for easy reference
    const simpleConfig = {
        network: deployment.network,
        chainId: deployment.chainId,
        contracts: deployment.contracts,
        explorer: deployment.explorerBaseUrl
    };

    const simplePath = path.join(__dirname, "..", "frontend", "src", "contracts", "addresses.json");
    fs.writeFileSync(simplePath, JSON.stringify(simpleConfig, null, 2));
    console.log(`Also created: ${simplePath}`);
    console.log("");
}

main();
