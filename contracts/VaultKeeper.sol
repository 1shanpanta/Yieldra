// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "./TreasuryVault.sol";
import "./YieldAggregator.sol";

/// @title VaultKeeper
/// @notice Chainlink Automation-compatible keeper that triggers vault rebalancing
contract VaultKeeper is AutomationCompatibleInterface {
    TreasuryVault public immutable vault;
    YieldAggregator public immutable aggregator;

    /// @notice Minimum time between rebalances (prevents excessive gas spend)
    uint256 public constant MIN_REBALANCE_INTERVAL = 1 hours;

    /// @notice Timestamp of last rebalance
    uint256 public lastRebalanceTime;

    // --- Events ---
    event UpkeepPerformed(address indexed newAdapter, uint256 timestamp);

    constructor(address _vault, address _aggregator) {
        vault = TreasuryVault(_vault);
        aggregator = YieldAggregator(_aggregator);
    }

    /// @notice Called by Chainlink Automation to check if rebalancing is needed
    /// @return upkeepNeeded True if a rebalance should happen
    /// @return performData Encoded target adapter address
    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        // Respect cooldown
        if (block.timestamp < lastRebalanceTime + MIN_REBALANCE_INTERVAL) {
            return (false, "");
        }

        // Check if vault is paused
        if (vault.paused()) {
            return (false, "");
        }

        // Ask aggregator if rebalance is needed
        (bool needed, address targetAdapter) = aggregator.shouldRebalance();

        if (needed && targetAdapter != address(0)) {
            return (true, abi.encode(targetAdapter));
        }

        return (false, "");
    }

    /// @notice Called by Chainlink Automation to execute the rebalance
    /// @param performData Encoded target adapter address from checkUpkeep
    function performUpkeep(bytes calldata performData) external override {
        // Re-verify conditions (prevents front-running)
        (bool needed, address targetAdapter) = aggregator.shouldRebalance();
        require(needed, "Rebalance not needed");

        address target = abi.decode(performData, (address));
        require(target == targetAdapter, "Target adapter mismatch");

        // Execute rebalance
        vault.rebalance(target);
        lastRebalanceTime = block.timestamp;

        emit UpkeepPerformed(target, block.timestamp);
    }
}
