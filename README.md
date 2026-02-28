# Yieldra

Auto-rebalancing ERC-4626 vault that syncs your stablecoins to the highest risk-adjusted yield across DeFi protocols, powered by Chainlink Automation and Data Feeds.

## How It Works

1. Users deposit USDC into the vault and receive share tokens
2. The YieldAggregator monitors APYs across Aave V3, Compound V3, and Tokenized US Treasuries
3. Risk-adjusted APY is calculated: `apy * (100 - riskScore) / 100`
4. Chainlink Automation triggers rebalancing when a better opportunity exceeds the threshold (50 bps)
5. Users withdraw anytime — shares convert back to USDC + earned yield

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Frontend    │────▶│  TreasuryVault   │────▶│  YieldAdapters  │
│  (Next.js)  │     │  (ERC-4626)      │     │  - Aave V3      │
└─────────────┘     └──────────────────┘     │  - Compound V3  │
                           │                  │  - US Treasuries│
                    ┌──────┴───────┐          └─────────────────┘
                    │              │
              ┌─────▼─────┐ ┌─────▼──────┐
              │  Vault     │ │  Yield     │
              │  Keeper    │ │ Aggregator │
              │ (Chainlink │ │            │
              │ Automation)│ └────────────┘
              └────────────┘
```

## Contracts

| Contract | Description |
|---|---|
| `TreasuryVault.sol` | ERC-4626 vault with rebalancing logic, reentrancy protection, and inflation attack mitigation |
| `YieldAggregator.sol` | Adapter registry, risk-adjusted APY ranking, rebalance decisions |
| `VaultKeeper.sol` | Chainlink Automation compatible (checkUpkeep/performUpkeep) with 1-hour cooldown |
| `AaveV3Adapter.sol` | Deposits/withdraws from Aave V3 lending pool |
| `CompoundV3Adapter.sol` | Deposits/withdraws from Compound V3 (Comet) |
| `TreasuryAdapter.sol` | Tokenized US Treasury adapter with Chainlink price feed validation |

## Tech Stack

**Smart Contracts:** Solidity 0.8.26, Hardhat, OpenZeppelin v5, Chainlink Contracts

**Frontend:** Next.js 16, Tailwind CSS 4, wagmi 3, RainbowKit 2, viem 2

**Automation:** Chainlink Automation (custom logic), Chainlink Data Feeds

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- [MetaMask](https://metamask.io) or any EVM wallet

### Install

```bash
# Clone
git clone https://github.com/1shanpanta/Yieldra.git
cd Yieldra

# Install dependencies
bun install
cd frontend && bun install && cd ..
```

### Run Tests

```bash
bunx hardhat test
```

### Local Development

```bash
# Terminal 1 — start local blockchain
bunx hardhat node

# Terminal 2 — deploy contracts
bunx hardhat run scripts/deploy.ts --network localhost

# Terminal 3 — seed test data (optional)
bunx hardhat run scripts/seed.ts --network localhost

# Terminal 4 — start frontend
cd frontend && bun run dev
```

Then open [http://localhost:3000](http://localhost:3000) and connect your wallet to the Hardhat network:
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `31337`

### Deploy to Sepolia

```bash
cp .env.example .env
# Fill in SEPOLIA_RPC_URL and PRIVATE_KEY
bunx hardhat run scripts/deploy.ts --network sepolia
```

## Security

- ReentrancyGuard on all vault entry points (deposit, mint, withdraw, redeem)
- ERC-4626 inflation attack protection via `_decimalsOffset()`
- Chainlink oracle validation (stale data, negative answers, round completeness)
- Pausable vault with owner controls
- Keeper-only rebalance execution

## License

MIT
