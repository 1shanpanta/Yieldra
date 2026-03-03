import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("VaultKeeper", function () {
  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const MockYieldAdapter = await ethers.getContractFactory("MockYieldAdapter");
    const aave = await MockYieldAdapter.deploy("Aave V3", await usdc.getAddress(), 450, 10);
    const compound = await MockYieldAdapter.deploy("Compound V3", await usdc.getAddress(), 800, 12);
    const treasury = await MockYieldAdapter.deploy("US Treasury", await usdc.getAddress(), 430, 5);

    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    const vault = await TreasuryVault.deploy(await usdc.getAddress(), "TV", "TV");

    const YieldAggregator = await ethers.getContractFactory("YieldAggregator");
    const aggregator = await YieldAggregator.deploy();

    const VaultKeeper = await ethers.getContractFactory("VaultKeeper");
    const keeper = await VaultKeeper.deploy(await vault.getAddress(), await aggregator.getAddress());

    await aggregator.registerAdapter(await aave.getAddress());
    await aggregator.registerAdapter(await compound.getAddress());
    await aggregator.registerAdapter(await treasury.getAddress());
    await aggregator.setVault(await vault.getAddress());
    await vault.setActiveAdapter(await treasury.getAddress());
    await vault.setKeeper(await keeper.getAddress());

    // Deposit some funds
    const amount = ethers.parseUnits("10000", 6);
    await usdc.mint(await user.getAddress(), amount);
    await usdc.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).deposit(amount, await user.getAddress());

    return { owner, user, usdc, vault, aggregator, keeper, aave, compound, treasury, amount };
  }

  describe("Immutable references", function () {
    it("should store vault address immutably", async function () {
      const { keeper, vault } = await loadFixture(deployFixture);
      expect(await keeper.vault()).to.equal(await vault.getAddress());
    });

    it("should store aggregator address immutably", async function () {
      const { keeper, aggregator } = await loadFixture(deployFixture);
      expect(await keeper.aggregator()).to.equal(await aggregator.getAddress());
    });

    it("should initialize lastRebalanceTime to 0", async function () {
      const { keeper } = await loadFixture(deployFixture);
      expect(await keeper.lastRebalanceTime()).to.equal(0);
    });

    it("should have MIN_REBALANCE_INTERVAL of 1 hour", async function () {
      const { keeper } = await loadFixture(deployFixture);
      expect(await keeper.MIN_REBALANCE_INTERVAL()).to.equal(3600);
    });
  });

  describe("checkUpkeep", function () {
    it("should return true when rebalance is needed", async function () {
      const { keeper } = await loadFixture(deployFixture);
      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(true);
    });

    it("should return encoded target adapter in performData", async function () {
      const { keeper, compound } = await loadFixture(deployFixture);
      const [, performData] = await keeper.checkUpkeep("0x");
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address"], performData);
      expect(decoded[0]).to.equal(await compound.getAddress());
    });

    it("should return false when vault is paused", async function () {
      const { keeper, vault, owner } = await loadFixture(deployFixture);
      await vault.connect(owner).setPaused(true);
      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(false);
    });

    it("should return false during cooldown period", async function () {
      const { keeper } = await loadFixture(deployFixture);

      // Perform first upkeep
      const [, performData] = await keeper.checkUpkeep("0x");
      await keeper.performUpkeep(performData);

      // checkUpkeep should return false during cooldown
      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(false);
    });

    it("should return true after cooldown expires", async function () {
      const { keeper, vault, owner, aave, compound, treasury } = await loadFixture(deployFixture);

      // Perform first upkeep (treasury -> compound)
      const [, performData] = await keeper.checkUpkeep("0x");
      await keeper.performUpkeep(performData);

      // Now compound is active. Make aave much better
      await aave.setAPY(1200); // 12% APY

      // Advance time past cooldown
      await time.increase(3601);

      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(true);
    });

    it("should return false when no rebalance is needed", async function () {
      const { keeper, compound } = await loadFixture(deployFixture);

      // Make compound APY close to treasury so no rebalance needed
      await compound.setAPY(440); // risk-adjusted: 440*88/100 = 387 vs treasury 408

      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(false);
    });
  });

  describe("performUpkeep", function () {
    it("should execute rebalance and move funds", async function () {
      const { keeper, vault, compound, treasury, amount } = await loadFixture(deployFixture);

      const [, performData] = await keeper.checkUpkeep("0x");
      await keeper.performUpkeep(performData);

      expect(await compound.getTotalDeposited()).to.equal(amount);
      expect(await treasury.getTotalDeposited()).to.equal(0);
      expect(await vault.currentProtocol()).to.equal("Compound V3");
    });

    it("should update lastRebalanceTime after upkeep", async function () {
      const { keeper } = await loadFixture(deployFixture);

      const [, performData] = await keeper.checkUpkeep("0x");
      await keeper.performUpkeep(performData);

      const lastTime = await keeper.lastRebalanceTime();
      expect(lastTime).to.be.gt(0);
    });

    it("should emit UpkeepPerformed event", async function () {
      const { keeper, compound } = await loadFixture(deployFixture);

      const [, performData] = await keeper.checkUpkeep("0x");
      await expect(keeper.performUpkeep(performData))
        .to.emit(keeper, "UpkeepPerformed")
        .withArgs(await compound.getAddress(), (val: bigint) => val > 0n);
    });

    it("should revert with CooldownActive during cooldown", async function () {
      const { keeper } = await loadFixture(deployFixture);

      const [, performData] = await keeper.checkUpkeep("0x");
      await keeper.performUpkeep(performData);

      // Try again immediately — should revert with CooldownActive
      await expect(
        keeper.performUpkeep(performData)
      ).to.be.revertedWithCustomError(keeper, "CooldownActive");
    });

    it("should revert with RebalanceNotNeeded when conditions change", async function () {
      const { keeper, compound, treasury } = await loadFixture(deployFixture);

      // Get performData while rebalance IS needed
      const [, performData] = await keeper.checkUpkeep("0x");

      // Now change conditions so rebalance is NOT needed
      await compound.setAPY(100); // much lower
      await treasury.setAPY(900); // much higher

      await expect(
        keeper.performUpkeep(performData)
      ).to.be.revertedWithCustomError(keeper, "RebalanceNotNeeded");
    });

    it("should revert with TargetMismatch when target changes", async function () {
      const { keeper, aave, compound } = await loadFixture(deployFixture);

      // Get performData pointing to compound
      const [, performData] = await keeper.checkUpkeep("0x");

      // Now make aave the best instead
      await aave.setAPY(2000); // 20%

      // performData still encodes compound, but aggregator now points to aave
      await expect(
        keeper.performUpkeep(performData)
      ).to.be.revertedWithCustomError(keeper, "TargetMismatch");
    });

    it("should allow upkeep again after cooldown", async function () {
      const { keeper, vault, owner, aave, compound } = await loadFixture(deployFixture);

      // First upkeep: treasury -> compound
      const [, performData1] = await keeper.checkUpkeep("0x");
      await keeper.performUpkeep(performData1);
      expect(await vault.currentProtocol()).to.equal("Compound V3");

      // Make aave much better
      await aave.setAPY(1500);

      // Advance past cooldown
      await time.increase(3601);

      // Second upkeep: compound -> aave
      const [upkeepNeeded, performData2] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(true);
      await keeper.performUpkeep(performData2);
      expect(await vault.currentProtocol()).to.equal("Aave V3");
    });
  });

  describe("Edge cases", function () {
    it("should handle checkUpkeep with no adapters registered", async function () {
      const [owner] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

      const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
      const vault = await TreasuryVault.deploy(await usdc.getAddress(), "TV", "TV");

      const YieldAggregator = await ethers.getContractFactory("YieldAggregator");
      const aggregator = await YieldAggregator.deploy();
      await aggregator.setVault(await vault.getAddress());

      const VaultKeeper = await ethers.getContractFactory("VaultKeeper");
      const keeper = await VaultKeeper.deploy(await vault.getAddress(), await aggregator.getAddress());

      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(false);
    });

    it("should handle checkUpkeep when all adapters are unhealthy", async function () {
      const { keeper, aave, compound, treasury } = await loadFixture(deployFixture);

      await aave.setHealthy(false);
      await compound.setHealthy(false);
      await treasury.setHealthy(false);

      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(false);
    });
  });
});
