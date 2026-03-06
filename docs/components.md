# Components

## Smart Contracts

### TreasuryVault.sol

ERC-4626 vault that holds USDC and delegates to one active yield adapter.

| Function | Access | Description |
|---|---|---|
| `deposit(assets, receiver)` | public | Deposit USDC, receive tyUSDC shares |
| `mint(shares, receiver)` | public | Mint exact shares amount |
| `withdraw(assets, receiver, owner)` | public | Withdraw USDC by asset amount |
| `redeem(shares, receiver, owner)` | public | Withdraw USDC by share amount |
| `rebalance(newAdapter)` | onlyCRE | Move all funds to a new adapter |
| `emergencyWithdraw()` | onlyOwner | Pull all funds from adapter to vault |
| `setActiveAdapter(adapter)` | onlyOwner | Set which adapter receives deposits |
| `setCREForwarder(forwarder)` | onlyOwner | Set CRE automation address |
| `setDepositCap(cap)` | onlyOwner | Set max TVL (0 = unlimited) |
| `totalAssets()` | view | Idle balance + adapter balance |
| `currentAPY()` | view | Active adapter's current APY (bps) |
| `currentProtocol()` | view | Active adapter's protocol name |

### YieldAggregator.sol

On-chain adapter registry. All yield comparison logic runs off-chain in the CRE workflow.

| Function | Access | Description |
|---|---|---|
| `registerAdapter(adapter)` | onlyOwner | Add adapter to registry |
| `removeAdapter(adapter)` | onlyOwner | Remove adapter (swap-last pattern) |
| `getAllYields()` | view | Returns `YieldInfo[]` for all adapters |
| `getAdapterCount()` | view | Number of registered adapters |
| `getAdapter(index)` | view | Adapter address at index |

### IYieldAdapter (interface)

All protocol adapters implement this interface.

| Function | Description |
|---|---|
| `protocolName()` | Human-readable name (e.g., "Aave V3") |
| `getCurrentAPY()` | Current yield in basis points |
| `getTotalDeposited()` | Funds currently in this adapter |
| `deposit(amount)` | Deploy funds to protocol |
| `withdraw(amount)` | Pull funds from protocol |
| `riskScore()` | Risk rating 1-100 (lower = safer) |
| `isHealthy()` | Operational status |
| `underlyingToken()` | Token address (USDC) |

### Adapters

- **AaveV3Adapter**: Aave V3 lending pool integration
- **CompoundV3Adapter**: Compound V3 (Comet) integration
- **TreasuryAdapter**: Tokenized US Treasury with Chainlink price feed

## Frontend (Next.js)

### Pages

| Route | Component | Description |
|---|---|---|
| `/` | `app/page.tsx` | Main dashboard with vault stats, yield table, deposit panel |
| `/profile` | `app/profile/page.tsx` | User portfolio overview and earnings projection |

### Components

| Component | Props | Description |
|---|---|---|
| `Header` | — | App header with branding, nav links, wallet connect |
| `VaultStats` | — | TVL, APY, active protocol, vault status cards |
| `YieldTable` | `selectedAdapter`, `onSelect` | Protocol comparison table with selection |
| `DepositPanel` | `selectedProtocol` | Deposit/withdraw tabs with amount input |
| `HowItWorks` | — | 4-step explainer section |

### Hooks (`hooks/useVault.ts`)

| Hook | Returns | Description |
|---|---|---|
| `useVaultStats()` | `{ totalAssets, apyPercent, protocol, paused, ... }` | Reads vault contract state |
| `useUserPosition(address)` | `{ shares, assetsValue, usdcBalance, ... }` | User's vault position |
| `useYieldData()` | `{ yields, isLoading }` | All adapter yields from aggregator |
| `useDeposit()` | `{ approveAndDeposit, isPending, ... }` | Approve + deposit flow |
| `useWithdraw()` | `{ redeem, isPending, ... }` | Redeem shares flow |

All hooks fall back to mock data when contracts aren't available (demo mode).

## CRE Workflow (`workflow/`)

| File | Description |
|---|---|
| `workflow.yaml` | Workflow definition (triggers, capabilities, binary ref) |
| `src/main.ts` | Entry point: cron handler, orchestrates all steps |
| `src/actions.ts` | On-chain read/write operations (EVM calls) |
| `src/defi-llama.ts` | DeFi Llama API integration for yield cross-validation |
| `src/decision.ts` | Rebalance decision engine (threshold check, best adapter selection) |
| `config.example.json` | Template for workflow configuration |
