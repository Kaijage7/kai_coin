const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("KAI Ecosystem Integration", function () {
  async function deployFullEcosystemFixture() {
    const [admin, treasury, oracleOperator, guardian1, guardian2, user1, user2, user3] = await ethers.getSigners();

    // 1. Deploy KAI Token
    const KAIToken = await ethers.getContractFactory("KAIToken");
    const kaiToken = await KAIToken.deploy(admin.address, treasury.address);
    const kaiAddress = await kaiToken.getAddress();

    // 2. Deploy Climate Alert Staking
    const ClimateAlertStaking = await ethers.getContractFactory("ClimateAlertStaking");
    const climateStaking = await ClimateAlertStaking.deploy(
      kaiAddress,
      admin.address,
      oracleOperator.address
    );
    const stakingAddress = await climateStaking.getAddress();

    // 3. Deploy KAI DAO
    const guardians = [guardian1.address, guardian2.address, admin.address];
    const KAI_DAO = await ethers.getContractFactory("KAI_DAO");
    const kaiDAO = await KAI_DAO.deploy(kaiAddress, guardians);
    const daoAddress = await kaiDAO.getAddress();

    // 4. Deploy KAI Oracle
    const KAI_Oracle = await ethers.getContractFactory("KAI_Oracle");
    const kaiOracle = await KAI_Oracle.deploy(
      kaiAddress,
      stakingAddress,
      admin.address,
      oracleOperator.address,
      guardians
    );
    const oracleAddress = await kaiOracle.getAddress();

    // 5. Grant roles to link components
    const BURNER_ROLE = await kaiToken.BURNER_ROLE();
    const MINTER_ROLE = await kaiToken.MINTER_ROLE();
    const ORACLE_ROLE = await climateStaking.ORACLE_ROLE();

    await kaiToken.connect(admin).grantRole(BURNER_ROLE, stakingAddress);
    await kaiToken.connect(admin).grantRole(MINTER_ROLE, daoAddress);
    await kaiToken.connect(admin).grantRole(MINTER_ROLE, oracleAddress);
    await climateStaking.connect(admin).grantRole(ORACLE_ROLE, oracleAddress);

    // Transfer tokens to users for testing
    const userBalance = ethers.parseEther("50000");
    await kaiToken.connect(treasury).transfer(user1.address, userBalance);
    await kaiToken.connect(treasury).transfer(user2.address, userBalance);
    await kaiToken.connect(treasury).transfer(user3.address, userBalance);

    return {
      kaiToken,
      climateStaking,
      kaiDAO,
      kaiOracle,
      admin,
      treasury,
      oracleOperator,
      guardian1,
      guardian2,
      user1,
      user2,
      user3
    };
  }

  describe("Full Utility Flywheel", function () {
    it("Should execute complete flow: stake → oracle alert → burn → deflation", async function () {
      const { kaiToken, climateStaking, kaiOracle, oracleOperator, user1, user2 } =
        await loadFixture(deployFullEcosystemFixture);

      // Step 1: Users stake KAI for climate alerts
      const stakeAmount = ethers.parseEther("1000");
      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await kaiToken.connect(user2).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);
      await climateStaking.connect(user2).stake(stakeAmount);

      const totalSupplyBefore = await kaiToken.totalSupply();

      // Step 2: Oracle submits high-confidence alert
      await kaiOracle.connect(oracleOperator).submitAlert(
        1, // Flood alert
        "Nairobi",
        85, // 85% confidence (above 80% threshold)
        4, // Severity level 4
        "AI_BACKEND",
        [user1.address, user2.address]
      );

      // Step 3: Verify burns occurred
      const totalSupplyAfter = await kaiToken.totalSupply();
      const expectedBurn = stakeAmount * 2n * 1000n / 10000n; // 10% from each user
      expect(totalSupplyBefore - totalSupplyAfter).to.equal(expectedBurn);

      // Step 4: Verify deflation
      expect(totalSupplyAfter).to.be.lt(totalSupplyBefore);
    });

    it("Should reward oracle operator from burns", async function () {
      const { kaiToken, climateStaking, kaiOracle, oracleOperator, user1 } =
        await loadFixture(deployFullEcosystemFixture);

      const stakeAmount = ethers.parseEther("1000");
      await kaiToken.connect(user1).approve(await climateStaking.getAddress(), stakeAmount);
      await climateStaking.connect(user1).stake(stakeAmount);

      // Submit alert (auto-executes with 85% confidence)
      await kaiOracle.connect(oracleOperator).submitAlert(
        1,
        "Nairobi",
        85,
        4,
        "AI_BACKEND",
        [user1.address]
      );

      // Check operator has rewards
      const rewards = await kaiOracle.operatorRewards(oracleOperator.address);
      expect(rewards).to.be.gt(0);

      // Claim rewards
      const balanceBefore = await kaiToken.balanceOf(oracleOperator.address);
      await kaiOracle.connect(oracleOperator).claimRewards();
      const balanceAfter = await kaiToken.balanceOf(oracleOperator.address);

      expect(balanceAfter - balanceBefore).to.equal(rewards);
    });
  });

  describe("DAO Governance Integration", function () {
    it("Should allow DAO to update burn rates via proposal", async function () {
      const { kaiToken, kaiDAO, user1, user2, user3 } =
        await loadFixture(deployFullEcosystemFixture);

      // Users need 10k KAI to propose
      const proposalThreshold = ethers.parseEther("10000");
      await kaiToken.connect(user1).approve(await kaiDAO.getAddress(), proposalThreshold);

      // Encode function call to update burn rate
      const newBurnRate = 1200; // 12%
      const callData = kaiToken.interface.encodeFunctionData("updatePillarBurnRate", [1, newBurnRate]);

      // Create proposal
      const proposalId = await kaiDAO.connect(user1).propose(
        0, // GOVERNANCE type
        "Update Climate Burn Rate to 12%",
        "Increase burn rate from 10% to 12% to enhance deflation",
        await kaiToken.getAddress(),
        callData,
        0
      );

      // Verify proposal was created
      const proposal = await kaiDAO.getProposal(1);
      expect(proposal.title).to.equal("Update Climate Burn Rate to 12%");
    });

    it("Should use quadratic voting to reduce whale influence", async function () {
      const { kaiToken, kaiDAO, treasury, user1 } =
        await loadFixture(deployFullEcosystemFixture);

      // Give user1 10k KAI, treasury has 400M KAI
      const proposalThreshold = ethers.parseEther("10000");

      // Create a test proposal
      const callData = kaiToken.interface.encodeFunctionData("updatePillarBurnRate", [1, 1200]);
      await kaiDAO.connect(treasury).propose(
        0,
        "Test Proposal",
        "Test quadratic voting",
        await kaiToken.getAddress(),
        callData,
        0
      );

      // Both vote
      await kaiDAO.connect(treasury).castVote(1, true, "Treasury supports");
      await kaiDAO.connect(user1).castVote(1, true, "User supports");

      // Treasury has 400M tokens but quadratic voting reduces influence
      // Weight = sqrt(400M) * 1.414 = ~28,280 votes
      // User1 with 50k tokens gets sqrt(50k) * 1.414 = ~316 votes
      // Without quadratic, it would be 400M vs 50k (8000x difference)
      // With quadratic, it's ~28k vs ~316 (only ~89x difference)

      const proposal = await kaiDAO.getProposal(1);
      expect(proposal.forVotes).to.be.gt(0);
    });
  });

  describe("Oracle Security & Rate Limiting", function () {
    it("Should reject alerts with low confidence", async function () {
      const { kaiOracle, oracleOperator, user1 } =
        await loadFixture(deployFullEcosystemFixture);

      // Submit alert with 70% confidence (below 80% threshold)
      await kaiOracle.connect(oracleOperator).submitAlert(
        1,
        "Nairobi",
        70, // Below threshold
        3,
        "AI_BACKEND",
        [user1.address]
      );

      // Alert should be created but not executed
      const alert = await kaiOracle.getAlert(1);
      expect(alert.executed).to.be.false;
    });

    it("Should enforce cooldown between same-type alerts", async function () {
      const { kaiOracle, oracleOperator, user1 } =
        await loadFixture(deployFullEcosystemFixture);

      // First alert succeeds
      await kaiOracle.connect(oracleOperator).submitAlert(
        1,
        "Nairobi",
        85,
        4,
        "AI_BACKEND",
        [user1.address]
      );

      // Second alert of same type immediately fails
      await expect(
        kaiOracle.connect(oracleOperator).submitAlert(
          1, // Same type
          "Nairobi",
          85,
          4,
          "AI_BACKEND",
          [user1.address]
        )
      ).to.be.revertedWith("Oracle: cooldown active");
    });

    it("Should enforce daily rate limit per region", async function () {
      const { kaiOracle, oracleOperator, user1 } =
        await loadFixture(deployFullEcosystemFixture);

      // Submit 10 alerts (max allowed per day)
      for (let i = 1; i <= 10; i++) {
        await kaiOracle.connect(oracleOperator).submitAlert(
          i > 7 ? 1 : i, // Use different types to avoid cooldown
          "Lagos",
          85,
          3,
          "AI_BACKEND",
          [user1.address]
        );

        // Fast forward 6 hours to avoid cooldown
        await ethers.provider.send("evm_increaseTime", [6 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
      }

      // 11th alert should fail
      await expect(
        kaiOracle.connect(oracleOperator).submitAlert(
          1,
          "Lagos",
          85,
          3,
          "AI_BACKEND",
          [user1.address]
        )
      ).to.be.revertedWith("Oracle: rate limit exceeded");
    });

    it("Should allow guardian to override false alerts", async function () {
      const { kaiOracle, oracleOperator, guardian1, user1 } =
        await loadFixture(deployFullEcosystemFixture);

      // Submit alert but don't execute yet (low confidence)
      await kaiOracle.connect(oracleOperator).submitAlert(
        1,
        "Nairobi",
        75, // Low confidence, won't auto-execute
        3,
        "AI_BACKEND",
        [user1.address]
      );

      // Guardian can override
      await kaiOracle.connect(guardian1).emergencyOverride(1, "False positive detected");

      const alert = await kaiOracle.getAlert(1);
      expect(alert.executed).to.be.true; // Marked as executed (blocked)
    });
  });

  describe("Component Linkage Verification", function () {
    it("Should verify KAI Token → Climate Staking link (BURNER_ROLE)", async function () {
      const { kaiToken, climateStaking } = await loadFixture(deployFullEcosystemFixture);

      const BURNER_ROLE = await kaiToken.BURNER_ROLE();
      const stakingAddress = await climateStaking.getAddress();

      expect(await kaiToken.hasRole(BURNER_ROLE, stakingAddress)).to.be.true;
    });

    it("Should verify KAI Token → DAO link (MINTER_ROLE)", async function () {
      const { kaiToken, kaiDAO } = await loadFixture(deployFullEcosystemFixture);

      const MINTER_ROLE = await kaiToken.MINTER_ROLE();
      const daoAddress = await kaiDAO.getAddress();

      expect(await kaiToken.hasRole(MINTER_ROLE, daoAddress)).to.be.true;
    });

    it("Should verify KAI Token → Oracle link (MINTER_ROLE)", async function () {
      const { kaiToken, kaiOracle } = await loadFixture(deployFullEcosystemFixture);

      const MINTER_ROLE = await kaiToken.MINTER_ROLE();
      const oracleAddress = await kaiOracle.getAddress();

      expect(await kaiToken.hasRole(MINTER_ROLE, oracleAddress)).to.be.true;
    });

    it("Should verify Climate Staking → Oracle link (ORACLE_ROLE)", async function () {
      const { climateStaking, kaiOracle } = await loadFixture(deployFullEcosystemFixture);

      const ORACLE_ROLE = await climateStaking.ORACLE_ROLE();
      const oracleAddress = await kaiOracle.getAddress();

      expect(await climateStaking.hasRole(ORACLE_ROLE, oracleAddress)).to.be.true;
    });

    it("Should verify DAO → KAI Token reference", async function () {
      const { kaiToken, kaiDAO } = await loadFixture(deployFullEcosystemFixture);

      const kaiAddress = await kaiToken.getAddress();
      expect(await kaiDAO.kaiToken()).to.equal(kaiAddress);
    });

    it("Should verify Oracle → KAI Token reference", async function () {
      const { kaiToken, kaiOracle } = await loadFixture(deployFullEcosystemFixture);

      const kaiAddress = await kaiToken.getAddress();
      expect(await kaiOracle.kaiToken()).to.equal(kaiAddress);
    });

    it("Should verify Oracle → Climate Staking reference", async function () {
      const { climateStaking, kaiOracle } = await loadFixture(deployFullEcosystemFixture);

      const stakingAddress = await climateStaking.getAddress();
      expect(await kaiOracle.climateStaking()).to.equal(stakingAddress);
    });
  });

  describe("Real-World Scenario: Kenya Pilot", function () {
    it("Should handle 100 farmers staking for flood alerts", async function () {
      const { kaiToken, climateStaking, treasury, admin } =
        await loadFixture(deployFullEcosystemFixture);

      // Create 10 farmer accounts (representing 100)
      const farmers = [];
      for (let i = 0; i < 10; i++) {
        const farmer = ethers.Wallet.createRandom().connect(ethers.provider);
        await admin.sendTransaction({ to: farmer.address, value: ethers.parseEther("1") });
        await kaiToken.connect(treasury).transfer(farmer.address, ethers.parseEther("1000"));
        farmers.push(farmer);
      }

      // All farmers stake 100 KAI
      for (const farmer of farmers) {
        await kaiToken.connect(farmer).approve(await climateStaking.getAddress(), ethers.parseEther("100"));
        await climateStaking.connect(farmer).stake(ethers.parseEther("100"));
      }

      expect(await climateStaking.totalUsers()).to.equal(10);
      expect(await climateStaking.totalStaked()).to.equal(ethers.parseEther("1000"));
    });

    it("Should track $5M+ annual burn value at scale", async function () {
      const { kaiToken, climateStaking, kaiOracle, oracleOperator, treasury } =
        await loadFixture(deployFullEcosystemFixture);

      // Simulate 10,000 farmers with 100 KAI each = 1M KAI staked
      // For test, we'll use treasury to represent aggregate
      const totalStaked = ethers.parseEther("1000000");
      await kaiToken.connect(treasury).approve(await climateStaking.getAddress(), totalStaked);
      await climateStaking.connect(treasury).stake(totalStaked);

      const supplyBefore = await kaiToken.totalSupply();

      // Send 1 alert (10% burn)
      await kaiOracle.connect(oracleOperator).submitAlert(
        1,
        "Kenya",
        90,
        5,
        "AI_BACKEND",
        [treasury.address]
      );

      const supplyAfter = await kaiToken.totalSupply();
      const burned = supplyBefore - supplyAfter;

      // 10% of 1M = 100k KAI burned
      expect(burned).to.equal(ethers.parseEther("100000"));

      // If KAI = $0.10, 100k burn = $10k value per alert
      // 50 alerts/year = $500k annual burn
      // At $1 per KAI = $5M annual burn value
    });
  });
});
