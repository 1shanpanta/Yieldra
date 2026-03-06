import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

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

  // Wire everything together
  console.log("\nConfiguring...");
  await aggregator.registerAdapter(await aaveAdapter.getAddress());
  await aggregator.registerAdapter(await compoundAdapter.getAddress());
  await aggregator.registerAdapter(await treasuryAdapter.getAddress());
  await vault.setActiveAdapter(await treasuryAdapter.getAddress());

  // Set CRE forwarder — on local dev, use deployer as forwarder for testing
  // On Sepolia, this should be the Chainlink CRE DON forwarder address
  const creForwarder = process.env.CRE_FORWARDER_ADDRESS || deployer.address;
  await vault.setCREForwarder(creForwarder);
  console.log("CRE Forwarder:", creForwarder);

  // Mint test USDC to deployer for demo
  const mintAmount = ethers.parseUnits("100000", 6); // 100k USDC
  await usdc.mint(deployer.address, mintAmount);

  // Generate contract addresses JSON for frontend
  const addresses = {
    vault: await vault.getAddress(),
    aggregator: await aggregator.getAddress(),
    usdc: await usdc.getAddress(),
    aaveAdapter: await aaveAdapter.getAddress(),
    compoundAdapter: await compoundAdapter.getAddress(),
    treasuryAdapter: await treasuryAdapter.getAddress(),
  };

  const frontendConfigDir = path.join(__dirname, "..", "frontend", "src", "config");
  const outputPath = path.join(frontendConfigDir, "deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log(`\nContract addresses written to ${outputPath}`);

  // Also write a .env.local for the frontend
  const envPath = path.join(__dirname, "..", "frontend", ".env.local");
  const envContent = [
    `NEXT_PUBLIC_VAULT_ADDRESS=${addresses.vault}`,
    `NEXT_PUBLIC_AGGREGATOR_ADDRESS=${addresses.aggregator}`,
    `NEXT_PUBLIC_USDC_ADDRESS=${addresses.usdc}`,
    `NEXT_PUBLIC_WC_PROJECT_ID=demo`,
  ].join("\n");
  fs.writeFileSync(envPath, envContent + "\n");
  console.log(`Frontend .env.local written to ${envPath}`);

  // Write CRE workflow config
  const workflowConfigPath = path.join(__dirname, "..", "workflow", "config.json");
  const workflowConfig = {
    schedule: "0 0 * * * *",
    defiLlamaBaseUrl: "https://yields.llama.fi",
    monitoredProtocols: ["aave-v3", "compound-v3"],
    targetSymbol: "USDC",
    vaultAddress: addresses.vault,
    aggregatorAddress: addresses.aggregator,
    chainSelector: "16015286601757825753",
    rebalanceThreshold: 50,
  };
  fs.writeFileSync(workflowConfigPath, JSON.stringify(workflowConfig, null, 2));
  console.log(`CRE workflow config written to ${workflowConfigPath}`);

  console.log("\n--- Deployment Complete ---");
  console.log(`USDC:       ${addresses.usdc}`);
  console.log(`Vault:      ${addresses.vault}`);
  console.log(`Aggregator: ${addresses.aggregator}`);
  console.log(`Aave:       ${addresses.aaveAdapter}`);
  console.log(`Compound:   ${addresses.compoundAdapter}`);
  console.log(`Treasury:   ${addresses.treasuryAdapter}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
