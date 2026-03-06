// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IYieldAdapter.sol";
import "./interfaces/IYieldAggregator.sol";

/// @title YieldAggregator
/// @notice On-chain adapter registry. Yield comparison and rebalance decisions are handled
///         off-chain by the Chainlink CRE workflow, which reads adapter data via getAllYields().
contract YieldAggregator is IYieldAggregator, Ownable {
    // --- State ---
    address[] public adapters;
    mapping(address => bool) public isRegistered;

    // --- Events ---
    event AdapterRegistered(address indexed adapter);
    event AdapterRemoved(address indexed adapter);

    // --- Errors ---
    error AlreadyRegistered();
    error NotRegistered();

    constructor() Ownable(msg.sender) {}

    // --- Admin ---

    function registerAdapter(address _adapter) external onlyOwner {
        if (isRegistered[_adapter]) revert AlreadyRegistered();
        adapters.push(_adapter);
        isRegistered[_adapter] = true;
        emit AdapterRegistered(_adapter);
    }

    function removeAdapter(address _adapter) external onlyOwner {
        if (!isRegistered[_adapter]) revert NotRegistered();
        isRegistered[_adapter] = false;

        // Remove from array
        for (uint256 i = 0; i < adapters.length; i++) {
            if (adapters[i] == _adapter) {
                adapters[i] = adapters[adapters.length - 1];
                adapters.pop();
                break;
            }
        }
        emit AdapterRemoved(_adapter);
    }

    // --- View Functions ---

    function getAdapterCount() external view returns (uint256) {
        return adapters.length;
    }

    /// @notice Returns the adapter address at an index
    function getAdapter(uint256 index) external view returns (address) {
        return adapters[index];
    }

    /// @inheritdoc IYieldAggregator
    function getAllYields() external view override returns (YieldInfo[] memory) {
        YieldInfo[] memory yields = new YieldInfo[](adapters.length);

        for (uint256 i = 0; i < adapters.length; i++) {
            IYieldAdapter adapter = IYieldAdapter(adapters[i]);

            // Gracefully handle adapters whose getCurrentAPY() reverts (e.g. stale Chainlink feed)
            uint256 apy;
            try adapter.getCurrentAPY() returns (uint256 _apy) {
                apy = _apy;
            } catch {
                apy = 0;
            }

            uint256 risk = adapter.riskScore();
            uint256 riskAdjusted = apy * (100 - risk) / 100;

            bool healthy;
            try adapter.isHealthy() returns (bool _healthy) {
                healthy = _healthy;
            } catch {
                healthy = false;
            }

            yields[i] = YieldInfo({
                adapter: adapters[i],
                protocolName: adapter.protocolName(),
                apy: apy,
                riskScore: risk,
                riskAdjustedAPY: riskAdjusted,
                deposited: adapter.getTotalDeposited(),
                healthy: healthy
            });
        }

        return yields;
    }
}
