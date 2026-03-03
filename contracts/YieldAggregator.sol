// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IYieldAdapter.sol";
import "./interfaces/IYieldAggregator.sol";

/// @title YieldAggregator
/// @notice Compares yields across registered adapters and recommends the best one
contract YieldAggregator is IYieldAggregator, Ownable {
    // --- State ---
    address[] public adapters;
    mapping(address => bool) public isRegistered;

    /// @notice Minimum yield gap in basis points to trigger rebalance (default: 50 = 0.5%)
    uint256 public rebalanceThreshold = 50;

    /// @notice Address of the vault this aggregator serves
    address public vault;

    // --- Events ---
    event AdapterRegistered(address indexed adapter);
    event AdapterRemoved(address indexed adapter);
    event ThresholdUpdated(uint256 newThreshold);
    event VaultUpdated(address indexed newVault);

    // --- Errors ---
    error AlreadyRegistered();
    error NotRegistered();
    error NoAdapters();

    constructor() Ownable(msg.sender) {}

    // --- Admin ---

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
        emit VaultUpdated(_vault);
    }

    function setRebalanceThreshold(uint256 _threshold) external onlyOwner {
        rebalanceThreshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

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

            yields[i] = YieldInfo({
                adapter: adapters[i],
                protocolName: adapter.protocolName(),
                apy: apy,
                riskScore: risk,
                riskAdjustedAPY: riskAdjusted,
                deposited: adapter.getTotalDeposited()
            });
        }

        return yields;
    }

    /// @inheritdoc IYieldAggregator
    function getBestYield() public view override returns (address bestAdapter, uint256 bestAPY) {
        if (adapters.length == 0) revert NoAdapters();

        for (uint256 i = 0; i < adapters.length; i++) {
            IYieldAdapter adapter = IYieldAdapter(adapters[i]);

            // Skip unhealthy adapters
            try adapter.isHealthy() returns (bool healthy) {
                if (!healthy) continue;
            } catch {
                continue;
            }

            // Skip adapters whose APY call reverts (e.g. stale Chainlink feed)
            uint256 apy;
            try adapter.getCurrentAPY() returns (uint256 _apy) {
                apy = _apy;
            } catch {
                continue;
            }

            uint256 risk = adapter.riskScore();
            uint256 riskAdjusted = apy * (100 - risk) / 100;

            if (riskAdjusted > bestAPY) {
                bestAPY = riskAdjusted;
                bestAdapter = adapters[i];
            }
        }
    }

    /// @inheritdoc IYieldAggregator
    function getCurrentAdapter() external view override returns (address) {
        if (vault == address(0)) return address(0);
        // Read from vault which adapter is active
        // We use a low-level call to avoid import dependency
        (bool success, bytes memory data) = vault.staticcall(
            abi.encodeWithSignature("activeAdapter()")
        );
        if (!success) return address(0);
        return abi.decode(data, (address));
    }

    /// @inheritdoc IYieldAggregator
    function shouldRebalance() public view override returns (bool needed, address targetAdapter) {
        if (adapters.length == 0 || vault == address(0)) return (false, address(0));

        // Get current adapter from vault
        (bool success, bytes memory data) = vault.staticcall(
            abi.encodeWithSignature("activeAdapter()")
        );
        if (!success) return (false, address(0));
        address currentAdapter = abi.decode(data, (address));

        // Get best yield
        (address best, uint256 bestAPY) = getBestYield();

        // If no healthy adapter available, don't rebalance
        if (best == address(0)) {
            return (false, address(0));
        }

        // If no current adapter, definitely rebalance
        if (currentAdapter == address(0)) {
            return (true, best);
        }

        // If best is already current, no rebalance
        if (best == currentAdapter) {
            return (false, address(0));
        }

        // Check if yield gap exceeds threshold
        IYieldAdapter current = IYieldAdapter(currentAdapter);
        uint256 currentRiskAdjusted;
        try current.getCurrentAPY() returns (uint256 currentAPY) {
            uint256 currentRisk = current.riskScore();
            currentRiskAdjusted = currentAPY * (100 - currentRisk) / 100;
        } catch {
            // Current adapter's APY is unavailable — rebalance to healthy adapter
            return (true, best);
        }

        if (bestAPY > currentRiskAdjusted + rebalanceThreshold) {
            return (true, best);
        }

        return (false, address(0));
    }
}
