/**
 * Prepare for Testnet Deployment
 *
 * This script:
 * 1. Checks environment configuration
 * 2. Validates wallet setup
 * 3. Checks testnet MATIC balance
 * 4. Provides instructions for any missing requirements
 *
 * Usage:
 *   node scripts/prepare-testnet.js
 */

require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const AMOY_RPC = "https://rpc-amoy.polygon.technology";
const FAUCET_URL = "https://faucet.polygon.technology/";
const MIN_BALANCE = 0.5; // Minimum MATIC needed

async function main() {
    console.log("\n");
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                                                            ║");
    console.log("║     KAI TESTNET DEPLOYMENT PREPARATION                    ║");
    console.log("║                                                            ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("\n");

    const checks = [];
    let allPassed = true;

    // ============================================
    // Check 1: .env file exists
    // ============================================
    console.log("1. Checking .env file...");
    const envPath = path.join(__dirname, "..", ".env");
    const envExists = fs.existsSync(envPath);

    if (envExists) {
        checks.push({ name: ".env file", status: "✓", message: "Found" });
        console.log("   ✓ .env file found");
    } else {
        checks.push({ name: ".env file", status: "✗", message: "Missing - create from .env.example" });
        console.log("   ✗ .env file not found");
        console.log("   → Copy .env.example to .env and fill in values");
        allPassed = false;
    }

    // ============================================
    // Check 2: Private key
    // ============================================
    console.log("\n2. Checking private key...");
    const privateKey = process.env.PRIVATE_KEY;

    if (privateKey && privateKey.length === 66 && privateKey.startsWith("0x")) {
        checks.push({ name: "Private key", status: "✓", message: "Valid format" });
        console.log("   ✓ Private key configured (valid format)");

        // Derive address
        const wallet = new ethers.Wallet(privateKey);
        console.log(`   → Wallet address: ${wallet.address}`);

        // ============================================
        // Check 3: MATIC balance
        // ============================================
        console.log("\n3. Checking testnet MATIC balance...");

        try {
            const provider = new ethers.JsonRpcProvider(AMOY_RPC);
            const balance = await provider.getBalance(wallet.address);
            const balanceEther = parseFloat(ethers.formatEther(balance));

            if (balanceEther >= MIN_BALANCE) {
                checks.push({
                    name: "MATIC balance",
                    status: "✓",
                    message: `${balanceEther.toFixed(4)} MATIC`
                });
                console.log(`   ✓ Balance: ${balanceEther.toFixed(4)} MATIC (sufficient)`);
            } else if (balanceEther > 0) {
                checks.push({
                    name: "MATIC balance",
                    status: "⚠",
                    message: `${balanceEther.toFixed(4)} MATIC (low)`
                });
                console.log(`   ⚠ Balance: ${balanceEther.toFixed(4)} MATIC (may be insufficient)`);
                console.log(`   → Get more from: ${FAUCET_URL}`);
            } else {
                checks.push({
                    name: "MATIC balance",
                    status: "✗",
                    message: "0 MATIC"
                });
                console.log("   ✗ Balance: 0 MATIC");
                console.log(`   → Get testnet MATIC from: ${FAUCET_URL}`);
                allPassed = false;
            }

            // Test connection
            const blockNumber = await provider.getBlockNumber();
            checks.push({ name: "RPC connection", status: "✓", message: `Block #${blockNumber}` });
            console.log(`   ✓ Connected to Amoy (block #${blockNumber})`);

        } catch (error) {
            checks.push({ name: "MATIC balance", status: "✗", message: error.message });
            console.log(`   ✗ Could not check balance: ${error.message}`);
            allPassed = false;
        }

    } else {
        checks.push({ name: "Private key", status: "✗", message: "Invalid or missing" });
        console.log("   ✗ Private key not configured or invalid");
        console.log("   → Run: node scripts/generate-wallet.js");
        allPassed = false;
    }

    // ============================================
    // Check 4: Polygonscan API key (optional)
    // ============================================
    console.log("\n4. Checking Polygonscan API key...");
    const polygonscanKey = process.env.POLYGONSCAN_API_KEY;

    if (polygonscanKey && polygonscanKey.length > 10) {
        checks.push({ name: "Polygonscan API", status: "✓", message: "Configured" });
        console.log("   ✓ Polygonscan API key configured");
    } else {
        checks.push({ name: "Polygonscan API", status: "⚠", message: "Not configured (optional)" });
        console.log("   ⚠ Polygonscan API key not configured (optional)");
        console.log("   → Get one from: https://polygonscan.com/apis");
    }

    // ============================================
    // Check 5: Contracts compile
    // ============================================
    console.log("\n5. Checking contract compilation...");

    try {
        const artifactsPath = path.join(__dirname, "..", "artifacts", "contracts");
        const hasArtifacts = fs.existsSync(artifactsPath);

        if (hasArtifacts) {
            const contracts = fs.readdirSync(artifactsPath);
            checks.push({ name: "Contracts", status: "✓", message: `${contracts.length} compiled` });
            console.log(`   ✓ ${contracts.length} contracts compiled`);
        } else {
            checks.push({ name: "Contracts", status: "⚠", message: "Not compiled" });
            console.log("   ⚠ Contracts not compiled yet");
            console.log("   → Run: npx hardhat compile");
        }
    } catch (error) {
        checks.push({ name: "Contracts", status: "⚠", message: "Could not check" });
        console.log("   ⚠ Could not check compilation status");
    }

    // ============================================
    // Summary
    // ============================================
    console.log("\n");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("                    PREPARATION SUMMARY");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");

    checks.forEach(check => {
        const status = check.status === "✓" ? "✓" : check.status === "⚠" ? "⚠" : "✗";
        console.log(`  ${status} ${check.name.padEnd(20)} ${check.message}`);
    });

    console.log("");

    if (allPassed) {
        console.log("═══════════════════════════════════════════════════════════");
        console.log("           ✓ READY FOR TESTNET DEPLOYMENT!");
        console.log("═══════════════════════════════════════════════════════════");
        console.log("");
        console.log("Run deployment with:");
        console.log("  npx hardhat run scripts/deploy-amoy.js --network amoy");
        console.log("");
    } else {
        console.log("═══════════════════════════════════════════════════════════");
        console.log("           ✗ FIX ISSUES BEFORE DEPLOYMENT");
        console.log("═══════════════════════════════════════════════════════════");
        console.log("");
        console.log("Required steps:");
        console.log("  1. Create wallet: node scripts/generate-wallet.js");
        console.log(`  2. Get testnet MATIC: ${FAUCET_URL}`);
        console.log("  3. Add PRIVATE_KEY to .env");
        console.log("  4. Compile: npx hardhat compile");
        console.log("");
    }

    return allPassed;
}

// Run
main()
    .then(passed => process.exit(passed ? 0 : 1))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
