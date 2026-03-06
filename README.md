# Yieldra

Auto-rebalancing ERC-4626 vault that routes stablecoins to the highest risk-adjusted yield across DeFi protocols, powered by Chainlink CRE (Compute, Read, Execute) workflows.

## How It Works

1. Users deposit USDC into the vault and receive tyUSDC share tokens
2. The Chainlink CRE workflow runs hourly, reading on-chain yields and cross-validating against DeFi Llama
3. Risk-adjusted APY is calculated: `apy * (100 - riskScore) / 100`
4. When a better opportunity exceeds the threshold (50 bps), the workflow triggers an on-chain rebalance
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
              │ Chainlink  │ │  Yield     │
              │ CRE        │ │ Aggregator │
              │ Workflow   │ │            │
              └────────────┘ └────────────┘
```

## Contracts

| Contract | Description |
|---|---|
| `TreasuryVault.sol` | ERC-4626 vault with rebalancing, reentrancy protection, inflation attack mitigation, and CRE forwarder access control |
| `YieldAggregator.sol` | On-chain adapter registry with risk-adjusted APY reads |
| `AaveV3Adapter.sol` | Deposits/withdraws from Aave V3 lending pool |
| `CompoundV3Adapter.sol` | Deposits/withdraws from Compound V3 (Comet) |
| `TreasuryAdapter.sol` | Tokenized US Treasury adapter with Chainlink price feed validation |

## Tech Stack

**Smart Contracts:** Solidity 0.8.26, Hardhat, OpenZeppelin v5, Chainlink Contracts

**Frontend:** Next.js 16, Tailwind CSS 4, wagmi 3, RainbowKit 2, viem 2

**Automation:** Chainlink CRE Workflow (cron-triggered, off-chain decision engine with DeFi Llama cross-validation)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- [MetaMask](https://metamask.io) or any EVM wallet

### Install

```bash
git clone https://github.com/1shanpanta/Yieldra.git
cd Yieldra

bun install
cd frontend && bun install && cd ..
```

### Run Tests

```bash
# Smart contract tests (116 tests)
bunx hardhat test

# Frontend tests (48 tests)
cd frontend && bunx vitest run
```

### Local Development

```bash
# Terminal 1 — start local blockchain
bunx hardhat node

# Terminal 2 — deploy contracts
bunx hardhat run scripts/deploy.ts --network localhost

# Terminal 3 — start frontend
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
- CRE forwarder-only rebalance execution (no external EOA can trigger rebalances)
- 1-hour cooldown between rebalances
- Same-block rebalance prevention (flash loan defense)
- 99% slippage minimum on rebalancing operations

## License

MIT
