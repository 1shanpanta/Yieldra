# Data Model

## On-Chain Types

### YieldInfo (from YieldAggregator)

Returned by `getAllYields()`. Represents one adapter's current state.

```solidity
struct YieldInfo {
    address adapter;          // Adapter contract address
    string  protocolName;     // "Aave V3", "Compound V3", "US Treasury"
    uint256 apy;              // Basis points (450 = 4.50%)
    uint256 riskScore;        // 1-100 (lower = safer)
    uint256 riskAdjustedAPY;  // apy * (100 - riskScore) / 100
    uint256 deposited;        // USDC currently in adapter (6 decimals)
    bool    healthy;          // Adapter operational status
}
```

### Vault State (TreasuryVault)

| Field | Type | Description |
|---|---|---|
| `activeAdapter` | address | Currently receiving deposits |
| `creForwarder` | address | Chainlink CRE automation address |
| `lastRebalanceTime` | uint256 | Timestamp of last rebalance |
| `lastDepositBlock` | uint256 | Block number of last deposit |
| `depositCap` | uint256 | Max TVL in USDC (0 = unlimited) |
| `maxDepositPerBlock` | uint256 | Per-block deposit limit (0 = unlimited) |
| `depositedThisBlock` | uint256 | Running total for current block |

### Share Token

- Name: `Treasury Yield Vault`
- Symbol: `tyUSDC`
- Decimals: 12 (USDC 6 + offset 6)
- Standard: ERC-4626 (extends ERC-20)

## Frontend Types

### SelectedProtocol

```typescript
interface SelectedProtocol {
    name: string;           // Protocol name
    apyBps: number;         // Raw APY in basis points
    riskAdjBps: number;     // Risk-adjusted APY in basis points
    riskScore: number;      // Risk score 1-100
    adapter: `0x${string}`; // Adapter address
}
```

### Contract Addresses

```typescript
const CONTRACTS = {
    vault: `0x${string}`;       // TreasuryVault address
    aggregator: `0x${string}`;  // YieldAggregator address
    usdc: `0x${string}`;        // USDC token address
}
```

## CRE Workflow Types

### OnchainAdapterData

```typescript
interface OnchainAdapterData {
    address: string;
    protocolName: string;
    onchainAPY: number;        // Basis points from contract
    riskScore: number;
    totalDeposited: bigint;
    isHealthy: boolean;
}
```

### DefiLlamaYield

```typescript
interface DefiLlamaYield {
    pool: string;
    project: string;           // "aave-v3", "compound-v3"
    symbol: string;            // "USDC"
    apyBase: number;           // Base APY percentage
    apyReward: number | null;  // Reward APY percentage
    tvlUsd: number;
}
```

### RebalanceDecision

```typescript
interface RebalanceDecision {
    shouldRebalance: boolean;
    targetAdapter: string | null;
    reason: string;
    currentAPY: number;
    targetAPY: number;
    improvement: number;       // Basis points improvement
}
```

## Configuration

### Workflow Config (`workflow/config.json`)

```json
{
    "schedule": "0 0 * * * *",
    "defiLlamaBaseUrl": "https://yields.llama.fi",
    "monitoredProtocols": ["aave-v3", "compound-v3"],
    "targetSymbol": "USDC",
    "vaultAddress": "0x...",
    "aggregatorAddress": "0x...",
    "chainSelector": "16015286601757825753",
    "rebalanceThreshold": 50
}
```

### Deployed Addresses (`frontend/src/config/deployed-addresses.json`)

```json
{
    "vault": "0x...",
    "aggregator": "0x...",
    "usdc": "0x..."
}
```
