// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IYieldAggregator
/// @notice Interface for the on-chain adapter registry. Yield comparison and rebalance
///         decisions are handled off-chain by the Chainlink CRE workflow.
interface IYieldAggregator {
    struct YieldInfo {
        address adapter;
        string protocolName;
        uint256 apy;              // in basis points
        uint256 riskScore;        // 1-100
        uint256 riskAdjustedAPY;  // apy * (100 - riskScore) / 100
        uint256 deposited;        // current amount deposited
        bool healthy;             // adapter health status
    }

    /// @notice Returns yield info for all registered adapters
    function getAllYields() external view returns (YieldInfo[] memory);
}
