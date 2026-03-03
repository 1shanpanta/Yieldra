// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IYieldAdapter.sol";

/// @notice Minimal Aave V3 Pool interface
interface IAaveV3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function getReserveData(address asset) external view returns (
        uint256 configuration,
        uint128 liquidityIndex,
        uint128 currentLiquidityRate, // RAY (1e27) — this is the supply APY
        uint128 variableBorrowIndex,
        uint128 currentVariableBorrowRate,
        uint128 currentStableBorrowRate,
        uint40 lastUpdateTimestamp,
        uint16 id,
        address aTokenAddress,
        address stableDebtTokenAddress,
        address variableDebtTokenAddress,
        address interestRateStrategyAddress,
        uint128 accruedToTreasury,
        uint128 unbacked,
        uint128 isolationModeTotalDebt
    );
}

/// @title AaveV3Adapter
/// @notice Deposits/withdraws USDC from Aave V3 and reports current supply APY
contract AaveV3Adapter is IYieldAdapter, Ownable {
    using SafeERC20 for IERC20;

    string private constant NAME = "Aave V3";
    uint256 private constant RISK = 10; // Low risk — blue chip protocol

    IERC20 public immutable underlying;
    IAaveV3Pool public immutable aavePool;
    IERC20 public immutable aToken;
    address public vault;

    // RAY = 1e27 (Aave's precision for rates)
    uint256 private constant RAY = 1e27;
    // Basis point = 1e4
    uint256 private constant BPS = 1e4;

    error OnlyVault();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(
        address _underlying,
        address _aavePool,
        address _aToken
    ) Ownable(msg.sender) {
        underlying = IERC20(_underlying);
        aavePool = IAaveV3Pool(_aavePool);
        aToken = IERC20(_aToken);
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    // --- IYieldAdapter Implementation ---

    function protocolName() external pure override returns (string memory) {
        return NAME;
    }

    /// @notice Returns the current supply APY in basis points
    /// @dev Converts Aave's RAY-denominated rate to basis points
    function getCurrentAPY() external view override returns (uint256) {
        (,, uint128 currentLiquidityRate,,,,,,,,,,,,) = aavePool.getReserveData(address(underlying));
        // currentLiquidityRate is in RAY (1e27), convert to bps (1e4)
        // APY in bps = rate * 10000 / 1e27
        return (uint256(currentLiquidityRate) * BPS) / RAY;
    }

    function getTotalDeposited() external view override returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    function underlyingToken() external view override returns (address) {
        return address(underlying);
    }

    function riskScore() external pure override returns (uint256) {
        return RISK;
    }

    /// @notice Adapter is healthy if the aToken balance is accessible
    function isHealthy() external view override returns (bool) {
        try aavePool.getReserveData(address(underlying)) returns (
            uint256, uint128, uint128, uint128, uint128, uint128, uint40, uint16,
            address, address, address, address, uint128, uint128, uint128
        ) {
            return true;
        } catch {
            return false;
        }
    }

    function deposit(uint256 amount) external override onlyVault {
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        underlying.safeIncreaseAllowance(address(aavePool), amount);
        aavePool.supply(address(underlying), amount, address(this), 0);
    }

    function withdraw(uint256 amount) external override onlyVault returns (uint256) {
        uint256 withdrawn = aavePool.withdraw(address(underlying), amount, msg.sender);
        return withdrawn;
    }
}
