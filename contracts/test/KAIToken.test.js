const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("KAI Token", function () {
  // Fixture to deploy the contract
  async function deployKAITokenFixture() {
    const [admin, treasury, burner, minter, oracle, user1, user2] = await ethers.getSigners();

    const KAIToken = await ethers.getContractFactory("KAIToken");
    const kaiToken = await KAIToken.deploy(admin.address, treasury.address);

    return { kaiToken, admin, treasury, burner, minter, oracle, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should deploy with correct name and symbol", async function () {
      const { kaiToken } = await loadFixture(deployKAITokenFixture);
      expect(await kaiToken.name()).to.equal("KAI Coin");
      expect(await kaiToken.symbol()).to.equal("KAI");
    });

    it("Should mint initial 400M tokens to treasury", async function () {
      const { kaiToken, treasury } = await loadFixture(deployKAITokenFixture);
      const initialMint = ethers.parseEther("400000000");
      expect(await kaiToken.balanceOf(treasury.address)).to.equal(initialMint);
    });

    it("Should set correct max supply", async function () {
      const { kaiToken } = await loadFixture(deployKAITokenFixture);
      const maxSupply = ethers.parseEther("1000000000");
      expect(await kaiToken.MAX_SUPPLY()).to.equal(maxSupply);
    });

    it("Should grant admin all roles", async function () {
      const { kaiToken, admin } = await loadFixture(deployKAITokenFixture);
      const PAUSER_ROLE = await kaiToken.PAUSER_ROLE();
      const MINTER_ROLE = await kaiToken.MINTER_ROLE();
      const BURNER_ROLE = await kaiToken.BURNER_ROLE();
      const ORACLE_ROLE = await kaiToken.ORACLE_ROLE();

      expect(await kaiToken.hasRole(PAUSER_ROLE, admin.address)).to.be.true;
      expect(await kaiToken.hasRole(MINTER_ROLE, admin.address)).to.be.true;
      expect(await kaiToken.hasRole(BURNER_ROLE, admin.address)).to.be.true;
      expect(await kaiToken.hasRole(ORACLE_ROLE, admin.address)).to.be.true;
    });

    it("Should set correct pillar burn rates", async function () {
      const { kaiToken } = await loadFixture(deployKAITokenFixture);
      expect(await kaiToken.pillarBurnRates(1)).to.equal(1000); // Climate: 10%
      expect(await kaiToken.pillarBurnRates(2)).to.equal(500);  // Agriculture: 5%
      expect(await kaiToken.pillarBurnRates(3)).to.equal(1500); // Food: 15%
      expect(await kaiToken.pillarBurnRates(4)).to.equal(200);  // Governance: 2%
      expect(await kaiToken.pillarBurnRates(5)).to.equal(800);  // Law: 8%
      expect(await kaiToken.pillarBurnRates(6)).to.equal(1200); // Disaster: 12%
      expect(await kaiToken.pillarBurnRates(7)).to.equal(600);  // AI: 6%
    });
  });

  describe("Pillar Burns", function () {
    it("Should burn correct amount for climate pillar (10%)", async function () {
      const { kaiToken, admin, treasury } = await loadFixture(deployKAITokenFixture);
      const burnAmount = ethers.parseEther("1000");

      const BURNER_ROLE = await kaiToken.BURNER_ROLE();
      await kaiToken.connect(admin).grantRole(BURNER_ROLE, admin.address);

      await kaiToken.connect(admin).burnForPillar(
        treasury.address,
        burnAmount,
        1, // Climate pillar
        "Climate alert subscription"
      );

      // 10% of 1000 = 100 tokens burned
      const expectedBurn = ethers.parseEther("100");
      expect(await kaiToken.totalBurned()).to.equal(expectedBurn);
    });

    it("Should burn correct amount for food pillar (15%)", async function () {
      const { kaiToken, admin, treasury } = await loadFixture(deployKAITokenFixture);
      const burnAmount = ethers.parseEther("1000");

      const BURNER_ROLE = await kaiToken.BURNER_ROLE();
      await kaiToken.connect(admin).grantRole(BURNER_ROLE, admin.address);

      await kaiToken.connect(admin).burnForPillar(
        treasury.address,
        burnAmount,
        3, // Food certification pillar
        "Food safety certification"
      );

      // 15% of 1000 = 150 tokens burned
      const expectedBurn = ethers.parseEther("150");
      expect(await kaiToken.totalBurned()).to.equal(expectedBurn);
    });

    it("Should revert if non-burner tries to burn", async function () {
      const { kaiToken, user1, treasury } = await loadFixture(deployKAITokenFixture);
      const burnAmount = ethers.parseEther("1000");

      await expect(
        kaiToken.connect(user1).burnForPillar(
          treasury.address,
          burnAmount,
          1,
          "Unauthorized burn"
        )
      ).to.be.reverted;
    });

    it("Should revert for invalid pillar ID", async function () {
      const { kaiToken, admin, treasury } = await loadFixture(deployKAITokenFixture);
      const burnAmount = ethers.parseEther("1000");

      await expect(
        kaiToken.connect(admin).burnForPillar(
          treasury.address,
          burnAmount,
          8, // Invalid pillar
          "Invalid burn"
        )
      ).to.be.revertedWith("KAI: invalid pillar");
    });

    it("Should emit PillarBurn event", async function () {
      const { kaiToken, admin, treasury } = await loadFixture(deployKAITokenFixture);
      const burnAmount = ethers.parseEther("1000");
      const expectedBurn = ethers.parseEther("100");

      await expect(
        kaiToken.connect(admin).burnForPillar(
          treasury.address,
          burnAmount,
          1,
          "Climate alert"
        )
      ).to.emit(kaiToken, "PillarBurn")
       .withArgs(treasury.address, 1, expectedBurn, "Climate alert");
    });
  });

  describe("Oracle Mint", function () {
    it("Should mint tokens via oracle for disaster relief", async function () {
      const { kaiToken, admin, user1 } = await loadFixture(deployKAITokenFixture);
      const mintAmount = ethers.parseEther("10000");

      await kaiToken.connect(admin).oracleMint(
        user1.address,
        mintAmount,
        6 // Disaster pillar
      );

      expect(await kaiToken.balanceOf(user1.address)).to.equal(mintAmount);
    });

    it("Should revert if exceeding max supply", async function () {
      const { kaiToken, admin, user1 } = await loadFixture(deployKAITokenFixture);
      const excessiveAmount = ethers.parseEther("700000000"); // Would exceed 1B max

      await expect(
        kaiToken.connect(admin).oracleMint(user1.address, excessiveAmount, 1)
      ).to.be.revertedWith("KAI: max supply exceeded");
    });

    it("Should revert if non-oracle tries to mint", async function () {
      const { kaiToken, user1 } = await loadFixture(deployKAITokenFixture);
      const mintAmount = ethers.parseEther("1000");

      await expect(
        kaiToken.connect(user1).oracleMint(user1.address, mintAmount, 1)
      ).to.be.reverted;
    });

    it("Should emit OracleTriggered event", async function () {
      const { kaiToken, admin, user1 } = await loadFixture(deployKAITokenFixture);
      const mintAmount = ethers.parseEther("1000");

      await expect(
        kaiToken.connect(admin).oracleMint(user1.address, mintAmount, 6)
      ).to.emit(kaiToken, "OracleTriggered")
       .withArgs(6, user1.address, mintAmount);
    });
  });

  describe("Burn Rate Updates", function () {
    it("Should allow admin to update pillar burn rate", async function () {
      const { kaiToken, admin } = await loadFixture(deployKAITokenFixture);

      await kaiToken.connect(admin).updatePillarBurnRate(1, 1500); // Change climate to 15%
      expect(await kaiToken.pillarBurnRates(1)).to.equal(1500);
    });

    it("Should revert if burn rate exceeds 50%", async function () {
      const { kaiToken, admin } = await loadFixture(deployKAITokenFixture);

      await expect(
        kaiToken.connect(admin).updatePillarBurnRate(1, 6000) // 60%
      ).to.be.revertedWith("KAI: burn rate too high");
    });

    it("Should revert if non-admin tries to update", async function () {
      const { kaiToken, user1 } = await loadFixture(deployKAITokenFixture);

      await expect(
        kaiToken.connect(user1).updatePillarBurnRate(1, 1500)
      ).to.be.reverted;
    });
  });

  describe("Pause Functionality", function () {
    it("Should pause transfers", async function () {
      const { kaiToken, admin, treasury, user1 } = await loadFixture(deployKAITokenFixture);

      await kaiToken.connect(admin).pause();

      await expect(
        kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("100"))
      ).to.be.reverted;
    });

    it("Should unpause transfers", async function () {
      const { kaiToken, admin, treasury, user1 } = await loadFixture(deployKAITokenFixture);

      await kaiToken.connect(admin).pause();
      await kaiToken.connect(admin).unpause();

      await expect(
        kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("100"))
      ).to.not.be.reverted;
    });

    it("Should prevent burns when paused", async function () {
      const { kaiToken, admin, treasury } = await loadFixture(deployKAITokenFixture);

      await kaiToken.connect(admin).pause();

      await expect(
        kaiToken.connect(admin).burnForPillar(
          treasury.address,
          ethers.parseEther("1000"),
          1,
          "Test"
        )
      ).to.be.reverted;
    });
  });

  describe("Burn Stats", function () {
    it("Should return correct burn stats", async function () {
      const { kaiToken, admin, treasury } = await loadFixture(deployKAITokenFixture);
      const burnAmount = ethers.parseEther("1000");

      await kaiToken.connect(admin).burnForPillar(
        treasury.address,
        burnAmount,
        1,
        "Test"
      );

      const stats = await kaiToken.getBurnStats();
      expect(stats._totalBurned).to.equal(ethers.parseEther("100")); // 10% of 1000
      expect(stats._totalSupply).to.equal(ethers.parseEther("400000000").sub(ethers.parseEther("100")));
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant roles", async function () {
      const { kaiToken, admin, user1 } = await loadFixture(deployKAITokenFixture);
      const BURNER_ROLE = await kaiToken.BURNER_ROLE();

      await kaiToken.connect(admin).grantRole(BURNER_ROLE, user1.address);
      expect(await kaiToken.hasRole(BURNER_ROLE, user1.address)).to.be.true;
    });

    it("Should allow admin to revoke roles", async function () {
      const { kaiToken, admin, user1 } = await loadFixture(deployKAITokenFixture);
      const BURNER_ROLE = await kaiToken.BURNER_ROLE();

      await kaiToken.connect(admin).grantRole(BURNER_ROLE, user1.address);
      await kaiToken.connect(admin).revokeRole(BURNER_ROLE, user1.address);
      expect(await kaiToken.hasRole(BURNER_ROLE, user1.address)).to.be.false;
    });
  });
});
