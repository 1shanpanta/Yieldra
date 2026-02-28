// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IYieldAggregator
/// @notice Interface for the yield comparison and recommendation engine
interface IYieldAggregator {
    struct YieldInfo {
        address adapter;
        string protocolName;
        uint256 apy;           // in basis points
        uint256 riskScore;     // 1-100
        uint256 riskAdjustedAPY; // apy * (100 - riskScore) / 100
        uint256 deposited;     // current amount deposited
    }

    /// @notice Returns yield info for all registered adapters
    function getAllYields() external view returns (YieldInfo[] memory);

    /// @notice Returns the adapter with the best risk-adjusted APY
    function getBestYield() external view returns (address bestAdapter, uint256 bestAPY);

    /// @notice Returns the adapter where funds are currently allocated
    function getCurrentAdapter() external view returns (address);

    /// @notice Checks if a rebalance is recommended (yield gap > threshold)
    function shouldRebalance() external view returns (bool needed, address targetAdapter);
}
