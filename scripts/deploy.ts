import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // For testnet, deploy a mock USDC
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  console.log("Mock USDC:", await usdc.getAddress());

  // Deploy mock yield adapters
  const MockYieldAdapter = await ethers.getContractFactory("MockYieldAdapter");

  const aaveAdapter = await MockYieldAdapter.deploy(
    "Aave V3", await usdc.getAddress(), 450, 10
  );
  await aaveAdapter.waitForDeployment();
  console.log("Aave Adapter:", await aaveAdapter.getAddress());

  const compoundAdapter = await MockYieldAdapter.deploy(
    "Compound V3", await usdc.getAddress(), 500, 12
  );
  await compoundAdapter.waitForDeployment();
  console.log("Compound Adapter:", await compoundAdapter.getAddress());

  const treasuryAdapter = await MockYieldAdapter.deploy(
    "US Treasury", await usdc.getAddress(), 430, 5
  );
  await treasuryAdapter.waitForDeployment();
  console.log("Treasury Adapter:", await treasuryAdapter.getAddress());

  // Deploy vault
  const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
  const vault = await TreasuryVault.deploy(
    await usdc.getAddress(),
    "Treasury Yield Vault",
    "tyUSDC"
  );
  await vault.waitForDeployment();
  console.log("Vault:", await vault.getAddress());

  // Deploy aggregator
  const YieldAggregator = await ethers.getContractFactory("YieldAggregator");
  const aggregator = await YieldAggregator.deploy();
  await aggregator.waitForDeployment();
  console.log("Aggregator:", await aggregator.getAddress());

  // Deploy keeper
  const VaultKeeper = await ethers.getContractFactory("VaultKeeper");
  const keeper = await VaultKeeper.deploy(
    await vault.getAddress(),
    await aggregator.getAddress()
  );
  await keeper.waitForDeployment();
  console.log("Keeper:", await keeper.getAddress());

  // Wire everything together
  console.log("\nConfiguring...");
  await aggregator.registerAdapter(await aaveAdapter.getAddress());
  await aggregator.registerAdapter(await compoundAdapter.getAddress());
  await aggregator.registerAdapter(await treasuryAdapter.getAddress());
  await aggregator.setVault(await vault.getAddress());
  await vault.setKeeper(await keeper.getAddress());
  await vault.setActiveAdapter(await treasuryAdapter.getAddress());

  // Mint test USDC to deployer for demo
  const mintAmount = ethers.parseUnits("100000", 6); // 100k USDC
  await usdc.mint(deployer.address, mintAmount);

  console.log("\n--- Deployment Complete ---");
  console.log(`USDC:       ${await usdc.getAddress()}`);
  console.log(`Vault:      ${await vault.getAddress()}`);
  console.log(`Aggregator: ${await aggregator.getAddress()}`);
  console.log(`Keeper:     ${await keeper.getAddress()}`);
  console.log(`Aave:       ${await aaveAdapter.getAddress()}`);
  console.log(`Compound:   ${await compoundAdapter.getAddress()}`);
  console.log(`Treasury:   ${await treasuryAdapter.getAddress()}`);
  console.log("\nUpdate frontend/src/config/contracts.ts with these addresses.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
