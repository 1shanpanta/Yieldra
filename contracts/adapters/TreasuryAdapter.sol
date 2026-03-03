// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IYieldAdapter.sol";

/// @notice Minimal interface for tokenized treasury tokens (Ondo OUSG, Backed bIB01, etc.)
interface ITreasuryToken {
    function mint(uint256 usdcAmount) external;
    function redeem(uint256 tokenAmount) external;
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Chainlink Data Feed interface for treasury yield
interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

/// @title TreasuryAdapter
/// @notice Deposits USDC into tokenized US Treasury product and reads yield from Chainlink feed
/// @dev In production this wraps Ondo OUSG, Backed bIB01, or similar.
///      For the hackathon MVP, the treasury token can be mocked.
contract TreasuryAdapter is IYieldAdapter, Ownable {
    using SafeERC20 for IERC20;

    string private constant NAME = "US Treasury (Tokenized)";
    uint256 private constant RISK = 5; // Very low risk — US government bonds

    IERC20 public immutable underlying;
    ITreasuryToken public immutable treasuryToken;
    AggregatorV3Interface public immutable yieldFeed; // Chainlink feed for treasury yield
    address public vault;

    uint256 private constant BPS = 1e4;

    error OnlyVault();
    error StaleFeed();
    error InvalidAnswer();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(
        address _underlying,
        address _treasuryToken,
        address _yieldFeed
    ) Ownable(msg.sender) {
        underlying = IERC20(_underlying);
        treasuryToken = ITreasuryToken(_treasuryToken);
        yieldFeed = AggregatorV3Interface(_yieldFeed);
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    // --- IYieldAdapter Implementation ---

    function protocolName() external pure override returns (string memory) {
        return NAME;
    }

    /// @notice Returns the current US Treasury yield in basis points from Chainlink feed
    function getCurrentAPY() external view override returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = yieldFeed.latestRoundData();
        if (answer <= 0) revert InvalidAnswer();
        if (answeredInRound < roundId) revert StaleFeed();
        if (block.timestamp - updatedAt > 1 days) revert StaleFeed();

        uint8 feedDecimals = yieldFeed.decimals();
        // Convert feed answer to basis points
        // If feed returns 450 with 2 decimals, that means 4.50% = 450 bps
        if (feedDecimals == 2) {
            return uint256(answer); // Already in bps
        } else if (feedDecimals == 8) {
            return uint256(answer) / 1e4; // Convert 8-decimal to bps
        }
        // Default: assume feed is in bps
        return uint256(answer);
    }

    function getTotalDeposited() external view override returns (uint256) {
        // Treasury token balance represents deposited value
        // In a real implementation, this would convert treasury token balance back to USDC value
        return treasuryToken.balanceOf(address(this));
    }

    function underlyingToken() external view override returns (address) {
        return address(underlying);
    }

    function riskScore() external pure override returns (uint256) {
        return RISK;
    }

    /// @notice Adapter is healthy if the Chainlink feed is returning fresh data
    function isHealthy() external view override returns (bool) {
        try yieldFeed.latestRoundData() returns (
            uint80 roundId, int256 answer, uint256, uint256 updatedAt, uint80 answeredInRound
        ) {
            if (answer <= 0) return false;
            if (answeredInRound < roundId) return false;
            if (block.timestamp - updatedAt > 1 days) return false;
            return true;
        } catch {
            return false;
        }
    }

    function deposit(uint256 amount) external override onlyVault {
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        underlying.safeIncreaseAllowance(address(treasuryToken), amount);
        treasuryToken.mint(amount);
    }

    function withdraw(uint256 amount) external override onlyVault returns (uint256) {
        treasuryToken.redeem(amount);
        uint256 balance = underlying.balanceOf(address(this));
        underlying.safeTransfer(msg.sender, balance);
        return balance;
    }
}
