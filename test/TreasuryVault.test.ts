import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("TreasuryVault", function () {
  async function deployFixture() {
    const [owner, user, other] = await ethers.getSigners();

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

    // Setup: register adapters, set CRE forwarder
    await aggregator.registerAdapter(await aaveAdapter.getAddress());
    await aggregator.registerAdapter(await compoundAdapter.getAddress());
    await aggregator.registerAdapter(await treasuryAdapter.getAddress());
    await vault.setCREForwarder(await owner.getAddress());
    await vault.setActiveAdapter(await treasuryAdapter.getAddress());

    // Mint USDC to user
    const depositAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    await usdc.mint(await user.getAddress(), depositAmount);
    await usdc.connect(user).approve(await vault.getAddress(), depositAmount);

    return {
      owner, user, other, usdc, vault, aggregator,
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

    it("should have MIN_REBALANCE_INTERVAL of 1 hour", async function () {
      const { vault } = await loadFixture(deployFixture);
      expect(await vault.MIN_REBALANCE_INTERVAL()).to.equal(3600);
    });

    it("should initialize lastRebalanceTime to 0", async function () {
      const { vault } = await loadFixture(deployFixture);
      expect(await vault.lastRebalanceTime()).to.equal(0);
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
      const { vault, user, owner, treasuryAdapter, compoundAdapter, depositAmount } =
        await loadFixture(deployFixture);

      // Deposit into vault (goes to treasury adapter initially)
      await vault.connect(user).deposit(depositAmount, await user.getAddress());
      expect(await treasuryAdapter.getTotalDeposited()).to.equal(depositAmount);

      // Rebalance to compound (higher yield)
      await vault.rebalance(await compoundAdapter.getAddress());

      // Funds moved
      expect(await treasuryAdapter.getTotalDeposited()).to.equal(0);
      expect(await compoundAdapter.getTotalDeposited()).to.equal(depositAmount);
      expect(await vault.totalAssets()).to.equal(depositAmount);
    });

    it("should reject rebalance to same adapter", async function () {
      const { vault, treasuryAdapter } = await loadFixture(deployFixture);

      await expect(
        vault.rebalance(await treasuryAdapter.getAddress())
      ).to.be.revertedWithCustomError(vault, "SameAdapter");
    });

    it("should reject rebalance from non-CRE address", async function () {
      const { vault, user, compoundAdapter } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).rebalance(await compoundAdapter.getAddress())
      ).to.be.revertedWithCustomError(vault, "OnlyCRE");
    });

    it("should update lastRebalanceTime after rebalance", async function () {
      const { vault, compoundAdapter } = await loadFixture(deployFixture);

      await vault.rebalance(await compoundAdapter.getAddress());

      expect(await vault.lastRebalanceTime()).to.be.gt(0);
    });

    it("should enforce cooldown between rebalances", async function () {
      const { vault, compoundAdapter, aaveAdapter } = await loadFixture(deployFixture);

      // First rebalance: treasury -> compound
      await vault.rebalance(await compoundAdapter.getAddress());

      // Immediate second rebalance should fail
      await expect(
        vault.rebalance(await aaveAdapter.getAddress())
      ).to.be.revertedWithCustomError(vault, "CooldownActive");
    });

    it("should allow rebalance after cooldown expires", async function () {
      const { vault, compoundAdapter, aaveAdapter } = await loadFixture(deployFixture);

      // First rebalance: treasury -> compound
      await vault.rebalance(await compoundAdapter.getAddress());
      expect(await vault.currentProtocol()).to.equal("Compound V3");

      // Advance past cooldown
      await time.increase(3601);

      // Second rebalance: compound -> aave
      await vault.rebalance(await aaveAdapter.getAddress());
      expect(await vault.currentProtocol()).to.equal("Aave V3");
    });

    it("should emit Rebalanced and AdapterChanged events", async function () {
      const { vault, user, treasuryAdapter, compoundAdapter, depositAmount } =
        await loadFixture(deployFixture);

      await vault.connect(user).deposit(depositAmount, await user.getAddress());

      await expect(vault.rebalance(await compoundAdapter.getAddress()))
        .to.emit(vault, "Rebalanced")
        .withArgs(
          await treasuryAdapter.getAddress(),
          await compoundAdapter.getAddress(),
          depositAmount
        )
        .and.to.emit(vault, "AdapterChanged")
        .withArgs(await compoundAdapter.getAddress());
    });
  });

  describe("CRE Forwarder", function () {
    it("should allow owner to set CRE forwarder", async function () {
      const { vault, other } = await loadFixture(deployFixture);

      await vault.setCREForwarder(await other.getAddress());
      expect(await vault.creForwarder()).to.equal(await other.getAddress());
    });

    it("should emit CREForwarderUpdated event", async function () {
      const { vault, other } = await loadFixture(deployFixture);

      await expect(vault.setCREForwarder(await other.getAddress()))
        .to.emit(vault, "CREForwarderUpdated")
        .withArgs(await other.getAddress());
    });

    it("should allow CRE forwarder to call rebalance", async function () {
      const { vault, other, compoundAdapter } = await loadFixture(deployFixture);

      await vault.setCREForwarder(await other.getAddress());
      await vault.connect(other).rebalance(await compoundAdapter.getAddress());

      expect(await vault.currentProtocol()).to.equal("Compound V3");
    });

    it("should reject setCREForwarder from non-owner", async function () {
      const { vault, user, other } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).setCREForwarder(await other.getAddress())
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
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

    it("should block rebalance when paused", async function () {
      const { vault, owner, compoundAdapter } = await loadFixture(deployFixture);

      await vault.connect(owner).setPaused(true);

      await expect(
        vault.rebalance(await compoundAdapter.getAddress())
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
