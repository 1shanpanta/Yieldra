// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IYieldAdapter
/// @notice Interface for protocol-specific yield adapters (Aave, Compound, Treasury tokens)
interface IYieldAdapter {
    /// @notice Returns the name of the protocol
    function protocolName() external view returns (string memory);

    /// @notice Returns the current APY in basis points (1% = 100)
    function getCurrentAPY() external view returns (uint256);

    /// @notice Returns the total balance deposited in this adapter (in underlying token decimals)
    function getTotalDeposited() external view returns (uint256);

    /// @notice Deposits the specified amount of underlying token into the protocol
    /// @param amount The amount to deposit (in underlying token decimals)
    function deposit(uint256 amount) external;

    /// @notice Withdraws the specified amount from the protocol back to the caller
    /// @param amount The amount to withdraw (in underlying token decimals)
    /// @return actualAmount The actual amount withdrawn (may differ due to fees/slippage)
    function withdraw(uint256 amount) external returns (uint256 actualAmount);

    /// @notice Returns the underlying token address this adapter works with
    function underlyingToken() external view returns (address);

    /// @notice Returns a risk score for this protocol (1-100, lower = safer)
    function riskScore() external view returns (uint256);

    /// @notice Returns whether the adapter is healthy and able to accept deposits/withdrawals
    function isHealthy() external view returns (bool);
}
