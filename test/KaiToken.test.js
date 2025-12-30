/**
 * KAI Token Test Suite
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KAI Token", function () {
  let kaiToken;
  let owner;
  let treasury;
  let user1;
  let user2;

  const INITIAL_SUPPLY = ethers.parseEther("100000000"); // 100M KAI
  const MAX_SUPPLY = ethers.parseEther("1000000000"); // 1B KAI

  beforeEach(async function () {
    [owner, treasury, user1, user2] = await ethers.getSigners();

    const KaiToken = await ethers.getContractFactory("KaiToken");
    kaiToken = await KaiToken.deploy(owner.address, treasury.address);
    await kaiToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await kaiToken.name()).to.equal("KAI");
      expect(await kaiToken.symbol()).to.equal("KAI");
    });

    it("Should mint initial supply to treasury", async function () {
      expect(await kaiToken.balanceOf(treasury.address)).to.equal(INITIAL_SUPPLY);
    });

    it("Should set total supply correctly", async function () {
      expect(await kaiToken.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("Should grant admin role to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await kaiToken.DEFAULT_ADMIN_ROLE();
      expect(await kaiToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should set max supply correctly", async function () {
      expect(await kaiToken.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });
  });

  describe("Token Transfers", function () {
    beforeEach(async function () {
      // Transfer some tokens from treasury to user1
      await kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("1000"));
    });

    it("Should transfer tokens between accounts", async function () {
      await kaiToken.connect(user1).transfer(user2.address, ethers.parseEther("500"));
      expect(await kaiToken.balanceOf(user2.address)).to.equal(ethers.parseEther("500"));
    });

    it("Should fail if sender has insufficient balance", async function () {
      await expect(
        kaiToken.connect(user1).transfer(user2.address, ethers.parseEther("2000"))
      ).to.be.revertedWithCustomError(kaiToken, "ERC20InsufficientBalance");
    });

    it("Should update balances after transfer", async function () {
      const initialUser1Balance = await kaiToken.balanceOf(user1.address);
      await kaiToken.connect(user1).transfer(user2.address, ethers.parseEther("100"));

      expect(await kaiToken.balanceOf(user1.address)).to.equal(
        initialUser1Balance - ethers.parseEther("100")
      );
      expect(await kaiToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const MINTER_ROLE = await kaiToken.MINTER_ROLE();
      expect(await kaiToken.hasRole(MINTER_ROLE, owner.address)).to.be.true;

      await kaiToken.mint(user1.address, ethers.parseEther("1000"));
      expect(await kaiToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Should not allow non-minter to mint", async function () {
      await expect(
        kaiToken.connect(user1).mint(user2.address, ethers.parseEther("1000"))
      ).to.be.reverted;
    });

    it("Should not exceed max supply", async function () {
      const remaining = MAX_SUPPLY - INITIAL_SUPPLY;

      // Try to mint more than remaining
      await expect(
        kaiToken.mint(user1.address, remaining + ethers.parseEther("1"))
      ).to.be.revertedWith("Exceeds max supply");
    });

    it("Should track impact mints correctly", async function () {
      // Grant pillar role
      await kaiToken.grantPillarRole(user1.address);

      // Impact mint
      await kaiToken.connect(user1).impactMint(
        user2.address,
        ethers.parseEther("100"),
        "disaster"
      );

      expect(await kaiToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("1000"));
    });

    it("Should burn tokens", async function () {
      await kaiToken.connect(user1).burn(ethers.parseEther("500"));
      expect(await kaiToken.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
    });

    it("Should track total burned", async function () {
      await kaiToken.connect(user1).burn(ethers.parseEther("500"));
      expect(await kaiToken.totalBurned()).to.equal(ethers.parseEther("500"));
    });

    it("Should reduce total supply after burn", async function () {
      const supplyBefore = await kaiToken.totalSupply();
      await kaiToken.connect(user1).burn(ethers.parseEther("500"));
      expect(await kaiToken.totalSupply()).to.equal(supplyBefore - ethers.parseEther("500"));
    });
  });

  describe("Pausing", function () {
    it("Should pause and unpause", async function () {
      await kaiToken.pause("Emergency test");
      expect(await kaiToken.paused()).to.be.true;

      await kaiToken.unpause();
      expect(await kaiToken.paused()).to.be.false;
    });

    it("Should prevent transfers when paused", async function () {
      await kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("1000"));
      await kaiToken.pause("Emergency test");

      await expect(
        kaiToken.connect(user1).transfer(user2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(kaiToken, "EnforcedPause");
    });

    it("Should allow transfers after unpause", async function () {
      await kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("1000"));
      await kaiToken.pause("Emergency test");
      await kaiToken.unpause();

      await kaiToken.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      expect(await kaiToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Inflation", function () {
    it("Should calculate allowed inflation", async function () {
      // Set inflation rate to 5%
      await kaiToken.setInflationRate(500);
      expect(await kaiToken.annualInflationBasisPoints()).to.equal(500);

      // Right after setting, inflation should be very small (minimal time passed)
      const inflation = await kaiToken.calculateAllowedInflation();
      // Should be less than 1 KAI given minimal time elapsed
      expect(inflation).to.be.lt(ethers.parseEther("1"));
    });

    it("Should not exceed max inflation rate", async function () {
      await expect(
        kaiToken.setInflationRate(600) // 6% > 5% max
      ).to.be.revertedWith("Rate exceeds maximum");
    });
  });

  describe("Pillar Roles", function () {
    it("Should grant pillar role", async function () {
      await kaiToken.grantPillarRole(user1.address);
      const PILLAR_ROLE = await kaiToken.PILLAR_ROLE();
      expect(await kaiToken.hasRole(PILLAR_ROLE, user1.address)).to.be.true;
    });

    it("Should revoke pillar role", async function () {
      await kaiToken.grantPillarRole(user1.address);
      await kaiToken.revokePillarRole(user1.address);
      const PILLAR_ROLE = await kaiToken.PILLAR_ROLE();
      expect(await kaiToken.hasRole(PILLAR_ROLE, user1.address)).to.be.false;
    });

    it("Should not allow non-admin to grant pillar role", async function () {
      await expect(
        kaiToken.connect(user1).grantPillarRole(user2.address)
      ).to.be.reverted;
    });
  });

  describe("Governance Features", function () {
    it("Should support delegation via ERC20Votes", async function () {
      await kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("1000"));

      // Self-delegate to activate voting
      await kaiToken.connect(user1).delegate(user1.address);

      const votes = await kaiToken.getVotes(user1.address);
      expect(votes).to.equal(ethers.parseEther("1000"));
    });

    it("Should allow delegation to another account", async function () {
      await kaiToken.connect(treasury).transfer(user1.address, ethers.parseEther("1000"));

      // Delegate to user2
      await kaiToken.connect(user1).delegate(user2.address);

      expect(await kaiToken.getVotes(user2.address)).to.equal(ethers.parseEther("1000"));
      expect(await kaiToken.getVotes(user1.address)).to.equal(0);
    });
  });

  describe("Permit (Gasless Approval)", function () {
    it("Should support EIP-2612 permit", async function () {
      // Verify the contract has permit functionality
      expect(await kaiToken.DOMAIN_SEPARATOR()).to.not.equal(ethers.ZeroHash);
    });
  });
});
