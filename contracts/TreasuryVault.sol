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
    address public keeper; // Chainlink Automation address
    bool public paused;

    // --- Events ---
    event Rebalanced(address indexed fromAdapter, address indexed toAdapter, uint256 amount);
    event AdapterChanged(address indexed newAdapter);
    event KeeperUpdated(address indexed newKeeper);
    event Paused(bool isPaused);
    event FundsDeployed(address indexed adapter, uint256 amount);
    event FundsWithdrawn(address indexed adapter, uint256 amount);

    // --- Errors ---
    error VaultPaused();
    error OnlyKeeper();
    error NoAdapter();
    error SameAdapter();

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

    modifier onlyKeeper() {
        if (msg.sender != keeper && msg.sender != owner()) revert OnlyKeeper();
        _;
    }

    // --- Admin Functions ---

    /// @notice Set the active yield adapter
    function setActiveAdapter(address _adapter) external onlyOwner {
        activeAdapter = IYieldAdapter(_adapter);
        emit AdapterChanged(_adapter);
    }

    /// @notice Set the Chainlink Automation keeper address
    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    /// @notice Emergency pause
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
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
        uint256 shares = super.deposit(assets, receiver);
        _deployToAdapter();
        return shares;
    }

    /// @notice Mint shares and deploy underlying to active adapter
    function mint(uint256 shares, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
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
            activeAdapter.withdraw(shortfall);
            emit FundsWithdrawn(address(activeAdapter), shortfall);
        }
    }

    // --- Rebalancing ---

    /// @notice Move all funds from current adapter to a new adapter
    /// @dev Called by Chainlink Automation keeper or owner
    function rebalance(address newAdapter) external onlyKeeper nonReentrant whenNotPaused {
        if (newAdapter == address(0)) revert NoAdapter();
        if (newAdapter == address(activeAdapter)) revert SameAdapter();

        address oldAdapter = address(activeAdapter);
        uint256 amount = 0;

        // Withdraw everything from current adapter
        if (oldAdapter != address(0)) {
            amount = IYieldAdapter(oldAdapter).getTotalDeposited();
            if (amount > 0) {
                IYieldAdapter(oldAdapter).withdraw(amount);
            }
        }

        // Deposit everything into new adapter
        activeAdapter = IYieldAdapter(newAdapter);
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        if (balance > 0) {
            IERC20(asset()).safeIncreaseAllowance(newAdapter, balance);
            activeAdapter.deposit(balance);
        }

        emit Rebalanced(oldAdapter, newAdapter, balance);
        emit AdapterChanged(newAdapter);
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
