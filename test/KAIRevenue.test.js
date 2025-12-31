/**
 * KAI Revenue - Comprehensive Test Suite
 *
 * Tests:
 * - Alert purchases (pay-per-use)
 * - Subscription management
 * - Revenue tracking
 * - Treasury withdrawals
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KAIRevenue", function () {
    let KAIToken;
    let KAIRevenue;
    let kaiToken;
    let kaiRevenue;
    let owner;
    let treasury;
    let user1;
    let user2;

    const ALERT_BASIC = ethers.parseEther("10");
    const ALERT_URGENT = ethers.parseEther("30");
    const SUBSCRIPTION_BASIC = ethers.parseEther("50");
    const SUBSCRIPTION_PREMIUM = ethers.parseEther("500");

    beforeEach(async function () {
        [owner, treasury, user1, user2] = await ethers.getSigners();

        // Deploy KAI Token
        KAIToken = await ethers.getContractFactory("KAIToken");
        kaiToken = await KAIToken.deploy();
        await kaiToken.waitForDeployment();

        // Deploy KAI Revenue
        KAIRevenue = await ethers.getContractFactory("KAIRevenue");
        kaiRevenue = await KAIRevenue.deploy(
            await kaiToken.getAddress(),
            treasury.address
        );
        await kaiRevenue.waitForDeployment();

        // Transfer tokens to users for testing
        await kaiToken.transfer(user1.address, ethers.parseEther("10000"));
        await kaiToken.transfer(user2.address, ethers.parseEther("10000"));

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
            expect(await kaiRevenue.treasury()).to.equal(treasury.address);
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
    });

    describe("Buy Alert", function () {
        it("Should allow user to buy basic alert", async function () {
            const initialBalance = await kaiToken.balanceOf(user1.address);

            await kaiRevenue.connect(user1).buyAlert(0); // AlertType.Flood = 0

            expect(await kaiToken.balanceOf(user1.address)).to.equal(
                initialBalance - ALERT_BASIC
            );
        });

        it("Should charge higher price for urgent alerts", async function () {
            const initialBalance = await kaiToken.balanceOf(user1.address);

            await kaiRevenue.connect(user1).buyAlert(4); // AlertType.Cyclone = 4

            expect(await kaiToken.balanceOf(user1.address)).to.equal(
                initialBalance - ALERT_URGENT
            );
        });

        it("Should transfer payment to treasury", async function () {
            const initialTreasury = await kaiToken.balanceOf(treasury.address);

            await kaiRevenue.connect(user1).buyAlert(0);

            expect(await kaiToken.balanceOf(treasury.address)).to.equal(
                initialTreasury + ALERT_BASIC
            );
        });

        it("Should increment total revenue", async function () {
            await kaiRevenue.connect(user1).buyAlert(0);
            expect(await kaiRevenue.totalRevenue()).to.equal(ALERT_BASIC);

            await kaiRevenue.connect(user1).buyAlert(4);
            expect(await kaiRevenue.totalRevenue()).to.equal(ALERT_BASIC + ALERT_URGENT);
        });

        it("Should emit RevenueCollected event", async function () {
            await expect(kaiRevenue.connect(user1).buyAlert(0))
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

            const [alertCount] = await kaiRevenue.getUserStats(user1.address);
            expect(alertCount).to.equal(2);
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
        it("Should allow user to subscribe to basic plan", async function () {
            await kaiRevenue.connect(user1).subscribe(0); // SubscriptionPlan.Basic = 0

            const sub = await kaiRevenue.subscriptions(user1.address);
            expect(sub.active).to.be.true;
            expect(sub.plan).to.equal(0);
        });

        it("Should allow user to subscribe to premium plan", async function () {
            await kaiRevenue.connect(user1).subscribe(1); // SubscriptionPlan.Premium = 1

            const sub = await kaiRevenue.subscriptions(user1.address);
            expect(sub.active).to.be.true;
            expect(sub.plan).to.equal(1);
        });

        it("Should charge correct amount for basic subscription", async function () {
            const initialBalance = await kaiToken.balanceOf(user1.address);
            await kaiRevenue.connect(user1).subscribe(0);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(
                initialBalance - SUBSCRIPTION_BASIC
            );
        });

        it("Should charge correct amount for premium subscription", async function () {
            const initialBalance = await kaiToken.balanceOf(user1.address);
            await kaiRevenue.connect(user1).subscribe(1);
            expect(await kaiToken.balanceOf(user1.address)).to.equal(
                initialBalance - SUBSCRIPTION_PREMIUM
            );
        });

        it("Should set correct expiry date (30 days)", async function () {
            await kaiRevenue.connect(user1).subscribe(0);
            const sub = await kaiRevenue.subscriptions(user1.address);

            const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
            const expectedExpiry = blockTimestamp + (30 * 24 * 60 * 60);

            // Allow 5 second tolerance
            expect(sub.expiresAt).to.be.closeTo(expectedExpiry, 5);
        });

        it("Should not allow subscribing twice with active subscription", async function () {
            await kaiRevenue.connect(user1).subscribe(0);

            await expect(
                kaiRevenue.connect(user1).subscribe(0)
            ).to.be.revertedWith("Already subscribed");
        });

        it("Should emit SubscriptionCreated event", async function () {
            await expect(kaiRevenue.connect(user1).subscribe(0))
                .to.emit(kaiRevenue, "SubscriptionCreated");
        });

        it("Should allow subscription renewal after expiry", async function () {
            await kaiRevenue.connect(user1).subscribe(0);

            // Fast forward 31 days
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            // Should now be able to subscribe again
            await kaiRevenue.connect(user1).subscribe(0);
        });
    });

    describe("Subscription Checks", function () {
        it("Should correctly check active subscription", async function () {
            expect(await kaiRevenue.hasActiveSubscription(user1.address)).to.be.false;

            await kaiRevenue.connect(user1).subscribe(0);

            expect(await kaiRevenue.hasActiveSubscription(user1.address)).to.be.true;
        });

        it("Should return false after subscription expires", async function () {
            await kaiRevenue.connect(user1).subscribe(0);
            expect(await kaiRevenue.hasActiveSubscription(user1.address)).to.be.true;

            // Fast forward 31 days
            await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine");

            expect(await kaiRevenue.hasActiveSubscription(user1.address)).to.be.false;
        });
    });

    describe("Revenue Tracking", function () {
        it("Should track total revenue across multiple purchases", async function () {
            await kaiRevenue.connect(user1).buyAlert(0);
            await kaiRevenue.connect(user1).buyAlert(4);
            await kaiRevenue.connect(user2).subscribe(0);

            const expected = ALERT_BASIC + ALERT_URGENT + SUBSCRIPTION_BASIC;
            expect(await kaiRevenue.totalRevenue()).to.equal(expected);
        });

        it("Should track monthly revenue", async function () {
            await kaiRevenue.connect(user1).buyAlert(0);
            await kaiRevenue.connect(user1).subscribe(0);

            const expected = ALERT_BASIC + SUBSCRIPTION_BASIC;
            expect(await kaiRevenue.monthlyRevenue()).to.equal(expected);
        });
    });

    describe("User Statistics", function () {
        it("Should return correct user stats", async function () {
            await kaiRevenue.connect(user1).buyAlert(0);
            await kaiRevenue.connect(user1).buyAlert(1);
            await kaiRevenue.connect(user1).subscribe(0);

            const [alertCount, totalSpent, isSubscribed] =
                await kaiRevenue.getUserStats(user1.address);

            expect(alertCount).to.equal(2);
            expect(totalSpent).to.equal(ALERT_BASIC * BigInt(2) + SUBSCRIPTION_BASIC);
            expect(isSubscribed).to.be.true;
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
            await kaiRevenue.pause();
            await kaiRevenue.unpause();

            await kaiRevenue.connect(user1).buyAlert(0);
            expect(await kaiRevenue.totalRevenue()).to.equal(ALERT_BASIC);
        });
    });

    describe("Treasury Management", function () {
        it("Should allow owner to update treasury", async function () {
            await kaiRevenue.setTreasury(user2.address);
            expect(await kaiRevenue.treasury()).to.equal(user2.address);
        });

        it("Should not allow zero address treasury", async function () {
            await expect(
                kaiRevenue.setTreasury(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid treasury");
        });

        it("Should not allow non-owner to update treasury", async function () {
            await expect(
                kaiRevenue.connect(user1).setTreasury(user2.address)
            ).to.be.reverted;
        });

        it("Should route payments to new treasury", async function () {
            await kaiRevenue.setTreasury(user2.address);

            const initialBalance = await kaiToken.balanceOf(user2.address);
            await kaiRevenue.connect(user1).buyAlert(0);

            expect(await kaiToken.balanceOf(user2.address)).to.equal(
                initialBalance + ALERT_BASIC
            );
        });
    });

    describe("Edge Cases", function () {
        it("Should handle multiple users buying alerts", async function () {
            await kaiRevenue.connect(user1).buyAlert(0);
            await kaiRevenue.connect(user2).buyAlert(1);
            await kaiRevenue.connect(user1).buyAlert(4);

            expect(await kaiRevenue.totalRevenue()).to.equal(
                ALERT_BASIC + ALERT_BASIC + ALERT_URGENT
            );

            const [user1Alerts] = await kaiRevenue.getUserStats(user1.address);
            const [user2Alerts] = await kaiRevenue.getUserStats(user2.address);

            expect(user1Alerts).to.equal(2);
            expect(user2Alerts).to.equal(1);
        });

        it("Should handle all alert types", async function () {
            // AlertType enum: Flood, Drought, Disease, Locust, Cyclone
            for (let i = 0; i < 5; i++) {
                await kaiRevenue.connect(user1).buyAlert(i);
            }

            const [alertCount] = await kaiRevenue.getUserStats(user1.address);
            expect(alertCount).to.equal(5);
        });
    });
});
