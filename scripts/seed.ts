import { ethers } from "hardhat";

async function main() {
  const signers = await ethers.getSigners();

  const usdc = await ethers.getContractAt("MockERC20", "0x5FbDB2315678afecb367f032d93F642f64180aa3");
  const vault = await ethers.getContractAt("TreasuryVault", "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9");

  const deposits = [
    { signer: signers[1], amount: "25000" },
    { signer: signers[2], amount: "50000" },
    { signer: signers[3], amount: "15000" },
    { signer: signers[4], amount: "75000" },
    { signer: signers[5], amount: "32000" },
  ];

  for (const { signer, amount } of deposits) {
    const addr = await signer.getAddress();
    const parsed = ethers.parseUnits(amount, 6);

    await usdc.mint(addr, parsed);
    await usdc.connect(signer).approve(await vault.getAddress(), parsed);
    await vault.connect(signer).deposit(parsed, addr);

    console.log(`${addr} deposited ${amount} USDC`);
  }

  const tvl = await vault.totalAssets();
  const protocol = await vault.currentProtocol();
  const apy = await vault.currentAPY();

  console.log(`\nVault seeded:`);
  console.log(`  TVL: $${ethers.formatUnits(tvl, 6)}`);
  console.log(`  Protocol: ${protocol}`);
  console.log(`  APY: ${Number(apy) / 100}%`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
