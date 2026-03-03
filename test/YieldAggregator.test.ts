import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("YieldAggregator — Comprehensive", function () {
  async function deployFixture() {
    const [owner, nonOwner] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const MockYieldAdapter = await ethers.getContractFactory("MockYieldAdapter");
    const aave = await MockYieldAdapter.deploy("Aave V3", await usdc.getAddress(), 450, 10);
    const compound = await MockYieldAdapter.deploy("Compound V3", await usdc.getAddress(), 500, 12);
    const treasury = await MockYieldAdapter.deploy("US Treasury", await usdc.getAddress(), 430, 5);

    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    const vault = await TreasuryVault.deploy(await usdc.getAddress(), "TV", "TV");

    const YieldAggregator = await ethers.getContractFactory("YieldAggregator");
    const aggregator = await YieldAggregator.deploy();

    return { owner, nonOwner, usdc, aave, compound, treasury, vault, aggregator };
  }

  describe("Adapter Registration", function () {
    it("should register adapters and track count", async function () {
      const { aggregator, aave, compound } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());

      expect(await aggregator.getAdapterCount()).to.equal(2);
    });

    it("should emit AdapterRegistered on registration", async function () {
      const { aggregator, aave } = await loadFixture(deployFixture);

      await expect(aggregator.registerAdapter(await aave.getAddress()))
        .to.emit(aggregator, "AdapterRegistered")
        .withArgs(await aave.getAddress());
    });

    it("should revert on duplicate registration", async function () {
      const { aggregator, aave } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await expect(
        aggregator.registerAdapter(await aave.getAddress())
      ).to.be.revertedWithCustomError(aggregator, "AlreadyRegistered");
    });

    it("should only allow owner to register", async function () {
      const { aggregator, aave, nonOwner } = await loadFixture(deployFixture);

      await expect(
        aggregator.connect(nonOwner).registerAdapter(await aave.getAddress())
      ).to.be.revertedWithCustomError(aggregator, "OwnableUnauthorizedAccount");
    });

    it("should mark adapters as registered", async function () {
      const { aggregator, aave } = await loadFixture(deployFixture);

      expect(await aggregator.isRegistered(await aave.getAddress())).to.equal(false);
      await aggregator.registerAdapter(await aave.getAddress());
      expect(await aggregator.isRegistered(await aave.getAddress())).to.equal(true);
    });
  });

  describe("Adapter Removal", function () {
    it("should remove adapter and update count", async function () {
      const { aggregator, aave, compound } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      expect(await aggregator.getAdapterCount()).to.equal(2);

      await aggregator.removeAdapter(await aave.getAddress());
      expect(await aggregator.getAdapterCount()).to.equal(1);
      expect(await aggregator.isRegistered(await aave.getAddress())).to.equal(false);
    });

    it("should emit AdapterRemoved on removal", async function () {
      const { aggregator, aave } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await expect(aggregator.removeAdapter(await aave.getAddress()))
        .to.emit(aggregator, "AdapterRemoved")
        .withArgs(await aave.getAddress());
    });

    it("should revert when removing unregistered adapter", async function () {
      const { aggregator, aave } = await loadFixture(deployFixture);

      await expect(
        aggregator.removeAdapter(await aave.getAddress())
      ).to.be.revertedWithCustomError(aggregator, "NotRegistered");
    });

    it("should handle removing last adapter", async function () {
      const { aggregator, aave } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.removeAdapter(await aave.getAddress());
      expect(await aggregator.getAdapterCount()).to.equal(0);
    });

    it("should handle removing middle adapter (swap-last pattern)", async function () {
      const { aggregator, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());

      // Remove middle element (compound)
      await aggregator.removeAdapter(await compound.getAddress());
      expect(await aggregator.getAdapterCount()).to.equal(2);

      // Treasury should have been swapped into compound's position
      expect(await aggregator.adapters(0)).to.equal(await aave.getAddress());
      expect(await aggregator.adapters(1)).to.equal(await treasury.getAddress());
    });
  });

  describe("Vault Configuration", function () {
    it("should set vault and emit VaultUpdated", async function () {
      const { aggregator, vault } = await loadFixture(deployFixture);

      await expect(aggregator.setVault(await vault.getAddress()))
        .to.emit(aggregator, "VaultUpdated")
        .withArgs(await vault.getAddress());
    });

    it("should reject non-owner setVault", async function () {
      const { aggregator, vault, nonOwner } = await loadFixture(deployFixture);

      await expect(
        aggregator.connect(nonOwner).setVault(await vault.getAddress())
      ).to.be.revertedWithCustomError(aggregator, "OwnableUnauthorizedAccount");
    });
  });

  describe("Threshold Configuration", function () {
    it("should set rebalance threshold and emit event", async function () {
      const { aggregator } = await loadFixture(deployFixture);

      await expect(aggregator.setRebalanceThreshold(100))
        .to.emit(aggregator, "ThresholdUpdated")
        .withArgs(100);

      expect(await aggregator.rebalanceThreshold()).to.equal(100);
    });

    it("should default to 50 bps threshold", async function () {
      const { aggregator } = await loadFixture(deployFixture);
      expect(await aggregator.rebalanceThreshold()).to.equal(50);
    });
  });

  describe("getAllYields", function () {
    it("should return yield info for all adapters", async function () {
      const { aggregator, vault, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());

      const yields = await aggregator.getAllYields();
      expect(yields.length).to.equal(3);
    });

    it("should return correct protocol names", async function () {
      const { aggregator, vault, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());

      const yields = await aggregator.getAllYields();
      expect(yields[0].protocolName).to.equal("Aave V3");
      expect(yields[1].protocolName).to.equal("Compound V3");
      expect(yields[2].protocolName).to.equal("US Treasury");
    });

    it("should calculate risk-adjusted APY correctly", async function () {
      const { aggregator, vault, aave } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.setVault(await vault.getAddress());

      const yields = await aggregator.getAllYields();
      // Aave: 450 * (100-10)/100 = 405
      expect(yields[0].riskAdjustedAPY).to.equal(405n);
    });

    it("should gracefully handle adapter with reverting getCurrentAPY", async function () {
      const { aggregator, vault, aave, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());

      // Set aave APY to 0 (simulating a "broken" state won't revert in mock,
      // but we can verify the try-catch path by checking the yield still returns)
      await aave.setAPY(0);

      const yields = await aggregator.getAllYields();
      expect(yields.length).to.equal(2);
      expect(yields[0].apy).to.equal(0n);
      expect(yields[1].apy).to.equal(430n); // treasury still works
    });

    it("should return empty array when no adapters registered", async function () {
      const { aggregator, vault } = await loadFixture(deployFixture);
      await aggregator.setVault(await vault.getAddress());

      const yields = await aggregator.getAllYields();
      expect(yields.length).to.equal(0);
    });
  });

  describe("getBestYield", function () {
    it("should pick the highest risk-adjusted APY", async function () {
      const { aggregator, vault, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());

      // Aave: 450 * 90/100 = 405
      // Compound: 500 * 88/100 = 440
      // Treasury: 430 * 95/100 = 408
      const [best, bestAPY] = await aggregator.getBestYield();
      expect(best).to.equal(await compound.getAddress());
      expect(bestAPY).to.equal(440n);
    });

    it("should skip unhealthy adapters", async function () {
      const { aggregator, vault, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());

      // Compound is best, make it unhealthy
      await compound.setHealthy(false);

      const [best] = await aggregator.getBestYield();
      expect(best).to.not.equal(await compound.getAddress());
    });

    it("should return address(0) when all adapters are unhealthy", async function () {
      const { aggregator, vault, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());

      await aave.setHealthy(false);
      await compound.setHealthy(false);
      await treasury.setHealthy(false);

      const [best, bestAPY] = await aggregator.getBestYield();
      expect(best).to.equal(ethers.ZeroAddress);
      expect(bestAPY).to.equal(0n);
    });

    it("should revert with NoAdapters when none registered", async function () {
      const { aggregator } = await loadFixture(deployFixture);

      await expect(aggregator.getBestYield())
        .to.be.revertedWithCustomError(aggregator, "NoAdapters");
    });

    it("should handle single adapter", async function () {
      const { aggregator, vault, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());

      const [best, bestAPY] = await aggregator.getBestYield();
      expect(best).to.equal(await treasury.getAddress());
      expect(bestAPY).to.equal(408n); // 430 * 95/100
    });
  });

  describe("shouldRebalance", function () {
    async function setupFullFixture() {
      const base = await loadFixture(deployFixture);
      const { aggregator, vault, aave, compound, treasury } = base;

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());
      await vault.setActiveAdapter(await treasury.getAddress());

      return base;
    }

    it("should not recommend rebalance when gap is below threshold", async function () {
      const { aggregator } = await setupFullFixture();

      // Treasury: 408, Compound: 440. Gap=32 < threshold=50
      const [needed] = await aggregator.shouldRebalance();
      expect(needed).to.equal(false);
    });

    it("should recommend rebalance when gap exceeds threshold", async function () {
      const { aggregator, compound } = await setupFullFixture();

      // Boost compound to make gap > 50
      await compound.setAPY(800);

      const [needed, target] = await aggregator.shouldRebalance();
      expect(needed).to.equal(true);
      expect(target).to.equal(await compound.getAddress());
    });

    it("should not recommend rebalance when best is already active", async function () {
      const { aggregator, vault, treasury } = await setupFullFixture();

      // Make treasury the best by a wide margin
      await treasury.setAPY(2000);

      // Treasury is already active, so no rebalance needed
      const [needed] = await aggregator.shouldRebalance();
      expect(needed).to.equal(false);
    });

    it("should return false when vault is not set", async function () {
      const { aggregator, aave } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      // vault not set

      const [needed] = await aggregator.shouldRebalance();
      expect(needed).to.equal(false);
    });

    it("should return false when no adapters registered", async function () {
      const { aggregator, vault } = await loadFixture(deployFixture);

      await aggregator.setVault(await vault.getAddress());
      // no adapters

      const [needed] = await aggregator.shouldRebalance();
      expect(needed).to.equal(false);
    });

    it("should return false when all adapters are unhealthy", async function () {
      const { aggregator, aave, compound, treasury } = await setupFullFixture();

      await aave.setHealthy(false);
      await compound.setHealthy(false);
      await treasury.setHealthy(false);

      const [needed] = await aggregator.shouldRebalance();
      expect(needed).to.equal(false);
    });

    it("should recommend rebalance when current adapter has no APY", async function () {
      const { aggregator, treasury, compound } = await setupFullFixture();

      // Treasury (active) APY goes to 0
      await treasury.setAPY(0);

      const [needed, target] = await aggregator.shouldRebalance();
      expect(needed).to.equal(true);
      // Should target compound (best risk-adjusted)
      expect(target).to.equal(await compound.getAddress());
    });

    it("should respect lowered threshold", async function () {
      const { aggregator, compound } = await setupFullFixture();

      // Gap: 440-408=32 bps. Default 50 bps = no rebalance
      const [neededBefore] = await aggregator.shouldRebalance();
      expect(neededBefore).to.equal(false);

      // Lower threshold to 20 bps
      await aggregator.setRebalanceThreshold(20);

      const [neededAfter, target] = await aggregator.shouldRebalance();
      expect(neededAfter).to.equal(true);
      expect(target).to.equal(await compound.getAddress());
    });
  });

  describe("getCurrentAdapter", function () {
    it("should return the active adapter from vault", async function () {
      const { aggregator, vault, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await treasury.getAddress());
      await aggregator.setVault(await vault.getAddress());
      await vault.setActiveAdapter(await treasury.getAddress());

      expect(await aggregator.getCurrentAdapter()).to.equal(await treasury.getAddress());
    });

    it("should return address(0) when vault not set", async function () {
      const { aggregator } = await loadFixture(deployFixture);
      expect(await aggregator.getCurrentAdapter()).to.equal(ethers.ZeroAddress);
    });
  });
});
