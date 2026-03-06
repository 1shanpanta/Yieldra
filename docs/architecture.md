# Architecture

## Overview

Yieldra is an auto-rebalancing ERC-4626 vault that allocates stablecoins (USDC) to the highest risk-adjusted yield protocol. Rebalancing decisions are made off-chain by a Chainlink CRE workflow and executed on-chain.

## System Design

```
ON-CHAIN                                    OFF-CHAIN
─────────────────────────────────────       ─────────────────────────────
TreasuryVault (ERC-4626)                    Chainlink CRE Workflow
  ├── holds USDC deposits                     ├── cron trigger (hourly)
  ├── mints/burns tyUSDC shares               ├── reads YieldAggregator
  ├── delegates to one active adapter         ├── fetches DeFi Llama data
  └── rebalance() [onlyCRE]                   ├── decision engine
                                               └── calls vault.rebalance()
YieldAggregator (registry)
  ├── registers/removes adapters
  └── getAllYields() → YieldInfo[]

IYieldAdapter implementations
  ├── AaveV3Adapter
  ├── CompoundV3Adapter
  └── TreasuryAdapter
```

## Data Flow

### Deposit

1. User approves USDC spend to vault
2. `vault.deposit(amount, receiver)` → mints shares, transfers USDC
3. `_deployToAdapter()` → sends idle USDC to active adapter
4. Adapter deposits into underlying protocol (Aave/Compound/Treasury)

### Rebalance (CRE-triggered)

1. CRE cron fires every hour
2. Workflow fetches DeFi Llama yields for monitored protocols
3. Workflow reads `YieldAggregator.getAllYields()` on-chain
4. Decision engine cross-validates, calculates risk-adjusted APY
5. If best adapter's risk-adj APY > current + 50 bps threshold:
   - Calls `vault.rebalance(newAdapter)` via CRE forwarder
6. Vault withdraws all from old adapter, deposits all to new adapter

### Withdrawal

1. `vault.redeem(shares, receiver, owner)` → burns shares
2. If vault has insufficient idle USDC, pulls from active adapter
3. Transfers USDC to user

## Key Decisions

- **One active adapter at a time**: simplifies fund management, all deposits go to a single protocol
- **Off-chain decision engine**: saves gas, enables complex logic (DeFi Llama cross-validation, hybrid data sources)
- **Risk-adjusted yields**: `APY * (100 - riskScore) / 100` applied both on-chain and in workflow
- **CRE forwarder access control**: only the Chainlink CRE forwarder (or owner) can trigger rebalances — no external EOAs
- **Decimal offset of 6**: mitigates ERC-4626 inflation attacks for USDC (6 decimals)

## Security Model

| Guard | Purpose |
|---|---|
| ReentrancyGuard | Prevents reentrancy on deposit/withdraw/rebalance |
| `onlyCRE` modifier | Restricts rebalance to CRE forwarder or owner |
| 1-hour cooldown | Prevents rapid rebalance manipulation |
| Same-block prevention | Blocks rebalance in same block as deposit (flash loan defense) |
| 99% slippage check | Ensures rebalance doesn't lose more than 1% |
| Deposit cap | Optional TVL limit |
| Per-block rate limit | Optional deposit rate limiting |
| Pausable | Emergency circuit breaker |

## Deployment Order

1. Mock USDC (testnet) or real USDC address (mainnet)
2. Yield adapters (Aave, Compound, Treasury)
3. TreasuryVault (asset = USDC)
4. YieldAggregator (registers all adapters)
5. Configure vault: set active adapter, set CRE forwarder
6. Write frontend config (addresses, env vars)
7. Write workflow config (vault/aggregator addresses, chain selector)
