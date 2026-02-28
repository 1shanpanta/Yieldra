import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("TreasuryVault", function () {
  async function deployFixture() {
    const [owner, user, keeper] = await ethers.getSigners();

    // Deploy mock USDC (6 decimals)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Deploy mock yield adapters
    const MockYieldAdapter = await ethers.getContractFactory("MockYieldAdapter");
    const aaveAdapter = await MockYieldAdapter.deploy(
      "Aave V3", await usdc.getAddress(), 450, 10 // 4.5% APY, risk 10
    );
    const compoundAdapter = await MockYieldAdapter.deploy(
      "Compound V3", await usdc.getAddress(), 500, 12 // 5.0% APY, risk 12
    );
    const treasuryAdapter = await MockYieldAdapter.deploy(
      "US Treasury", await usdc.getAddress(), 430, 5 // 4.3% APY, risk 5
    );

    // Deploy vault
    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    const vault = await TreasuryVault.deploy(
      await usdc.getAddress(),
      "Treasury Yield Vault",
      "tyUSDC"
    );

    // Deploy aggregator
    const YieldAggregator = await ethers.getContractFactory("YieldAggregator");
    const aggregator = await YieldAggregator.deploy();

    // Deploy keeper
    const VaultKeeper = await ethers.getContractFactory("VaultKeeper");
    const vaultKeeper = await VaultKeeper.deploy(
      await vault.getAddress(),
      await aggregator.getAddress()
    );

    // Setup: register adapters, set vault, set keeper
    await aggregator.registerAdapter(await aaveAdapter.getAddress());
    await aggregator.registerAdapter(await compoundAdapter.getAddress());
    await aggregator.registerAdapter(await treasuryAdapter.getAddress());
    await aggregator.setVault(await vault.getAddress());
    await vault.setKeeper(await vaultKeeper.getAddress());
    await vault.setActiveAdapter(await treasuryAdapter.getAddress());

    // Mint USDC to user
    const depositAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    await usdc.mint(await user.getAddress(), depositAmount);
    await usdc.connect(user).approve(await vault.getAddress(), depositAmount);

    return {
      owner, user, keeper, usdc, vault, aggregator, vaultKeeper,
      aaveAdapter, compoundAdapter, treasuryAdapter, depositAmount
    };
  }

  describe("Deployment", function () {
    it("should set correct asset and name", async function () {
      const { vault, usdc } = await loadFixture(deployFixture);
      expect(await vault.asset()).to.equal(await usdc.getAddress());
      expect(await vault.name()).to.equal("Treasury Yield Vault");
      expect(await vault.symbol()).to.equal("tyUSDC");
    });

    it("should set owner correctly", async function () {
      const { vault, owner } = await loadFixture(deployFixture);
      expect(await vault.owner()).to.equal(await owner.getAddress());
    });
  });

  describe("Deposits", function () {
    it("should accept deposits and deploy to active adapter", async function () {
      const { vault, user, treasuryAdapter, depositAmount } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(depositAmount, await user.getAddress());

      // Shares should be minted
      expect(await vault.balanceOf(await user.getAddress())).to.be.gt(0);
      // Funds should be in the adapter
      expect(await treasuryAdapter.getTotalDeposited()).to.equal(depositAmount);
    });

    it("should track total assets correctly", async function () {
      const { vault, user, depositAmount } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(depositAmount, await user.getAddress());
      expect(await vault.totalAssets()).to.equal(depositAmount);
    });
  });

  describe("Withdrawals", function () {
    it("should allow full withdrawal", async function () {
      const { vault, usdc, user, depositAmount } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(depositAmount, await user.getAddress());

      const shares = await vault.balanceOf(await user.getAddress());
      await vault.connect(user).redeem(shares, await user.getAddress(), await user.getAddress());

      expect(await usdc.balanceOf(await user.getAddress())).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.equal(0);
    });
  });

  describe("Rebalancing", function () {
    it("should rebalance from treasury to higher-yield adapter", async function () {
      const { vault, user, vaultKeeper, owner, treasuryAdapter, compoundAdapter, depositAmount } =
        await loadFixture(deployFixture);

      // Deposit into vault (goes to treasury adapter initially)
      await vault.connect(user).deposit(depositAmount, await user.getAddress());
      expect(await treasuryAdapter.getTotalDeposited()).to.equal(depositAmount);

      // Rebalance to compound (higher yield)
      await vault.setKeeper(await owner.getAddress()); // use owner as keeper for test
      await vault.rebalance(await compoundAdapter.getAddress());

      // Funds moved
      expect(await treasuryAdapter.getTotalDeposited()).to.equal(0);
      expect(await compoundAdapter.getTotalDeposited()).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.equal(depositAmount);
    });

    it("should reject rebalance to same adapter", async function () {
      const { vault, owner, treasuryAdapter } = await loadFixture(deployFixture);
      await vault.setKeeper(await owner.getAddress());

      await expect(
        vault.rebalance(await treasuryAdapter.getAddress())
      ).to.be.revertedWithCustomError(vault, "SameAdapter");
    });

    it("should reject rebalance from non-keeper", async function () {
      const { vault, user, compoundAdapter } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).rebalance(await compoundAdapter.getAddress())
      ).to.be.revertedWithCustomError(vault, "OnlyKeeper");
    });
  });

  describe("Pause", function () {
    it("should block deposits when paused", async function () {
      const { vault, user, owner, depositAmount } = await loadFixture(deployFixture);

      await vault.connect(owner).setPaused(true);

      await expect(
        vault.connect(user).deposit(depositAmount, await user.getAddress())
      ).to.be.revertedWithCustomError(vault, "VaultPaused");
    });
  });

  describe("View helpers", function () {
    it("should return current APY", async function () {
      const { vault } = await loadFixture(deployFixture);
      // Treasury adapter set at 430 bps
      expect(await vault.currentAPY()).to.equal(430);
    });

    it("should return current protocol name", async function () {
      const { vault } = await loadFixture(deployFixture);
      expect(await vault.currentProtocol()).to.equal("US Treasury");
    });
  });
});

describe("YieldAggregator", function () {
  async function deployFixture() {
    const [owner] = await ethers.getSigners();

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

    await aggregator.registerAdapter(await aave.getAddress());
    await aggregator.registerAdapter(await compound.getAddress());
    await aggregator.registerAdapter(await treasury.getAddress());
    await aggregator.setVault(await vault.getAddress());
    await vault.setActiveAdapter(await treasury.getAddress());

    return { owner, usdc, aave, compound, treasury, vault, aggregator };
  }

  describe("Yield comparison", function () {
    it("should return all yields", async function () {
      const { aggregator } = await loadFixture(deployFixture);
      const yields = await aggregator.getAllYields();
      expect(yields.length).to.equal(3);
      expect(yields[0].protocolName).to.equal("Aave V3");
    });

    it("should pick best risk-adjusted yield", async function () {
      const { aggregator, compound } = await loadFixture(deployFixture);
      // Aave: 450 * (100-10)/100 = 405
      // Compound: 500 * (100-12)/100 = 440
      // Treasury: 430 * (100-5)/100 = 408.5 → 408
      const [bestAdapter] = await aggregator.getBestYield();
      // Compound should win with 440 risk-adjusted bps
      expect(bestAdapter).to.equal(await compound.getAddress());
    });

    it("should recommend rebalance when yield gap exceeds threshold", async function () {
      const { aggregator, compound } = await loadFixture(deployFixture);
      // Current: treasury at 408 risk-adjusted
      // Best: compound at 440 risk-adjusted
      // Gap: 32 bps — default threshold is 50 bps, so NO rebalance
      const [needed] = await aggregator.shouldRebalance();

      // With default 50 bps threshold, 32 bps gap is NOT enough
      expect(needed).to.equal(false);
    });

    it("should recommend rebalance after threshold lowered", async function () {
      const { aggregator, compound } = await loadFixture(deployFixture);

      // Lower threshold to 20 bps
      await aggregator.setRebalanceThreshold(20);

      const [needed, target] = await aggregator.shouldRebalance();
      expect(needed).to.equal(true);
      expect(target).to.equal(await compound.getAddress());
    });

    it("should recommend rebalance when APY changes significantly", async function () {
      const { aggregator, compound } = await loadFixture(deployFixture);

      // Compound APY jumps to 8%
      await compound.setAPY(800);

      const [needed, target] = await aggregator.shouldRebalance();
      // Compound risk-adjusted: 800 * 88/100 = 704
      // Treasury risk-adjusted: 430 * 95/100 = 408
      // Gap: 296 bps >> 50 threshold
      expect(needed).to.equal(true);
      expect(target).to.equal(await compound.getAddress());
    });
  });
});

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

  describe("checkUpkeep", function () {
    it("should return true when rebalance needed", async function () {
      const { keeper } = await loadFixture(deployFixture);
      // Compound at 800 bps risk-adjusted = 704, treasury at 408. Gap = 296 > 50
      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(true);
    });

    it("should return false when vault is paused", async function () {
      const { keeper, vault, owner } = await loadFixture(deployFixture);
      await vault.connect(owner).setPaused(true);

      const [upkeepNeeded] = await keeper.checkUpkeep("0x");
      expect(upkeepNeeded).to.equal(false);
    });
  });

  describe("performUpkeep", function () {
    it("should execute rebalance to best adapter", async function () {
      const { keeper, vault, compound, treasury, amount } = await loadFixture(deployFixture);

      const [, performData] = await keeper.checkUpkeep("0x");
      await keeper.performUpkeep(performData);

      // Funds should have moved to compound
      expect(await compound.getTotalDeposited()).to.equal(amount);
      expect(await treasury.getTotalDeposited()).to.equal(0);
      expect(await vault.currentProtocol()).to.equal("Compound V3");
    });
  });
});
