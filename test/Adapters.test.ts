import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("MockYieldAdapter", function () {
  async function deployFixture() {
    const [owner, vault, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const MockYieldAdapter = await ethers.getContractFactory("MockYieldAdapter");
    const adapter = await MockYieldAdapter.deploy("Test Protocol", await usdc.getAddress(), 500, 10);

    // Fund the vault signer with USDC for deposits
    const amount = ethers.parseUnits("100000", 6);
    await usdc.mint(await vault.getAddress(), amount);
    await usdc.connect(vault).approve(await adapter.getAddress(), amount);

    return { owner, vault, other, usdc, adapter, amount };
  }

  describe("Initialization", function () {
    it("should have correct protocol name", async function () {
      const { adapter } = await loadFixture(deployFixture);
      expect(await adapter.protocolName()).to.equal("Test Protocol");
    });

    it("should have correct APY", async function () {
      const { adapter } = await loadFixture(deployFixture);
      expect(await adapter.getCurrentAPY()).to.equal(500);
    });

    it("should have correct risk score", async function () {
      const { adapter } = await loadFixture(deployFixture);
      expect(await adapter.riskScore()).to.equal(10);
    });

    it("should have correct underlying token", async function () {
      const { adapter, usdc } = await loadFixture(deployFixture);
      expect(await adapter.underlyingToken()).to.equal(await usdc.getAddress());
    });

    it("should start healthy", async function () {
      const { adapter } = await loadFixture(deployFixture);
      expect(await adapter.isHealthy()).to.equal(true);
    });

    it("should start with 0 deposited", async function () {
      const { adapter } = await loadFixture(deployFixture);
      expect(await adapter.getTotalDeposited()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("should accept deposits and track total", async function () {
      const { adapter, vault, usdc } = await loadFixture(deployFixture);

      const depositAmount = ethers.parseUnits("5000", 6);
      await adapter.connect(vault).deposit(depositAmount);

      expect(await adapter.getTotalDeposited()).to.equal(depositAmount);
      expect(await usdc.balanceOf(await adapter.getAddress())).to.equal(depositAmount);
    });

    it("should accept multiple deposits", async function () {
      const { adapter, vault } = await loadFixture(deployFixture);

      const dep1 = ethers.parseUnits("1000", 6);
      const dep2 = ethers.parseUnits("2000", 6);

      await adapter.connect(vault).deposit(dep1);
      await adapter.connect(vault).deposit(dep2);

      expect(await adapter.getTotalDeposited()).to.equal(dep1 + dep2);
    });
  });

  describe("Withdrawals", function () {
    it("should withdraw and update total deposited", async function () {
      const { adapter, vault, usdc } = await loadFixture(deployFixture);

      const depositAmount = ethers.parseUnits("5000", 6);
      await adapter.connect(vault).deposit(depositAmount);

      const withdrawAmount = ethers.parseUnits("2000", 6);
      await adapter.connect(vault).withdraw(withdrawAmount);

      expect(await adapter.getTotalDeposited()).to.equal(depositAmount - withdrawAmount);
    });

    it("should return actual withdrawn amount", async function () {
      const { adapter, vault } = await loadFixture(deployFixture);

      const depositAmount = ethers.parseUnits("5000", 6);
      await adapter.connect(vault).deposit(depositAmount);

      // Withdraw full amount
      await adapter.connect(vault).withdraw(depositAmount);
      expect(await adapter.getTotalDeposited()).to.equal(0);
    });

    it("should cap withdrawal at deposited amount", async function () {
      const { adapter, vault, usdc } = await loadFixture(deployFixture);

      const depositAmount = ethers.parseUnits("1000", 6);
      await adapter.connect(vault).deposit(depositAmount);

      // Withdraw more than deposited - should only withdraw deposited amount
      const overWithdraw = ethers.parseUnits("5000", 6);
      await adapter.connect(vault).withdraw(overWithdraw);

      expect(await adapter.getTotalDeposited()).to.equal(0);
    });
  });

  describe("Admin setters", function () {
    it("should allow owner to change APY", async function () {
      const { adapter } = await loadFixture(deployFixture);

      await adapter.setAPY(800);
      expect(await adapter.getCurrentAPY()).to.equal(800);
    });

    it("should allow owner to change risk score", async function () {
      const { adapter } = await loadFixture(deployFixture);

      await adapter.setRiskScore(25);
      expect(await adapter.riskScore()).to.equal(25);
    });

    it("should allow owner to change health status", async function () {
      const { adapter } = await loadFixture(deployFixture);

      await adapter.setHealthy(false);
      expect(await adapter.isHealthy()).to.equal(false);

      await adapter.setHealthy(true);
      expect(await adapter.isHealthy()).to.equal(true);
    });

    it("should reject non-owner APY changes", async function () {
      const { adapter, other } = await loadFixture(deployFixture);

      await expect(adapter.connect(other).setAPY(800)).to.be.revertedWith("Only owner");
    });

    it("should reject non-owner risk score changes", async function () {
      const { adapter, other } = await loadFixture(deployFixture);

      await expect(adapter.connect(other).setRiskScore(50)).to.be.revertedWith("Only owner");
    });

    it("should reject non-owner health status changes", async function () {
      const { adapter, other } = await loadFixture(deployFixture);

      await expect(adapter.connect(other).setHealthy(false)).to.be.revertedWith("Only owner");
    });
  });

  describe("APY and Risk Interactions", function () {
    it("should support zero APY", async function () {
      const { adapter } = await loadFixture(deployFixture);

      await adapter.setAPY(0);
      expect(await adapter.getCurrentAPY()).to.equal(0);
    });

    it("should support very high APY", async function () {
      const { adapter } = await loadFixture(deployFixture);

      await adapter.setAPY(10000); // 100%
      expect(await adapter.getCurrentAPY()).to.equal(10000);
    });

    it("should support zero risk score", async function () {
      const { adapter } = await loadFixture(deployFixture);

      await adapter.setRiskScore(0);
      expect(await adapter.riskScore()).to.equal(0);
    });

    it("should support max risk score", async function () {
      const { adapter } = await loadFixture(deployFixture);

      await adapter.setRiskScore(100);
      expect(await adapter.riskScore()).to.equal(100);
    });
  });
});
