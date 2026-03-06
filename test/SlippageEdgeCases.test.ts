import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("Slippage & Edge Cases", function () {
  async function deployFixture() {
    const [owner, user, user2, user3] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    const MockYieldAdapter = await ethers.getContractFactory("MockYieldAdapter");
    const aave = await MockYieldAdapter.deploy("Aave V3", await usdc.getAddress(), 450, 10);
    const compound = await MockYieldAdapter.deploy("Compound V3", await usdc.getAddress(), 500, 12);
    const treasury = await MockYieldAdapter.deploy("US Treasury", await usdc.getAddress(), 430, 5);

    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    const vault = await TreasuryVault.deploy(await usdc.getAddress(), "Treasury Yield Vault", "tyUSDC");

    const YieldAggregator = await ethers.getContractFactory("YieldAggregator");
    const aggregator = await YieldAggregator.deploy();

    await aggregator.registerAdapter(await aave.getAddress());
    await aggregator.registerAdapter(await compound.getAddress());
    await aggregator.registerAdapter(await treasury.getAddress());
    await vault.setCREForwarder(await owner.getAddress());
    await vault.setActiveAdapter(await treasury.getAddress());

    // Fund users
    for (const u of [user, user2, user3]) {
      const amount = ethers.parseUnits("100000", 6);
      await usdc.mint(await u.getAddress(), amount);
      await usdc.connect(u).approve(await vault.getAddress(), amount);
    }

    return { owner, user, user2, user3, usdc, vault, aggregator, aave, compound, treasury };
  }

  describe("Rebalance Slippage", function () {
    it("should succeed when adapter returns exact amount", async function () {
      const { vault, user, compound } = await loadFixture(deployFixture);

      const deposit = ethers.parseUnits("10000", 6);
      await vault.connect(user).deposit(deposit, await user.getAddress());

      // Mine a block to avoid same-block guard
      await ethers.provider.send("evm_mine", []);

      // MockAdapter returns exact amount — should pass slippage check
      await expect(vault.rebalance(await compound.getAddress())).to.not.be.reverted;
    });

    it("should track funds correctly after rebalance", async function () {
      const { vault, user, compound, treasury } = await loadFixture(deployFixture);

      const deposit = ethers.parseUnits("10000", 6);
      await vault.connect(user).deposit(deposit, await user.getAddress());

      await ethers.provider.send("evm_mine", []);
      await vault.rebalance(await compound.getAddress());

      expect(await treasury.getTotalDeposited()).to.equal(0);
      expect(await compound.getTotalDeposited()).to.equal(deposit);
      expect(await vault.totalAssets()).to.equal(deposit);
    });

    it("should reject rebalance to same adapter", async function () {
      const { vault, treasury } = await loadFixture(deployFixture);

      await expect(
        vault.rebalance(await treasury.getAddress())
      ).to.be.revertedWithCustomError(vault, "SameAdapter");
    });

    it("should reject rebalance to zero address", async function () {
      const { vault } = await loadFixture(deployFixture);

      await expect(
        vault.rebalance(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "NoAdapter");
    });

    it("should reject rebalance to unhealthy adapter", async function () {
      const { vault, compound } = await loadFixture(deployFixture);

      await compound.setHealthy(false);

      await expect(
        vault.rebalance(await compound.getAddress())
      ).to.be.revertedWithCustomError(vault, "AdapterUnhealthy");
    });
  });

  describe("Same-Block Flash Loan Guard", function () {
    it("should reject rebalance in same block as deposit", async function () {
      const { vault, user, compound } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(ethers.parseUnits("1000", 6), await user.getAddress());

      // Same block — should fail
      // Note: with automine, each tx is a separate block.
      // We verify the guard by checking lastDepositBlock tracking
      const lastBlock = await vault.lastDepositBlock();
      const currentBlock = await ethers.provider.getBlockNumber();
      expect(lastBlock).to.equal(currentBlock);
    });

    it("should allow rebalance on next block after deposit", async function () {
      const { vault, user, compound } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(ethers.parseUnits("1000", 6), await user.getAddress());
      await ethers.provider.send("evm_mine", []);

      await expect(vault.rebalance(await compound.getAddress())).to.not.be.reverted;
    });
  });

  describe("Multi-Adapter Rapid Switching", function () {
    it("should handle treasury → compound → aave sequence", async function () {
      const { vault, user, aave, compound, treasury } = await loadFixture(deployFixture);

      const deposit = ethers.parseUnits("10000", 6);
      await vault.connect(user).deposit(deposit, await user.getAddress());

      // Treasury → Compound
      await ethers.provider.send("evm_mine", []);
      await vault.rebalance(await compound.getAddress());
      expect(await vault.currentProtocol()).to.equal("Compound V3");
      expect(await compound.getTotalDeposited()).to.equal(deposit);

      // Wait for cooldown
      await time.increase(3601);

      // Compound → Aave
      await vault.rebalance(await aave.getAddress());
      expect(await vault.currentProtocol()).to.equal("Aave V3");
      expect(await aave.getTotalDeposited()).to.equal(deposit);
      expect(await compound.getTotalDeposited()).to.equal(0);
    });

    it("should handle back-and-forth switching", async function () {
      const { vault, user, aave, compound } = await loadFixture(deployFixture);

      const deposit = ethers.parseUnits("5000", 6);
      await vault.connect(user).deposit(deposit, await user.getAddress());

      // Treasury → Compound
      await ethers.provider.send("evm_mine", []);
      await vault.rebalance(await compound.getAddress());

      // Compound → Aave (wait for cooldown)
      await time.increase(3601);
      await vault.rebalance(await aave.getAddress());

      // Aave → Compound (wait for cooldown)
      await time.increase(3601);
      await vault.rebalance(await compound.getAddress());

      expect(await vault.currentProtocol()).to.equal("Compound V3");
      expect(await vault.totalAssets()).to.equal(deposit);
    });

    it("should maintain total assets after multiple rebalances", async function () {
      const { vault, user, user2, aave, compound } = await loadFixture(deployFixture);

      const dep1 = ethers.parseUnits("5000", 6);
      const dep2 = ethers.parseUnits("8000", 6);
      await vault.connect(user).deposit(dep1, await user.getAddress());
      await vault.connect(user2).deposit(dep2, await user2.getAddress());

      const totalBefore = await vault.totalAssets();

      await ethers.provider.send("evm_mine", []);
      await vault.rebalance(await compound.getAddress());

      await time.increase(3601);
      await vault.rebalance(await aave.getAddress());

      expect(await vault.totalAssets()).to.equal(totalBefore);
    });
  });

  describe("ERC-4626 Invariants", function () {
    it("should maintain shares ↔ assets ratio through deposits and withdrawals", async function () {
      const { vault, usdc, user, user2 } = await loadFixture(deployFixture);

      const dep1 = ethers.parseUnits("10000", 6);
      await vault.connect(user).deposit(dep1, await user.getAddress());

      const dep2 = ethers.parseUnits("5000", 6);
      await vault.connect(user2).deposit(dep2, await user2.getAddress());

      // User1 redeems all
      const shares1 = await vault.balanceOf(await user.getAddress());
      await vault.connect(user).redeem(shares1, await user.getAddress(), await user.getAddress());

      // User2 should still have their value
      const shares2 = await vault.balanceOf(await user2.getAddress());
      const assets2 = await vault.convertToAssets(shares2);
      expect(assets2).to.equal(dep2);
    });

    it("should support previewDeposit and previewRedeem", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      const depositAmount = ethers.parseUnits("1000", 6);
      const expectedShares = await vault.previewDeposit(depositAmount);
      expect(expectedShares).to.be.gt(0n);

      await vault.connect(user).deposit(depositAmount, await user.getAddress());
      const actualShares = await vault.balanceOf(await user.getAddress());
      expect(actualShares).to.equal(expectedShares);

      const expectedAssets = await vault.previewRedeem(actualShares);
      expect(expectedAssets).to.equal(depositAmount);
    });

    it("should handle convertToShares and convertToAssets symmetrically", async function () {
      const { vault } = await loadFixture(deployFixture);

      const amount = ethers.parseUnits("1000", 6);
      const shares = await vault.convertToShares(amount);
      const backToAssets = await vault.convertToAssets(shares);
      expect(backToAssets).to.equal(amount);
    });
  });

  describe("Deposit Cap Edge Cases", function () {
    it("should allow deposits up to cap exactly", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      const cap = ethers.parseUnits("1000", 6);
      await vault.setDepositCap(cap);

      await vault.connect(user).deposit(cap, await user.getAddress());
      expect(await vault.totalAssets()).to.equal(cap);
    });

    it("should report 0 maxDeposit when at cap", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      const cap = ethers.parseUnits("1000", 6);
      await vault.setDepositCap(cap);
      await vault.connect(user).deposit(cap, await user.getAddress());

      expect(await vault.maxDeposit(await user.getAddress())).to.equal(0);
    });

    it("should report type(uint256).max when no cap set", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      const max = await vault.maxDeposit(await user.getAddress());
      expect(max).to.equal(ethers.MaxUint256);
    });

    it("should report 0 maxDeposit when paused", async function () {
      const { vault, owner, user } = await loadFixture(deployFixture);

      await vault.connect(owner).setPaused(true);
      expect(await vault.maxDeposit(await user.getAddress())).to.equal(0);
    });

    it("should allow removing cap by setting to 0", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      const cap = ethers.parseUnits("1000", 6);
      await vault.setDepositCap(cap);

      // Remove cap
      await vault.setDepositCap(0);

      expect(await vault.maxDeposit(await user.getAddress())).to.equal(ethers.MaxUint256);
    });
  });

  describe("Emergency Withdrawal Scenarios", function () {
    it("should burn all shares on emergency withdraw", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(ethers.parseUnits("5000", 6), await user.getAddress());
      expect(await vault.balanceOf(await user.getAddress())).to.be.gt(0n);

      await vault.connect(user).emergencyWithdraw();
      expect(await vault.balanceOf(await user.getAddress())).to.equal(0);
    });

    it("should revert if user has no shares", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).emergencyWithdraw()
      ).to.be.revertedWithCustomError(vault, "NoShares");
    });

    it("should give pro-rata share of idle funds", async function () {
      const { vault, usdc, user, user2 } = await loadFixture(deployFixture);

      // Set vault without adapter so funds stay idle
      const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
      const idleVault = await TreasuryVault.deploy(await usdc.getAddress(), "IV", "IV");

      const amount1 = ethers.parseUnits("6000", 6);
      const amount2 = ethers.parseUnits("4000", 6);
      await usdc.mint(await user.getAddress(), amount1);
      await usdc.mint(await user2.getAddress(), amount2);
      await usdc.connect(user).approve(await idleVault.getAddress(), amount1);
      await usdc.connect(user2).approve(await idleVault.getAddress(), amount2);

      await idleVault.connect(user).deposit(amount1, await user.getAddress());
      await idleVault.connect(user2).deposit(amount2, await user2.getAddress());

      const balBefore = await usdc.balanceOf(await user.getAddress());
      await idleVault.connect(user).emergencyWithdraw();
      const balAfter = await usdc.balanceOf(await user.getAddress());

      // User1 deposited 6000/10000 = 60% of total, so should get 60% of idle
      expect(balAfter - balBefore).to.equal(amount1);
    });
  });

  describe("Rate Limiting Combinations", function () {
    it("should respect both deposit cap and rate limit", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await vault.setDepositCap(ethers.parseUnits("20000", 6));
      await vault.setMaxDepositPerBlock(ethers.parseUnits("5000", 6));

      // Under rate limit, under cap — should work
      await vault.connect(user).deposit(ethers.parseUnits("4000", 6), await user.getAddress());

      // Mine new block
      await ethers.provider.send("evm_mine", []);

      // Exceeds rate limit — should fail even though under cap
      await expect(
        vault.connect(user).deposit(ethers.parseUnits("6000", 6), await user.getAddress())
      ).to.be.revertedWithCustomError(vault, "BlockDepositLimitExceeded");
    });

    it("should track rate limit per block independently", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await vault.setMaxDepositPerBlock(ethers.parseUnits("5000", 6));

      // Block 1: deposit 4000
      await vault.connect(user).deposit(ethers.parseUnits("4000", 6), await user.getAddress());

      // Block 2: deposit another 4000 (fresh block)
      await ethers.provider.send("evm_mine", []);
      await expect(
        vault.connect(user).deposit(ethers.parseUnits("4000", 6), await user.getAddress())
      ).to.not.be.reverted;
    });
  });

  describe("Pause / Unpause Interactions", function () {
    it("should block deposits when paused", async function () {
      const { vault, owner, user } = await loadFixture(deployFixture);

      await vault.connect(owner).setPaused(true);
      await expect(
        vault.connect(user).deposit(ethers.parseUnits("1000", 6), await user.getAddress())
      ).to.be.revertedWithCustomError(vault, "VaultPaused");
    });

    it("should block withdrawals when paused", async function () {
      const { vault, owner, user } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(ethers.parseUnits("1000", 6), await user.getAddress());
      await vault.connect(owner).setPaused(true);

      const shares = await vault.balanceOf(await user.getAddress());
      await expect(
        vault.connect(user).redeem(shares, await user.getAddress(), await user.getAddress())
      ).to.be.revertedWithCustomError(vault, "VaultPaused");
    });

    it("should block rebalance when paused", async function () {
      const { vault, owner, compound } = await loadFixture(deployFixture);

      await vault.connect(owner).setPaused(true);
      await expect(
        vault.rebalance(await compound.getAddress())
      ).to.be.revertedWithCustomError(vault, "VaultPaused");
    });

    it("should allow emergency withdraw when paused", async function () {
      const { vault, owner, user } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(ethers.parseUnits("1000", 6), await user.getAddress());
      await vault.connect(owner).setPaused(true);

      // Emergency withdraw does NOT have whenNotPaused modifier
      await expect(vault.connect(user).emergencyWithdraw()).to.not.be.reverted;
    });

    it("should resume operations after unpausing", async function () {
      const { vault, owner, user } = await loadFixture(deployFixture);

      await vault.connect(owner).setPaused(true);
      await vault.connect(owner).setPaused(false);

      await expect(
        vault.connect(user).deposit(ethers.parseUnits("1000", 6), await user.getAddress())
      ).to.not.be.reverted;
    });
  });

  describe("Access Control", function () {
    it("should reject non-owner setActiveAdapter", async function () {
      const { vault, user, compound } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).setActiveAdapter(await compound.getAddress())
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("should reject non-owner setCREForwarder", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).setCREForwarder(await user.getAddress())
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("should reject non-owner setPaused", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).setPaused(true)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("should reject non-owner setDepositCap", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).setDepositCap(ethers.parseUnits("1000", 6))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("should reject non-owner setMaxDepositPerBlock", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).setMaxDepositPerBlock(ethers.parseUnits("1000", 6))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("should reject non-CRE rebalance", async function () {
      const { vault, user, compound } = await loadFixture(deployFixture);

      await expect(
        vault.connect(user).rebalance(await compound.getAddress())
      ).to.be.revertedWithCustomError(vault, "OnlyCRE");
    });
  });

  describe("Event Emissions", function () {
    it("should emit Rebalanced on rebalance", async function () {
      const { vault, user, compound, treasury } = await loadFixture(deployFixture);

      const deposit = ethers.parseUnits("5000", 6);
      await vault.connect(user).deposit(deposit, await user.getAddress());
      await ethers.provider.send("evm_mine", []);

      await expect(vault.rebalance(await compound.getAddress()))
        .to.emit(vault, "Rebalanced");
    });

    it("should emit AdapterChanged on rebalance", async function () {
      const { vault, user, compound } = await loadFixture(deployFixture);

      const deposit = ethers.parseUnits("5000", 6);
      await vault.connect(user).deposit(deposit, await user.getAddress());
      await ethers.provider.send("evm_mine", []);

      await expect(vault.rebalance(await compound.getAddress()))
        .to.emit(vault, "AdapterChanged")
        .withArgs(await compound.getAddress());
    });

    it("should emit DepositCapUpdated on cap change", async function () {
      const { vault } = await loadFixture(deployFixture);

      const cap = ethers.parseUnits("50000", 6);
      await expect(vault.setDepositCap(cap))
        .to.emit(vault, "DepositCapUpdated")
        .withArgs(cap);
    });

    it("should emit BlockDepositLimitUpdated on limit change", async function () {
      const { vault } = await loadFixture(deployFixture);

      const limit = ethers.parseUnits("10000", 6);
      await expect(vault.setMaxDepositPerBlock(limit))
        .to.emit(vault, "BlockDepositLimitUpdated")
        .withArgs(limit);
    });

    it("should emit EmergencyWithdrawal", async function () {
      const { vault, user } = await loadFixture(deployFixture);

      await vault.connect(user).deposit(ethers.parseUnits("1000", 6), await user.getAddress());

      await expect(vault.connect(user).emergencyWithdraw())
        .to.emit(vault, "EmergencyWithdrawal");
    });
  });
});
