export const VAULT_ABI = [
  { inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }], name: "deposit", outputs: [{ name: "", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }, { name: "_owner", type: "address" }], name: "redeem", outputs: [{ name: "", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }, { name: "_owner", type: "address" }], name: "withdraw", outputs: [{ name: "", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "totalAssets", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "currentAPY", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "currentProtocol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "activeAdapter", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "paused", outputs: [{ name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "totalSupply", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "assets", type: "uint256" }], name: "previewDeposit", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "shares", type: "uint256" }], name: "previewRedeem", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "shares", type: "uint256" }], name: "convertToAssets", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "asset", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "keeper", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" },
] as const;

export const AGGREGATOR_ABI = [
  {
    inputs: [], name: "getAllYields", outputs: [{
      components: [
        { name: "adapter", type: "address" },
        { name: "protocolName", type: "string" },
        { name: "apy", type: "uint256" },
        { name: "riskScore", type: "uint256" },
        { name: "riskAdjustedAPY", type: "uint256" },
        { name: "deposited", type: "uint256" },
      ],
      name: "", type: "tuple[]"
    }], stateMutability: "view", type: "function"
  },
  { inputs: [], name: "getBestYield", outputs: [{ name: "bestAdapter", type: "address" }, { name: "bestAPY", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "shouldRebalance", outputs: [{ name: "needed", type: "bool" }, { name: "targetAdapter", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "rebalanceThreshold", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getAdapterCount", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

export const ERC20_ABI = [
  { inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" },
] as const;

// Deployed contract addresses - update after deployment
export const CONTRACTS = {
  vault: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9" as `0x${string}`,
  aggregator: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707" as `0x${string}`,
  usdc: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`,
  keeper: "0x0165878A594ca255338adfa4d48449f69242Eb8F" as `0x${string}`,
} as const;
