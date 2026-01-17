/**
 * KAI Token - Comprehensive Test Suite
 *
 * Tests:
 * - Deployment and initialization
 * - Role-based access control
 * - Oracle minting and burning
 * - Transfer restrictions
 * - Pillar-specific burns
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KAIToken", function () {
    let KAIToken;
    let kaiToken;
    let owner;
    let treasury;
    let burner;
    let pauser;
    let user1;
    let user2;

    // Role constants
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    const ORACLE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ORACLE_ROLE"));

    // Constants matching the contract
    const INITIAL_MINT = ethers.parseEther("400000000"); // 400M KAI

    beforeEach(async function () {
        [owner, treasury, burner, pauser, user1, user2] = await ethers.getSigners();

        KAIToken = await ethers.getContractFactory("KAIToken");
        // Deploy with required constructor parameters: admin and treasury
        kaiToken = await KAIToken.deploy(owner.address, treasury.address);
        await kaiToken.waitForDeployment();

        // Grant additional roles for testing
        await kaiToken.grantRole(BURNER_ROLE, burner.address);
        await kaiToken.grantRole(PAUSER_ROLE, pauser.address);
    });

    describe("Deployment", function () {
        it("Should set correct name and symbol", async function () {
            expect(await kaiToken.name()).to.equal("KAI Coin");
            expect(await kaiToken.symbol()).to.equal("KAI");
        });

        it("Should set correct decimals", async function () {
            expect(await kaiToken.decimals()).to.equal(18);
        });

        it("Should mint initial supply to treasury", async function () {
            expect(await kaiToken.balanceOf(treasury.address)).to.equal(INITIAL_MINT);
        });

        it("Should set admin as default admin", async function () {
            expect(await kaiToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should initialize total burned to 0", async function () {
            expect(await kaiToken.totalBurned()).to.equal(0);
        });

        it("Should reject zero address for admin", async function () {
            await expect(
                KAIToken.deploy(ethers.ZeroAddress, treasury.address)
            ).to.be.revertedWith("KAI: admin is zero address");
        });

        it("Should reject zero address for treasury", async function () {
            await expect(
                KAIToken.deploy(owner.address, ethers.ZeroAddress)
            ).to.be.revertedWith("KAI: treasury is zero address");
        });
    });

    describe("Role-Based Access Control", function () {
        it("Should allow admin to grant minter role", async function () {
            await kaiToken.grantRole(MINTER_ROLE, user1.address);
            expect(await kaiToken.hasRole(MINTER_ROLE, user1.address)).to.be.true;
        });

        it("Should allow admin to revoke roles", async function () {
            // First grant role to user1, then revoke it
            await kaiToken.grantRole(MINTER_ROLE, user1.address);
            expect(await kaiToken.hasRole(MINTER_ROLE, user1.address)).to.be.true;

            await kaiToken.revokeRole(MINTER_ROLE, user1.address);
            expect(await kaiToken.hasRole(MINTER_ROLE, user1.address)).to.be.false;
        });

        it("Should not allow non-admin to grant roles", async function () {
            await expect(
                kaiToken.connect(user1).grantRole(MINTER_ROLE, user2.address)
            ).to.be.reverted;
        });
    });

    describe("Oracle Minting", function () {
        it("Should allow oracle role to mint tokens", async function () {
            const amount = ethers.parseEther("1000");
            const pillarId = 1; // Climate pillar
            // Owner has ORACLE_ROLE from constructor
            await kaiToken.oracleMint(user1.address, amount, pillarId);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should not allow non-oracle to mint", async function () {
            const amount = ethers.parseEther("1000");
            await expect(
                kaiToken.connect(user1).oracleMint(user2.address, amount, 1)
            ).to.be.reverted;
        });

        it("Should update total supply after minting", async function () {
            const initialSupply = await kaiToken.totalSupply();
            const amount = ethers.parseEther("1000");
            await kaiToken.oracleMint(user1.address, amount, 1);
            expect(await kaiToken.totalSupply()).to.equal(initialSupply + amount);
        });

        it("Should reject invalid pillar ID", async function () {
            const amount = ethers.parseEther("1000");
            await expect(
                kaiToken.oracleMint(user1.address, amount, 0)
            ).to.be.revertedWith("KAI: invalid pillar");
            await expect(
                kaiToken.oracleMint(user1.address, amount, 8)
            ).to.be.revertedWith("KAI: invalid pillar");
        });

        it("Should emit OracleTriggered event", async function () {
            const amount = ethers.parseEther("1000");
            await expect(kaiToken.oracleMint(user1.address, amount, 3))
                .to.emit(kaiToken, "OracleTriggered")
                .withArgs(3, user1.address, amount);
        });

        it("Should not exceed max supply", async function () {
            const maxSupply = ethers.parseEther("1000000000"); // 1 billion
            const currentSupply = await kaiToken.totalSupply();
            const excessAmount = maxSupply - currentSupply + ethers.parseEther("1");
            await expect(
                kaiToken.oracleMint(user1.address, excessAmount, 1)
            ).to.be.revertedWith("KAI: max supply exceeded");
        });
    });

    describe("Burning", function () {
        beforeEach(async function () {
            // Give burner some tokens from treasury
            await kaiToken.connect(treasury).transfer(burner.address, ethers.parseEther("10000"));
        });

        it("Should allow burner to burn using directBurn", async function () {
            const amount = ethers.parseEther("100");
            const pillarId = 1;

            await kaiToken.connect(burner).directBurn(amount, pillarId, "Test burn");

            expect(await kaiToken.totalBurned()).to.equal(amount);
        });

        it("Should track burned amount by address", async function () {
            const amount = ethers.parseEther("100");
            await kaiToken.connect(burner).directBurn(amount, 1, "Test burn");

            expect(await kaiToken.burnedByAddress(burner.address)).to.equal(amount);
        });

        it("Should reject invalid pillar IDs", async function () {
            const amount = ethers.parseEther("100");

            await expect(
                kaiToken.connect(burner).directBurn(amount, 0, "Invalid pillar")
            ).to.be.revertedWith("KAI: invalid pillar");

            await expect(
                kaiToken.connect(burner).directBurn(amount, 8, "Invalid pillar")
            ).to.be.revertedWith("KAI: invalid pillar");
        });

        it("Should reject zero amount burn", async function () {
            await expect(
                kaiToken.connect(burner).directBurn(0, 1, "Zero burn")
            ).to.be.revertedWith("KAI: amount is zero");
        });

        it("Should reject burn if insufficient balance", async function () {
            const amount = ethers.parseEther("999999999"); // More than balance
            await expect(
                kaiToken.connect(burner).directBurn(amount, 1, "Too much")
            ).to.be.revertedWith("KAI: insufficient balance");
        });

        it("Should emit PillarBurn event", async function () {
            const amount = ethers.parseEther("100");
            await expect(
                kaiToken.connect(burner).directBurn(amount, 3, "Climate burn")
            )
                .to.emit(kaiToken, "PillarBurn")
                .withArgs(burner.address, 3, amount, "Climate burn");
        });
    });

    describe("Transfers", function () {
        it("Should allow basic transfer", async function () {
            const amount = ethers.parseEther("1000");
            await kaiToken.connect(treasury).transfer(user1.address, amount);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should allow transferFrom with approval", async function () {
            const amount = ethers.parseEther("1000");
            await kaiToken.connect(treasury).approve(user1.address, amount);
            await kaiToken.connect(user1).transferFrom(treasury.address, user2.address, amount);
            expect(await kaiToken.balanceOf(user2.address)).to.equal(amount);
        });

        it("Should not allow transfer when paused", async function () {
            await kaiToken.connect(pauser).pause();
            const amount = ethers.parseEther("1000");

            await expect(
                kaiToken.connect(treasury).transfer(user1.address, amount)
            ).to.be.reverted;
        });

        it("Should allow transfer after unpause", async function () {
            await kaiToken.connect(pauser).pause();
            await kaiToken.connect(pauser).unpause();

            const amount = ethers.parseEther("1000");
            await kaiToken.connect(treasury).transfer(user1.address, amount);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(amount);
        });
    });

    describe("Pause Functionality", function () {
        it("Should allow pauser to pause", async function () {
            await kaiToken.connect(pauser).pause();
            expect(await kaiToken.paused()).to.be.true;
        });

        it("Should allow pauser to unpause", async function () {
            await kaiToken.connect(pauser).pause();
            await kaiToken.connect(pauser).unpause();
            expect(await kaiToken.paused()).to.be.false;
        });

        it("Should not allow non-pauser to pause", async function () {
            await expect(
                kaiToken.connect(user1).pause()
            ).to.be.reverted;
        });

        it("Should block oracle minting when paused", async function () {
            await kaiToken.connect(pauser).pause();
            await expect(
                kaiToken.oracleMint(user1.address, ethers.parseEther("100"), 1)
            ).to.be.reverted;
        });

        it("Should block burning when paused", async function () {
            await kaiToken.connect(treasury).transfer(burner.address, ethers.parseEther("1000"));
            await kaiToken.connect(pauser).pause();
            await expect(
                kaiToken.connect(burner).directBurn(ethers.parseEther("100"), 1, "Test")
            ).to.be.reverted;
        });
    });

    describe("Pillar Burn Rates", function () {
        it("Should return correct burn rates for each pillar", async function () {
            // Expected rates from contract constructor (basis points)
            const expectedRates = {
                1: 1000,  // Climate: 10%
                2: 500,   // Agriculture: 5%
                3: 1500,  // Food certification: 15%
                4: 200,   // Governance: 2%
                5: 800,   // Law/audit: 8%
                6: 1200,  // Disaster: 12%
                7: 600    // AI: 6%
            };

            for (let i = 1; i <= 7; i++) {
                const rate = await kaiToken.pillarBurnRates(i);
                expect(rate).to.equal(expectedRates[i]);
            }
        });

        it("Should allow admin to update burn rate", async function () {
            await kaiToken.updatePillarBurnRate(1, 1500); // Update climate to 15%
            expect(await kaiToken.pillarBurnRates(1)).to.equal(1500);
        });

        it("Should reject burn rate over 50%", async function () {
            await expect(
                kaiToken.updatePillarBurnRate(1, 5001)
            ).to.be.revertedWith("KAI: burn rate too high");
        });

        it("Should reject invalid pillar ID for update", async function () {
            await expect(
                kaiToken.updatePillarBurnRate(0, 1000)
            ).to.be.revertedWith("KAI: invalid pillar");
            await expect(
                kaiToken.updatePillarBurnRate(8, 1000)
            ).to.be.revertedWith("KAI: invalid pillar");
        });
    });

    describe("Statistics", function () {
        it("Should track total supply correctly", async function () {
            const initial = await kaiToken.totalSupply();
            const mintAmount = ethers.parseEther("1000");

            // Use oracleMint (owner has ORACLE_ROLE)
            await kaiToken.oracleMint(user1.address, mintAmount, 1);
            expect(await kaiToken.totalSupply()).to.equal(initial + mintAmount);
        });

        it("Should track cumulative burns", async function () {
            await kaiToken.connect(treasury).transfer(burner.address, ethers.parseEther("1000"));

            await kaiToken.connect(burner).directBurn(ethers.parseEther("100"), 1, "Burn 1");
            await kaiToken.connect(burner).directBurn(ethers.parseEther("200"), 2, "Burn 2");

            expect(await kaiToken.totalBurned()).to.equal(ethers.parseEther("300"));
        });

        it("Should return correct burn stats", async function () {
            await kaiToken.connect(treasury).transfer(burner.address, ethers.parseEther("1000"));
            await kaiToken.connect(burner).directBurn(ethers.parseEther("100"), 1, "Test burn");

            const [totalBurned, totalSupply, percentBurned] = await kaiToken.getBurnStats();
            expect(totalBurned).to.equal(ethers.parseEther("100"));
            expect(totalSupply).to.equal(INITIAL_MINT - ethers.parseEther("100"));
        });

        it("Should return correct circulating supply", async function () {
            const circulating = await kaiToken.circulatingSupply();
            expect(circulating).to.equal(INITIAL_MINT);
        });
    });

    /**
     * SECURITY FIX TESTS
     * These tests verify that critical security vulnerabilities have been fixed
     */
    describe("Security Fixes", function () {
        describe("CRITICAL-001: Burn Approval Requirement", function () {
            beforeEach(async function () {
                // Give user1 some tokens
                await kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("10000"));
            });

            it("Should NOT allow burning from another address without approval", async function () {
                // Burner tries to burn user1's tokens without approval
                // This was the CRITICAL-001 vulnerability - previously would succeed!
                await expect(
                    kaiToken.connect(burner).burnForPillar(
                        user1.address,
                        ethers.parseEther("1000"),
                        1,
                        "Unauthorized burn attempt"
                    )
                ).to.be.revertedWith("KAI: burn amount exceeds allowance");
            });

            it("Should allow burning from another address WITH approval", async function () {
                // User1 approves burner to spend their tokens
                const burnAmount = ethers.parseEther("1000");
                // Pillar 1 has 10% burn rate, so actual burn = 100 KAI
                const actualBurn = ethers.parseEther("100");

                await kaiToken.connect(user1).approve(burner.address, actualBurn);

                // Now burner can burn from user1
                await kaiToken.connect(burner).burnForPillar(
                    user1.address,
                    burnAmount,
                    1,
                    "Approved burn"
                );

                expect(await kaiToken.totalBurned()).to.equal(actualBurn);
            });

            it("Should allow burner to burn their OWN tokens without approval", async function () {
                // Give burner tokens
                await kaiToken.connect(treasury).transfer(burner.address, ethers.parseEther("1000"));

                // Burner can burn their own tokens
                await kaiToken.connect(burner).burnForPillar(
                    burner.address,
                    ethers.parseEther("1000"),
                    1,
                    "Self burn"
                );

                // 10% of 1000 = 100 burned
                expect(await kaiToken.totalBurned()).to.equal(ethers.parseEther("100"));
            });

            it("Should deduct from allowance after burning", async function () {
                const burnAmount = ethers.parseEther("1000");
                const actualBurn = ethers.parseEther("100"); // 10% burn rate for pillar 1
                const totalApproval = ethers.parseEther("200");

                await kaiToken.connect(user1).approve(burner.address, totalApproval);

                await kaiToken.connect(burner).burnForPillar(
                    user1.address,
                    burnAmount,
                    1,
                    "Burn 1"
                );

                // Allowance should be reduced
                expect(await kaiToken.allowance(user1.address, burner.address))
                    .to.equal(totalApproval - actualBurn);
            });
        });

        describe("Oracle Mint Rate Limiting", function () {
            it("Should enforce daily oracle mint limit", async function () {
                const dailyLimit = ethers.parseEther("10000000"); // 10M KAI per day
                const underLimit = ethers.parseEther("5000000"); // 5M KAI

                // First mint should succeed
                await kaiToken.oracleMint(user1.address, underLimit, 1);
                expect(await kaiToken.balanceOf(user1.address)).to.equal(underLimit);

                // Second mint should also succeed (10M total)
                await kaiToken.oracleMint(user1.address, underLimit, 1);

                // Third mint should fail (would exceed 10M daily limit)
                await expect(
                    kaiToken.oracleMint(user1.address, underLimit, 1)
                ).to.be.revertedWith("KAI: daily oracle mint limit exceeded");
            });

            it("Should reset daily limit after 24 hours", async function () {
                const underLimit = ethers.parseEther("5000000"); // 5M KAI

                // Mint twice (10M total)
                await kaiToken.oracleMint(user1.address, underLimit, 1);
                await kaiToken.oracleMint(user1.address, underLimit, 1);

                // Fast forward 24 hours
                await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
                await ethers.provider.send("evm_mine");

                // Should be able to mint again
                await kaiToken.oracleMint(user1.address, underLimit, 1);
                expect(await kaiToken.balanceOf(user1.address)).to.equal(underLimit * BigInt(3));
            });
        });
    });
});
