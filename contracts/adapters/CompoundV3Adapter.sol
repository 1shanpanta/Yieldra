// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IYieldAdapter.sol";

/// @notice Minimal Compound V3 (Comet) interface
interface IComet {
    function supply(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function getSupplyRate(uint256 utilization) external view returns (uint64);
    function getUtilization() external view returns (uint256);
}

/// @title CompoundV3Adapter
/// @notice Deposits/withdraws USDC from Compound V3 (Comet) and reports APY
contract CompoundV3Adapter is IYieldAdapter, Ownable {
    using SafeERC20 for IERC20;

    string private constant NAME = "Compound V3";
    uint256 private constant RISK = 12; // Low risk, slightly more than Aave

    IERC20 public immutable underlying;
    IComet public immutable comet;
    address public vault;

    // Compound V3 rates are per-second, scaled by 1e18
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant BPS = 1e4;
    uint256 private constant SCALE = 1e18;

    error OnlyVault();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(
        address _underlying,
        address _comet
    ) Ownable(msg.sender) {
        underlying = IERC20(_underlying);
        comet = IComet(_comet);
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    // --- IYieldAdapter Implementation ---

    function protocolName() external pure override returns (string memory) {
        return NAME;
    }

    /// @notice Returns the current supply APY in basis points
    /// @dev Compound V3 rate is per-second, we annualize and convert to bps
    function getCurrentAPY() external view override returns (uint256) {
        uint256 utilization = comet.getUtilization();
        uint64 supplyRate = comet.getSupplyRate(utilization);
        // Annualize: rate * seconds_per_year, then convert to bps
        // supplyRate is scaled by 1e18
        uint256 annualRate = uint256(supplyRate) * SECONDS_PER_YEAR;
        return (annualRate * BPS) / SCALE;
    }

    function getTotalDeposited() external view override returns (uint256) {
        return comet.balanceOf(address(this));
    }

    function underlyingToken() external view override returns (address) {
        return address(underlying);
    }

    function riskScore() external pure override returns (uint256) {
        return RISK;
    }

    /// @notice Adapter is healthy if Comet is reachable
    function isHealthy() external view override returns (bool) {
        try comet.getUtilization() returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }

    function deposit(uint256 amount) external override onlyVault {
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        underlying.safeIncreaseAllowance(address(comet), amount);
        comet.supply(address(underlying), amount);
    }

    function withdraw(uint256 amount) external override onlyVault returns (uint256) {
        comet.withdraw(address(underlying), amount);
        uint256 balance = underlying.balanceOf(address(this));
        underlying.safeTransfer(msg.sender, balance);
        return balance;
    }
}
