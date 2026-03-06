// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IYieldAdapter.sol";

/// @title TreasuryVault
/// @notice ERC-4626 vault that holds stablecoins and allocates to the best yield source
/// @dev Deposits go to the currently active adapter. Rebalancing moves funds between adapters.
contract TreasuryVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- State ---
    IYieldAdapter public activeAdapter;
    address public creForwarder; // Chainlink CRE forwarder address
    bool public paused;

    /// @notice Track last deposit block to prevent same-block rebalance manipulation
    uint256 public lastDepositBlock;

    /// @notice Timestamp of last rebalance (cooldown enforcement)
    uint256 public lastRebalanceTime;

    /// @notice Minimum time between rebalances
    uint256 public constant MIN_REBALANCE_INTERVAL = 1 hours;

    /// @notice Maximum total assets the vault will accept (0 = unlimited)
    uint256 public depositCap;

    /// @notice Maximum deposit amount per block to prevent sandwich attacks (0 = unlimited)
    uint256 public maxDepositPerBlock;
    mapping(uint256 => uint256) private _depositsPerBlock;

    // --- Events ---
    event Rebalanced(address indexed fromAdapter, address indexed toAdapter, uint256 amount);
    event AdapterChanged(address indexed newAdapter);
    event CREForwarderUpdated(address indexed newForwarder);
    event Paused(bool isPaused);
    event FundsDeployed(address indexed adapter, uint256 amount);
    event FundsWithdrawn(address indexed adapter, uint256 amount);
    event DepositCapUpdated(uint256 newCap);
    event BlockDepositLimitUpdated(uint256 newLimit);
    event EmergencyWithdrawal(address indexed user, uint256 amount);

    // --- Errors ---
    error VaultPaused();
    error OnlyCRE();
    error NoAdapter();
    error CooldownActive();
    error SameAdapter();
    error AdapterUnhealthy();
    error SameBlockRebalance();
    error SlippageExceeded();
    error BlockDepositLimitExceeded();
    error NoShares();
    error InsufficientWithdraw();

    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol
    ) ERC4626(_asset) ERC20(_name, _symbol) Ownable(msg.sender) {}

    /// @dev Mitigate ERC-4626 inflation / first-depositor attack
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // --- Modifiers ---
    modifier whenNotPaused() {
        if (paused) revert VaultPaused();
        _;
    }

    modifier onlyCRE() {
        if (msg.sender != creForwarder && msg.sender != owner()) revert OnlyCRE();
        _;
    }

    // --- Admin Functions ---

    /// @notice Set the active yield adapter
    function setActiveAdapter(address _adapter) external onlyOwner {
        activeAdapter = IYieldAdapter(_adapter);
        emit AdapterChanged(_adapter);
    }

    /// @notice Set the Chainlink CRE forwarder address
    function setCREForwarder(address _forwarder) external onlyOwner {
        creForwarder = _forwarder;
        emit CREForwarderUpdated(_forwarder);
    }

    /// @notice Emergency pause
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    /// @notice Set the maximum total assets the vault will accept (0 = unlimited)
    function setDepositCap(uint256 _cap) external onlyOwner {
        depositCap = _cap;
        emit DepositCapUpdated(_cap);
    }

    /// @notice Set the max deposit amount allowed per block (0 = unlimited)
    function setMaxDepositPerBlock(uint256 _max) external onlyOwner {
        maxDepositPerBlock = _max;
        emit BlockDepositLimitUpdated(_max);
    }

    /// @dev Override maxDeposit to enforce the deposit cap
    function maxDeposit(address) public view override returns (uint256) {
        if (paused) return 0;
        if (depositCap == 0) return type(uint256).max;
        uint256 currentAssets = totalAssets();
        if (currentAssets >= depositCap) return 0;
        return depositCap - currentAssets;
    }

    // --- Core Vault Logic ---

    /// @notice Total assets = idle balance + deposited in active adapter
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 deployed = address(activeAdapter) != address(0)
            ? activeAdapter.getTotalDeposited()
            : 0;
        return idle + deployed;
    }

    /// @notice Deposit assets and deploy to active adapter
    function deposit(uint256 assets, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        _enforceBlockLimit(assets);
        lastDepositBlock = block.number;
        uint256 shares = super.deposit(assets, receiver);
        _deployToAdapter();
        return shares;
    }

    /// @notice Mint shares and deploy underlying to active adapter
    function mint(uint256 shares, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        uint256 expectedAssets = previewMint(shares);
        _enforceBlockLimit(expectedAssets);
        lastDepositBlock = block.number;
        uint256 assets = super.mint(shares, receiver);
        _deployToAdapter();
        return assets;
    }

    /// @notice Withdraw: pull from adapter if idle balance is insufficient
    function withdraw(uint256 assets, address receiver, address _owner) public override nonReentrant whenNotPaused returns (uint256) {
        _ensureIdle(assets);
        return super.withdraw(assets, receiver, _owner);
    }

    /// @notice Redeem: pull from adapter if idle balance is insufficient
    function redeem(uint256 shares, address receiver, address _owner) public override nonReentrant whenNotPaused returns (uint256) {
        uint256 assets = previewRedeem(shares);
        _ensureIdle(assets);
        return super.redeem(shares, receiver, _owner);
    }

    // --- Internal Helpers ---

    /// @notice Enforce per-block deposit rate limit
    function _enforceBlockLimit(uint256 assets) internal {
        if (maxDepositPerBlock == 0) return;
        _depositsPerBlock[block.number] += assets;
        if (_depositsPerBlock[block.number] > maxDepositPerBlock) revert BlockDepositLimitExceeded();
    }

    /// @notice Deploy idle balance to active adapter
    function _deployToAdapter() internal {
        if (address(activeAdapter) == address(0)) return;
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle == 0) return;

        IERC20(asset()).safeIncreaseAllowance(address(activeAdapter), idle);
        activeAdapter.deposit(idle);
        emit FundsDeployed(address(activeAdapter), idle);
    }

    /// @notice Ensure we have enough idle balance, withdraw from adapter if needed
    function _ensureIdle(uint256 needed) internal {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle >= needed) return;

        uint256 shortfall = needed - idle;
        if (address(activeAdapter) != address(0)) {
            uint256 balanceBefore = idle;
            activeAdapter.withdraw(shortfall);
            uint256 balanceAfter = IERC20(asset()).balanceOf(address(this));
            if (balanceAfter < needed) revert InsufficientWithdraw();
            emit FundsWithdrawn(address(activeAdapter), balanceAfter - balanceBefore);
        }
    }

    // --- Rebalancing ---

    /// @notice Move all funds from current adapter to a new adapter
    /// @dev Called by Chainlink CRE workflow forwarder or owner
    function rebalance(address newAdapter) external onlyCRE nonReentrant whenNotPaused {
        if (block.timestamp < lastRebalanceTime + MIN_REBALANCE_INTERVAL) revert CooldownActive();
        if (newAdapter == address(0)) revert NoAdapter();
        if (newAdapter == address(activeAdapter)) revert SameAdapter();
        if (!IYieldAdapter(newAdapter).isHealthy()) revert AdapterUnhealthy();
        // Prevent flash loan manipulation: no rebalance in the same block as a deposit
        if (block.number == lastDepositBlock) revert SameBlockRebalance();

        address oldAdapter = address(activeAdapter);
        uint256 amount = 0;

        // Withdraw everything from current adapter
        if (oldAdapter != address(0)) {
            amount = IYieldAdapter(oldAdapter).getTotalDeposited();
            if (amount > 0) {
                uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
                IYieldAdapter(oldAdapter).withdraw(amount);
                uint256 received = IERC20(asset()).balanceOf(address(this)) - balanceBefore;
                // Slippage guard: ensure at least 99% of expected amount is received
                if (received < (amount * 99) / 100) revert SlippageExceeded();
            }
        }

        // Deposit everything into new adapter
        activeAdapter = IYieldAdapter(newAdapter);
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        if (balance > 0) {
            IERC20(asset()).safeIncreaseAllowance(newAdapter, balance);
            activeAdapter.deposit(balance);
        }

        lastRebalanceTime = block.timestamp;

        emit Rebalanced(oldAdapter, newAdapter, balance);
        emit AdapterChanged(newAdapter);
    }

    // --- Emergency ---

    /// @notice Emergency withdraw: burns shares and returns only idle USDC (bypasses adapter)
    /// @dev Use when the adapter is compromised and normal withdraw reverts
    function emergencyWithdraw() external nonReentrant {
        uint256 shares = balanceOf(msg.sender);
        if (shares == 0) revert NoShares();

        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 supply = totalSupply();

        // Pro-rata share of idle funds only
        uint256 payout = (idle * shares) / supply;
        _burn(msg.sender, shares);

        if (payout > 0) {
            IERC20(asset()).safeTransfer(msg.sender, payout);
        }

        emit EmergencyWithdrawal(msg.sender, payout);
    }

    // --- View Helpers ---

    /// @notice Returns the current APY from the active adapter (basis points)
    function currentAPY() external view returns (uint256) {
        if (address(activeAdapter) == address(0)) return 0;
        return activeAdapter.getCurrentAPY();
    }

    /// @notice Returns the active adapter's protocol name
    function currentProtocol() external view returns (string memory) {
        if (address(activeAdapter) == address(0)) return "None (Idle)";
        return activeAdapter.protocolName();
    }
}
