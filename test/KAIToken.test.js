/**
 * KAI Token - Comprehensive Test Suite
 *
 * Tests:
 * - Deployment and initialization
 * - Role-based access control
 * - Minting and burning
 * - Transfer restrictions
 * - Pillar-specific burns
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KAIToken", function () {
    let KAIToken;
    let kaiToken;
    let owner;
    let minter;
    let burner;
    let pauser;
    let user1;
    let user2;

    // Role constants
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));

    beforeEach(async function () {
        [owner, minter, burner, pauser, user1, user2] = await ethers.getSigners();

        KAIToken = await ethers.getContractFactory("KAIToken");
        kaiToken = await KAIToken.deploy();
        await kaiToken.waitForDeployment();

        // Grant roles
        await kaiToken.grantRole(MINTER_ROLE, minter.address);
        await kaiToken.grantRole(BURNER_ROLE, burner.address);
        await kaiToken.grantRole(PAUSER_ROLE, pauser.address);
    });

    describe("Deployment", function () {
        it("Should set correct name and symbol", async function () {
            expect(await kaiToken.name()).to.equal("KAI Africa Resilience Token");
            expect(await kaiToken.symbol()).to.equal("KAI");
        });

        it("Should set correct decimals", async function () {
            expect(await kaiToken.decimals()).to.equal(18);
        });

        it("Should mint initial supply to deployer", async function () {
            const initialSupply = ethers.parseEther("1000000000"); // 1 billion
            expect(await kaiToken.balanceOf(owner.address)).to.equal(initialSupply);
        });

        it("Should set deployer as default admin", async function () {
            expect(await kaiToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should initialize total burned to 0", async function () {
            expect(await kaiToken.totalBurned()).to.equal(0);
        });
    });

    describe("Role-Based Access Control", function () {
        it("Should allow admin to grant minter role", async function () {
            await kaiToken.grantRole(MINTER_ROLE, user1.address);
            expect(await kaiToken.hasRole(MINTER_ROLE, user1.address)).to.be.true;
        });

        it("Should allow admin to revoke roles", async function () {
            await kaiToken.revokeRole(MINTER_ROLE, minter.address);
            expect(await kaiToken.hasRole(MINTER_ROLE, minter.address)).to.be.false;
        });

        it("Should not allow non-admin to grant roles", async function () {
            await expect(
                kaiToken.connect(user1).grantRole(MINTER_ROLE, user2.address)
            ).to.be.reverted;
        });
    });

    describe("Minting", function () {
        it("Should allow minter to mint tokens", async function () {
            const amount = ethers.parseEther("1000");
            await kaiToken.connect(minter).mint(user1.address, amount);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should not allow non-minter to mint", async function () {
            const amount = ethers.parseEther("1000");
            await expect(
                kaiToken.connect(user1).mint(user2.address, amount)
            ).to.be.reverted;
        });

        it("Should update total supply after minting", async function () {
            const initialSupply = await kaiToken.totalSupply();
            const amount = ethers.parseEther("1000");
            await kaiToken.connect(minter).mint(user1.address, amount);
            expect(await kaiToken.totalSupply()).to.equal(initialSupply + amount);
        });
    });

    describe("Burning", function () {
        beforeEach(async function () {
            // Give burner some tokens
            await kaiToken.transfer(burner.address, ethers.parseEther("10000"));
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
            await kaiToken.transfer(user1.address, amount);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should allow transferFrom with approval", async function () {
            const amount = ethers.parseEther("1000");
            await kaiToken.approve(user1.address, amount);
            await kaiToken.connect(user1).transferFrom(owner.address, user2.address, amount);
            expect(await kaiToken.balanceOf(user2.address)).to.equal(amount);
        });

        it("Should not allow transfer when paused", async function () {
            await kaiToken.connect(pauser).pause();
            const amount = ethers.parseEther("1000");

            await expect(
                kaiToken.transfer(user1.address, amount)
            ).to.be.reverted;
        });

        it("Should allow transfer after unpause", async function () {
            await kaiToken.connect(pauser).pause();
            await kaiToken.connect(pauser).unpause();

            const amount = ethers.parseEther("1000");
            await kaiToken.transfer(user1.address, amount);
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

        it("Should block minting when paused", async function () {
            await kaiToken.connect(pauser).pause();
            await expect(
                kaiToken.connect(minter).mint(user1.address, ethers.parseEther("100"))
            ).to.be.reverted;
        });

        it("Should block burning when paused", async function () {
            await kaiToken.transfer(burner.address, ethers.parseEther("1000"));
            await kaiToken.connect(pauser).pause();
            await expect(
                kaiToken.connect(burner).directBurn(ethers.parseEther("100"), 1, "Test")
            ).to.be.reverted;
        });
    });

    describe("Pillar Burn Rates", function () {
        it("Should return correct burn rates for each pillar", async function () {
            const rates = [];
            for (let i = 1; i <= 7; i++) {
                const rate = await kaiToken.getPillarBurnRate(i);
                rates.push(rate);
            }

            // Check rates are between 1-5%
            for (const rate of rates) {
                expect(rate).to.be.gte(100); // 1%
                expect(rate).to.be.lte(500); // 5%
            }
        });

        it("Should reject invalid pillar ID for burn rate", async function () {
            await expect(
                kaiToken.getPillarBurnRate(0)
            ).to.be.revertedWith("Invalid pillar");

            await expect(
                kaiToken.getPillarBurnRate(8)
            ).to.be.revertedWith("Invalid pillar");
        });
    });

    describe("Statistics", function () {
        it("Should track total supply correctly", async function () {
            const initial = await kaiToken.totalSupply();
            const mintAmount = ethers.parseEther("1000");

            await kaiToken.connect(minter).mint(user1.address, mintAmount);
            expect(await kaiToken.totalSupply()).to.equal(initial + mintAmount);
        });

        it("Should track cumulative burns", async function () {
            await kaiToken.transfer(burner.address, ethers.parseEther("1000"));

            await kaiToken.connect(burner).directBurn(ethers.parseEther("100"), 1, "Burn 1");
            await kaiToken.connect(burner).directBurn(ethers.parseEther("200"), 2, "Burn 2");

            expect(await kaiToken.totalBurned()).to.equal(ethers.parseEther("300"));
        });
    });
});
