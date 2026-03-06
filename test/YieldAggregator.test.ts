import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("YieldAggregator", function () {
  async function deployFixture() {
    const [owner, nonOwner] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const MockYieldAdapter = await ethers.getContractFactory("MockYieldAdapter");
    const aave = await MockYieldAdapter.deploy("Aave V3", await usdc.getAddress(), 450, 10);
    const compound = await MockYieldAdapter.deploy("Compound V3", await usdc.getAddress(), 500, 12);
    const treasury = await MockYieldAdapter.deploy("US Treasury", await usdc.getAddress(), 430, 5);

    const YieldAggregator = await ethers.getContractFactory("YieldAggregator");
    const aggregator = await YieldAggregator.deploy();

    return { owner, nonOwner, usdc, aave, compound, treasury, aggregator };
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

    it("should return adapter by index", async function () {
      const { aggregator, aave, compound } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());

      expect(await aggregator.getAdapter(0)).to.equal(await aave.getAddress());
      expect(await aggregator.getAdapter(1)).to.equal(await compound.getAddress());
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

  describe("getAllYields", function () {
    it("should return yield info for all adapters", async function () {
      const { aggregator, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());

      const yields = await aggregator.getAllYields();
      expect(yields.length).to.equal(3);
    });

    it("should return correct protocol names", async function () {
      const { aggregator, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());

      const yields = await aggregator.getAllYields();
      expect(yields[0].protocolName).to.equal("Aave V3");
      expect(yields[1].protocolName).to.equal("Compound V3");
      expect(yields[2].protocolName).to.equal("US Treasury");
    });

    it("should calculate risk-adjusted APY correctly", async function () {
      const { aggregator, aave, compound, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await compound.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());

      const yields = await aggregator.getAllYields();
      // Aave: 450 * (100-10)/100 = 405
      expect(yields[0].riskAdjustedAPY).to.equal(405n);
      // Compound: 500 * (100-12)/100 = 440
      expect(yields[1].riskAdjustedAPY).to.equal(440n);
      // Treasury: 430 * (100-5)/100 = 408
      expect(yields[2].riskAdjustedAPY).to.equal(408n);
    });

    it("should include health status", async function () {
      const { aggregator, aave } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());

      let yields = await aggregator.getAllYields();
      expect(yields[0].healthy).to.equal(true);

      await aave.setHealthy(false);
      yields = await aggregator.getAllYields();
      expect(yields[0].healthy).to.equal(false);
    });

    it("should handle adapter with zero APY gracefully", async function () {
      const { aggregator, aave, treasury } = await loadFixture(deployFixture);

      await aggregator.registerAdapter(await aave.getAddress());
      await aggregator.registerAdapter(await treasury.getAddress());

      await aave.setAPY(0);

      const yields = await aggregator.getAllYields();
      expect(yields.length).to.equal(2);
      expect(yields[0].apy).to.equal(0n);
      expect(yields[1].apy).to.equal(430n);
    });

    it("should return empty array when no adapters registered", async function () {
      const { aggregator } = await loadFixture(deployFixture);

      const yields = await aggregator.getAllYields();
      expect(yields.length).to.equal(0);
    });
  });
});
