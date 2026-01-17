/**
 * KAI Revenue - Comprehensive Test Suite
 *
 * Tests:
 * - Alert purchases (pay-per-use)
 * - Subscription management
 * - Revenue tracking
 * - Treasury management
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KAIRevenue", function () {
    let KAIToken;
    let KAIRevenue;
    let kaiToken;
    let kaiRevenue;
    let owner;
    let tokenTreasury;  // Treasury that receives initial token mint
    let revenueTreasury; // Treasury that receives revenue payments
    let user1;
    let user2;

    const ALERT_BASIC = ethers.parseEther("10");
    const ALERT_PREMIUM = ethers.parseEther("20");
    const ALERT_URGENT = ethers.parseEther("30");
    const SUBSCRIPTION_BASIC = ethers.parseEther("50");
    const SUBSCRIPTION_PREMIUM = ethers.parseEther("150");
    const SUBSCRIPTION_ENTERPRISE = ethers.parseEther("500");

    beforeEach(async function () {
        [owner, tokenTreasury, revenueTreasury, user1, user2] = await ethers.getSigners();

        // Deploy KAI Token with required constructor params (admin, treasury)
        KAIToken = await ethers.getContractFactory("KAIToken");
        kaiToken = await KAIToken.deploy(owner.address, tokenTreasury.address);
        await kaiToken.waitForDeployment();

        // Deploy KAI Revenue with required constructor params (token, treasury, admin)
        KAIRevenue = await ethers.getContractFactory("KAIRevenue");
        kaiRevenue = await KAIRevenue.deploy(
            await kaiToken.getAddress(),
            revenueTreasury.address,
            owner.address  // admin parameter
        );
        await kaiRevenue.waitForDeployment();

        // Transfer tokens to users for testing (from tokenTreasury which has the initial mint)
        await kaiToken.connect(tokenTreasury).transfer(user1.address, ethers.parseEther("10000"));
        await kaiToken.connect(tokenTreasury).transfer(user2.address, ethers.parseEther("10000"));

        // Approve revenue contract to spend user tokens
        await kaiToken.connect(user1).approve(
            await kaiRevenue.getAddress(),
            ethers.MaxUint256
        );
        await kaiToken.connect(user2).approve(
            await kaiRevenue.getAddress(),
            ethers.MaxUint256
        );
    });

    describe("Deployment", function () {
        it("Should set correct KAI token address", async function () {
            expect(await kaiRevenue.kaiToken()).to.equal(await kaiToken.getAddress());
        });

        it("Should set correct treasury address", async function () {
            expect(await kaiRevenue.treasury()).to.equal(revenueTreasury.address);
        });

        it("Should initialize with zero revenue", async function () {
            expect(await kaiRevenue.totalRevenue()).to.equal(0);
            expect(await kaiRevenue.monthlyRevenue()).to.equal(0);
        });

        it("Should set correct pricing constants", async function () {
            expect(await kaiRevenue.ALERT_BASIC()).to.equal(ALERT_BASIC);
            expect(await kaiRevenue.ALERT_URGENT()).to.equal(ALERT_URGENT);
            expect(await kaiRevenue.SUBSCRIPTION_BASIC()).to.equal(SUBSCRIPTION_BASIC);
            expect(await kaiRevenue.SUBSCRIPTION_PREMIUM()).to.equal(SUBSCRIPTION_PREMIUM);
        });

        it("Should reject zero address for token", async function () {
            await expect(
                KAIRevenue.deploy(ethers.ZeroAddress, revenueTreasury.address, owner.address)
            ).to.be.revertedWith("Invalid token");
        });

        it("Should reject zero address for treasury", async function () {
            await expect(
                KAIRevenue.deploy(await kaiToken.getAddress(), ethers.ZeroAddress, owner.address)
            ).to.be.revertedWith("Invalid treasury");
        });

        it("Should reject zero address for admin", async function () {
            await expect(
                KAIRevenue.deploy(await kaiToken.getAddress(), revenueTreasury.address, ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid admin");
        });
    });

    describe("Buy Alert", function () {
        // AlertType enum: Flood=0(premium), Drought=1(basic), Locust=2(premium),
        // Cyclone=3(urgent), Disease=4(basic), Heatwave=5(basic), Wildfire=6(urgent)
        const ALERT_DROUGHT = 1;  // Basic price (10 KAI)
        const ALERT_FLOOD = 0;    // Premium price (20 KAI)
        const ALERT_CYCLONE = 3;  // Urgent price (30 KAI)

        it("Should allow user to buy basic alert", async function () {
            const initialBalance = await kaiToken.balanceOf(user1.address);

            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT); // Drought = basic price

            expect(await kaiToken.balanceOf(user1.address)).to.equal(
                initialBalance - ALERT_BASIC
            );
        });

        it("Should charge higher price for urgent alerts", async function () {
            const initialBalance = await kaiToken.balanceOf(user1.address);

            await kaiRevenue.connect(user1).buyAlert(ALERT_CYCLONE); // Cyclone = urgent price

            expect(await kaiToken.balanceOf(user1.address)).to.equal(
                initialBalance - ALERT_URGENT
            );
        });

        it("Should transfer payment to treasury", async function () {
            const initialTreasury = await kaiToken.balanceOf(revenueTreasury.address);

            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);

            expect(await kaiToken.balanceOf(revenueTreasury.address)).to.equal(
                initialTreasury + ALERT_BASIC
            );
        });

        it("Should increment total revenue", async function () {
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);
            expect(await kaiRevenue.totalRevenue()).to.equal(ALERT_BASIC);

            await kaiRevenue.connect(user1).buyAlert(ALERT_CYCLONE);
            expect(await kaiRevenue.totalRevenue()).to.equal(ALERT_BASIC + ALERT_URGENT);
        });

        it("Should emit RevenueCollected event", async function () {
            await expect(kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT))
                .to.emit(kaiRevenue, "RevenueCollected")
                .withArgs(ALERT_BASIC, ALERT_BASIC);
        });

        it("Should return alert ID", async function () {
            const tx = await kaiRevenue.connect(user1).buyAlert(0);
            // Alert ID should be 1 (first alert)
        });

        it("Should increment user's alert count", async function () {
            await kaiRevenue.connect(user1).buyAlert(0);
            await kaiRevenue.connect(user1).buyAlert(1);

            expect(await kaiRevenue.totalAlerts(user1.address)).to.equal(2);
        });

        it("Should fail if user has insufficient balance", async function () {
            // Transfer away most tokens
            await kaiToken.connect(user1).transfer(
                user2.address,
                ethers.parseEther("9995")
            );

            await expect(
                kaiRevenue.connect(user1).buyAlert(0)
            ).to.be.reverted;
        });

        it("Should fail if user hasn't approved contract", async function () {
            // Revoke approval
            await kaiToken.connect(user1).approve(await kaiRevenue.getAddress(), 0);

            await expect(
                kaiRevenue.connect(user1).buyAlert(0)
            ).to.be.reverted;
        });
    });

    describe("Subscriptions", function () {
        // SubscriptionPlan enum: None=0, Basic=1, Premium=2, Enterprise=3
        const PLAN_BASIC = 1;
        const PLAN_PREMIUM = 2;
        const PLAN_ENTERPRISE = 3;

        it("Should allow user to subscribe to basic plan", async function () {
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);

            const sub = await kaiRevenue.subscriptions(user1.address);
            expect(sub.active).to.be.true;
            expect(sub.plan).to.equal(PLAN_BASIC);
        });

        it("Should allow user to subscribe to premium plan", async function () {
            await kaiRevenue.connect(user1).subscribe(PLAN_PREMIUM);

            const sub = await kaiRevenue.subscriptions(user1.address);
            expect(sub.active).to.be.true;
            expect(sub.plan).to.equal(PLAN_PREMIUM);
        });

        it("Should charge correct amount for basic subscription", async function () {
            const initialBalance = await kaiToken.balanceOf(user1.address);
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(
                initialBalance - SUBSCRIPTION_BASIC
            );
        });

        it("Should charge correct amount for premium subscription", async function () {
            const initialBalance = await kaiToken.balanceOf(user1.address);
            await kaiRevenue.connect(user1).subscribe(PLAN_PREMIUM);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(
                initialBalance - SUBSCRIPTION_PREMIUM
            );
        });

        it("Should set correct expiry date (30 days)", async function () {
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);
            const sub = await kaiRevenue.subscriptions(user1.address);

            const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
            const expectedExpiry = blockTimestamp + (30 * 24 * 60 * 60);

            // Allow 5 second tolerance
            expect(sub.expiresAt).to.be.closeTo(expectedExpiry, 5);
        });

        it("Should not allow subscribing twice with active subscription", async function () {
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);

            await expect(
                kaiRevenue.connect(user1).subscribe(PLAN_BASIC)
            ).to.be.revertedWith("Already subscribed");
        });

        it("Should emit SubscriptionPurchased event", async function () {
            await expect(kaiRevenue.connect(user1).subscribe(PLAN_BASIC))
                .to.emit(kaiRevenue, "SubscriptionPurchased");
        });

        it("Should not allow subscribing with None plan", async function () {
            await expect(
                kaiRevenue.connect(user1).subscribe(0) // None
            ).to.be.revertedWith("Invalid plan");
        });
    });

    describe("Subscription Checks", function () {
        const PLAN_BASIC = 1;

        it("Should correctly check active subscription", async function () {
            expect(await kaiRevenue.hasActiveSubscription(user1.address)).to.be.false;

            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);

            expect(await kaiRevenue.hasActiveSubscription(user1.address)).to.be.true;
        });

        it("Should return false after subscription expires", async function () {
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);
            expect(await kaiRevenue.hasActiveSubscription(user1.address)).to.be.true;

            // Fast forward 31 days
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            expect(await kaiRevenue.hasActiveSubscription(user1.address)).to.be.false;
        });

        it("Should return correct subscription details", async function () {
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);

            const [plan, expiresAt, alertsUsed, active, expired] =
                await kaiRevenue.getSubscription(user1.address);

            expect(plan).to.equal(PLAN_BASIC);
            expect(active).to.be.true;
            expect(expired).to.be.false;
            expect(alertsUsed).to.equal(0);
        });
    });

    describe("Revenue Tracking", function () {
        const PLAN_BASIC = 1;
        const ALERT_DROUGHT = 1;  // Basic price
        const ALERT_CYCLONE = 3;  // Urgent price

        it("Should track total revenue across multiple purchases", async function () {
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT); // Drought - basic price
            await kaiRevenue.connect(user1).buyAlert(ALERT_CYCLONE); // Cyclone - urgent price
            await kaiRevenue.connect(user2).subscribe(PLAN_BASIC);

            const expected = ALERT_BASIC + ALERT_URGENT + SUBSCRIPTION_BASIC;
            expect(await kaiRevenue.totalRevenue()).to.equal(expected);
        });

        it("Should track monthly revenue", async function () {
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);

            const expected = ALERT_BASIC + SUBSCRIPTION_BASIC;
            expect(await kaiRevenue.monthlyRevenue()).to.equal(expected);
        });

        it("Should return correct revenue stats", async function () {
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);

            const [totalRev, monthlyRev, activeSubs, totalCust] =
                await kaiRevenue.getRevenueStats();

            expect(totalRev).to.equal(ALERT_BASIC + SUBSCRIPTION_BASIC);
            expect(monthlyRev).to.equal(ALERT_BASIC + SUBSCRIPTION_BASIC);
            expect(activeSubs).to.equal(1);
            expect(totalCust).to.equal(1);
        });
    });

    describe("Customer Statistics", function () {
        const PLAN_BASIC = 1;
        const ALERT_DROUGHT = 1;  // Basic price

        it("Should return correct customer stats", async function () {
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);

            const [spent, alerts, plan, hasSub] =
                await kaiRevenue.getCustomerStats(user1.address);

            expect(alerts).to.equal(2);
            expect(spent).to.equal(ALERT_BASIC * BigInt(2) + SUBSCRIPTION_BASIC);
            expect(hasSub).to.be.true;
            expect(plan).to.equal(PLAN_BASIC);
        });

        it("Should track total spent per user", async function () {
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);

            expect(await kaiRevenue.totalSpent(user1.address)).to.equal(ALERT_BASIC * BigInt(2));
        });
    });

    describe("Pause Functionality", function () {
        it("Should allow owner to pause", async function () {
            await kaiRevenue.pause();
            expect(await kaiRevenue.paused()).to.be.true;
        });

        it("Should block purchases when paused", async function () {
            await kaiRevenue.pause();

            await expect(
                kaiRevenue.connect(user1).buyAlert(0)
            ).to.be.reverted;
        });

        it("Should block subscriptions when paused", async function () {
            await kaiRevenue.pause();

            await expect(
                kaiRevenue.connect(user1).subscribe(0)
            ).to.be.reverted;
        });

        it("Should allow transactions after unpause", async function () {
            const ALERT_DROUGHT = 1;
            await kaiRevenue.pause();
            await kaiRevenue.unpause();

            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);
            expect(await kaiRevenue.totalRevenue()).to.equal(ALERT_BASIC);
        });
    });

    describe("Treasury Management", function () {
        const ALERT_DROUGHT = 1;

        it("Should allow admin to update treasury", async function () {
            await kaiRevenue.updateTreasury(user2.address);
            expect(await kaiRevenue.treasury()).to.equal(user2.address);
        });

        it("Should not allow zero address treasury", async function () {
            await expect(
                kaiRevenue.updateTreasury(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("Should not allow non-admin to update treasury", async function () {
            await expect(
                kaiRevenue.connect(user1).updateTreasury(user2.address)
            ).to.be.reverted;
        });

        it("Should route payments to new treasury", async function () {
            await kaiRevenue.updateTreasury(user2.address);

            const initialBalance = await kaiToken.balanceOf(user2.address);
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);

            expect(await kaiToken.balanceOf(user2.address)).to.equal(
                initialBalance + ALERT_BASIC
            );
        });
    });

    describe("Edge Cases", function () {
        const ALERT_DROUGHT = 1;  // Basic
        const ALERT_CYCLONE = 3;  // Urgent

        it("Should handle multiple users buying alerts", async function () {
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT); // Drought - basic
            await kaiRevenue.connect(user2).buyAlert(ALERT_DROUGHT); // Drought - basic
            await kaiRevenue.connect(user1).buyAlert(ALERT_CYCLONE); // Cyclone - urgent

            expect(await kaiRevenue.totalRevenue()).to.equal(
                ALERT_BASIC + ALERT_BASIC + ALERT_URGENT
            );

            expect(await kaiRevenue.totalAlerts(user1.address)).to.equal(2);
            expect(await kaiRevenue.totalAlerts(user2.address)).to.equal(1);
        });

        it("Should handle all alert types", async function () {
            // AlertType enum: Flood=0, Drought=1, Locust=2, Cyclone=3, Disease=4, Heatwave=5, Wildfire=6
            for (let i = 0; i < 7; i++) {
                await kaiRevenue.connect(user1).buyAlert(i);
            }

            expect(await kaiRevenue.totalAlerts(user1.address)).to.equal(7);
        });

        it("Should track total customers correctly", async function () {
            await kaiRevenue.connect(user1).buyAlert(ALERT_DROUGHT);
            await kaiRevenue.connect(user2).buyAlert(ALERT_DROUGHT);

            expect(await kaiRevenue.totalCustomers()).to.equal(2);
        });

        /**
         * SECURITY FIX TEST: API calls now use fixed pricing tiers
         * Previously users could set their own price (including 0)
         */
        it("Should allow API call payments with fixed pricing tiers", async function () {
            // APITier enum: Basic=0 (1 KAI), Standard=1 (5 KAI), Premium=2 (10 KAI), Bulk=3 (20 KAI)
            const API_TIER_STANDARD = 1; // 5 KAI
            const apiPrice = ethers.parseEther("5");
            const initialBalance = await kaiToken.balanceOf(user1.address);

            await kaiRevenue.connect(user1).payForAPICall("weather/forecast", API_TIER_STANDARD);

            expect(await kaiToken.balanceOf(user1.address)).to.equal(initialBalance - apiPrice);
            expect(await kaiRevenue.totalRevenue()).to.equal(apiPrice);
        });

        it("Should charge correct price for each API tier", async function () {
            // Test all API tiers
            const tiers = [
                { tier: 0, price: ethers.parseEther("1") },   // Basic
                { tier: 1, price: ethers.parseEther("5") },   // Standard
                { tier: 2, price: ethers.parseEther("10") },  // Premium
                { tier: 3, price: ethers.parseEther("20") }   // Bulk
            ];

            let totalExpected = BigInt(0);

            for (const t of tiers) {
                await kaiRevenue.connect(user1).payForAPICall("test/endpoint", t.tier);
                totalExpected += t.price;
            }

            expect(await kaiRevenue.totalRevenue()).to.equal(totalExpected);
        });
    });

    describe("Security Fixes", function () {
        it("SECURITY: API pricing cannot be manipulated by users", async function () {
            // This test verifies the CRITICAL-003 fix
            // Users can only select from predefined tiers, not set arbitrary prices

            const API_TIER_BASIC = 0; // Fixed at 1 KAI
            const expectedPrice = ethers.parseEther("1");

            const initialBalance = await kaiToken.balanceOf(user1.address);
            await kaiRevenue.connect(user1).payForAPICall("test", API_TIER_BASIC);

            // User paid exactly 1 KAI, not 0 or any other amount
            expect(await kaiToken.balanceOf(user1.address)).to.equal(initialBalance - expectedPrice);
        });

        it("SECURITY: Renewal counter bug is fixed", async function () {
            // This test verifies the HIGH-001 fix
            const PLAN_BASIC = 1;

            // Subscribe
            await kaiRevenue.connect(user1).subscribe(PLAN_BASIC);
            const initialSubscribers = await kaiRevenue.activeSubscribers();

            // Fast forward past expiration
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            // Renew subscription
            await kaiRevenue.connect(user1).renewSubscription();

            // Active subscribers should have increased (was expired, now active)
            const finalSubscribers = await kaiRevenue.activeSubscribers();
            expect(finalSubscribers).to.equal(initialSubscribers + BigInt(1));
        });
    });
});
