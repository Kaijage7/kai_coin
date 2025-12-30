const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Climate Alert Staking", function () {
  async function deployClimateStakingFixture() {
    const [admin, oracle, user1, user2, user3] = await ethers.getSigners();

    // Deploy KAI Token
    const KAIToken = await ethers.getContractFactory("KAIToken");
    const kaiToken = await KAIToken.deploy(admin.address, admin.address);

    // Deploy Climate Staking
    const ClimateAlertStaking = await ethers.getContractFactory("ClimateAlertStaking");
    const climateStaking = await ClimateAlertStaking.deploy(
      await kaiToken.getAddress(),
      admin.address,
      oracle.address
    );

    // Grant BURNER_ROLE to staking contract
    const BURNER_ROLE = await kaiToken.BURNER_ROLE();
    await kaiToken.connect(admin).grantRole(BURNER_ROLE, await climateStaking.getAddress());

    // Transfer tokens to users for testing
    const userBalance = ethers.parseEther("10000");
    await kaiToken.connect(admin).transfer(user1.address, userBalance);
    await kaiToken.connect(admin).transfer(user2.address, userBalance);
    await kaiToken.connect(admin).transfer(user3.address, userBalance);

    return { kaiToken, climateStaking, admin, oracle, user1, user2, user3 };
  }

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      const { climateStaking, kaiToken } = await loadFixture(deployClimateStakingFixture);

      expect(await climateStaking.kaiToken()).to.equal(await kaiToken.getAddress());
      expect(await climateStaking.MIN_STAKE()).to.equal(ethers.parseEther("100"));
      expect(await climateStaking.ALERT_BURN_RATE()).to.equal(1000); // 10%
    });

    it("Should grant oracle role correctly", async function () {
      const { climateStaking, oracle } = await loadFixture(deployClimateStakingFixture);
      const ORACLE_ROLE = await climateStaking.ORACLE_ROLE();

      expect(await climateStaking.hasRole(ORACLE_ROLE, oracle.address)).to.be.true;
    });
  });

  describe("Staking", function () {
    it("Should allow user to stake 100 KAI minimum", async function () {
      const { climateStaking, kaiToken, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      const stake = await climateStaking.getStake(user1.address);
      expect(stake.amount).to.equal(stakeAmount);
      expect(stake.active).to.be.true;
    });

    it("Should revert if staking below minimum", async function () {
      const { climateStaking, kaiToken, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("50"); // Below 100 minimum

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);

      await expect(
        climateStaking.connect(user1).stake(stakeAmount)
      ).to.be.revertedWith("ClimateStake: below minimum");
    });

    it("Should increment total users on first stake", async function () {
      const { climateStaking, kaiToken, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      expect(await climateStaking.totalUsers()).to.equal(1);
    });

    it("Should allow multiple stakes from same user", async function () {
      const { climateStaking, kaiToken, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount * 2n);
      await climateStaking.connect(user1).stake(stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      const stake = await climateStaking.getStake(user1.address);
      expect(stake.amount).to.equal(stakeAmount * 2n);
    });

    it("Should emit Staked event", async function () {
      const { climateStaking, kaiToken, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);

      await expect(climateStaking.connect(user1).stake(stakeAmount))
        .to.emit(climateStaking, "Staked")
        .withArgs(user1.address, stakeAmount, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));
    });
  });

  describe("Unstaking", function () {
    it("Should allow user to unstake", async function () {
      const { climateStaking, kaiToken, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      const balanceBefore = await kaiToken.balanceOf(user1.address);
      await climateStaking.connect(user1).unstake();
      const balanceAfter = await kaiToken.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(stakeAmount);
    });

    it("Should reset stake to zero after unstaking", async function () {
      const { climateStaking, kaiToken, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);
      await climateStaking.connect(user1).unstake();

      const stake = await climateStaking.getStake(user1.address);
      expect(stake.amount).to.equal(0);
      expect(stake.active).to.be.false;
    });

    it("Should decrement total users on unstake", async function () {
      const { climateStaking, kaiToken, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);
      await climateStaking.connect(user1).unstake();

      expect(await climateStaking.totalUsers()).to.equal(0);
    });

    it("Should revert if no stake exists", async function () {
      const { climateStaking, user1 } = await loadFixture(deployClimateStakingFixture);

      await expect(
        climateStaking.connect(user1).unstake()
      ).to.be.revertedWith("ClimateStake: no stake found");
    });
  });

  describe("Alert System", function () {
    it("Should allow oracle to send alerts", async function () {
      const { climateStaking, kaiToken, oracle, user1, user2 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("1000");

      // Stake from two users
      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);
      await kaiToken.connect(user2).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user2).stake(stakeAmount);

      // Send alert
      await climateStaking.connect(oracle).sendAlert(
        1, // Flood alert
        "Nairobi",
        [user1.address, user2.address]
      );

      expect(await climateStaking.alertCount()).to.equal(1);
    });

    it("Should burn 10% from each staker on alert", async function () {
      const { climateStaking, kaiToken, oracle, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("1000");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      await climateStaking.connect(oracle).sendAlert(1, "Nairobi", [user1.address]);

      const stake = await climateStaking.getStake(user1.address);
      const expectedRemaining = stakeAmount - (stakeAmount * 1000n / 10000n); // 90% remains
      expect(stake.amount).to.equal(expectedRemaining);
    });

    it("Should increment alerts received counter", async function () {
      const { climateStaking, kaiToken, oracle, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("1000");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      await climateStaking.connect(oracle).sendAlert(1, "Nairobi", [user1.address]);

      const stake = await climateStaking.getStake(user1.address);
      expect(stake.alertsReceived).to.equal(1);
    });

    it("Should deactivate stake if falling below minimum", async function () {
      const { climateStaking, kaiToken, oracle, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100"); // Minimum stake

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      // Send alert - will burn 10 KAI, leaving 90 KAI (below 100 minimum)
      await climateStaking.connect(oracle).sendAlert(1, "Nairobi", [user1.address]);

      const stake = await climateStaking.getStake(user1.address);
      expect(stake.active).to.be.false;
    });

    it("Should emit AlertSent event", async function () {
      const { climateStaking, kaiToken, oracle, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("1000");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      await expect(
        climateStaking.connect(oracle).sendAlert(1, "Nairobi", [user1.address])
      ).to.emit(climateStaking, "AlertSent");
    });

    it("Should revert if non-oracle tries to send alert", async function () {
      const { climateStaking, user1, user2 } = await loadFixture(deployClimateStakingFixture);

      await expect(
        climateStaking.connect(user1).sendAlert(1, "Nairobi", [user2.address])
      ).to.be.reverted;
    });

    it("Should track total burned per user", async function () {
      const { climateStaking, kaiToken, oracle, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("1000");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      await climateStaking.connect(oracle).sendAlert(1, "Nairobi", [user1.address]);

      const stake = await climateStaking.getStake(user1.address);
      const expectedBurned = stakeAmount * 1000n / 10000n; // 10%
      expect(stake.totalBurned).to.equal(expectedBurned);
    });
  });

  describe("Platform Stats", function () {
    it("Should return correct platform stats", async function () {
      const { climateStaking, kaiToken, oracle, user1, user2 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("500");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);
      await kaiToken.connect(user2).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user2).stake(stakeAmount);

      await climateStaking.connect(oracle).sendAlert(1, "Nairobi", [user1.address, user2.address]);

      const stats = await climateStaking.getPlatformStats();
      expect(stats._totalUsers).to.equal(2);
      expect(stats._alertCount).to.equal(1);
      expect(stats._totalAlertsSent).to.equal(2); // 2 recipients
    });
  });

  describe("Pause Functionality", function () {
    it("Should pause staking", async function () {
      const { climateStaking, kaiToken, admin, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await climateStaking.connect(admin).pause();
      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);

      await expect(
        climateStaking.connect(user1).stake(stakeAmount)
      ).to.be.reverted;
    });

    it("Should pause alert sending", async function () {
      const { climateStaking, admin, oracle, user1 } = await loadFixture(deployClimateStakingFixture);

      await climateStaking.connect(admin).pause();

      await expect(
        climateStaking.connect(oracle).sendAlert(1, "Nairobi", [user1.address])
      ).to.be.reverted;
    });

    it("Should allow unstaking when paused", async function () {
      const { climateStaking, kaiToken, admin, user1 } = await loadFixture(deployClimateStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      await climateStaking.connect(admin).pause();

      await expect(climateStaking.connect(user1).unstake()).to.not.be.reverted;
    });
  });
});
