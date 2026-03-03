// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IYieldAdapter.sol";

/// @title MockYieldAdapter
/// @notice Simulates a yield protocol for testing. APY can be set by owner.
contract MockYieldAdapter is IYieldAdapter {
    using SafeERC20 for IERC20;

    string private _name;
    address private _underlying;
    uint256 private _apy; // in basis points
    uint256 private _risk; // 1-100
    uint256 private _deposited;
    bool private _healthy = true;
    address public owner;

    constructor(
        string memory name_,
        address underlying_,
        uint256 apy_,
        uint256 risk_
    ) {
        _name = name_;
        _underlying = underlying_;
        _apy = apy_;
        _risk = risk_;
        owner = msg.sender;
    }

    function protocolName() external view override returns (string memory) {
        return _name;
    }

    function getCurrentAPY() external view override returns (uint256) {
        return _apy;
    }

    function getTotalDeposited() external view override returns (uint256) {
        return _deposited;
    }

    function underlyingToken() external view override returns (address) {
        return _underlying;
    }

    function riskScore() external view override returns (uint256) {
        return _risk;
    }

    function isHealthy() external view override returns (bool) {
        return _healthy;
    }

    function deposit(uint256 amount) external override {
        IERC20(_underlying).safeTransferFrom(msg.sender, address(this), amount);
        _deposited += amount;
    }

    function withdraw(uint256 amount) external override returns (uint256) {
        uint256 toWithdraw = amount > _deposited ? _deposited : amount;
        _deposited -= toWithdraw;
        IERC20(_underlying).safeTransfer(msg.sender, toWithdraw);
        return toWithdraw;
    }

    // --- Test Helpers ---

    function setAPY(uint256 newAPY) external {
        require(msg.sender == owner, "Only owner");
        _apy = newAPY;
    }

    function setRiskScore(uint256 newRisk) external {
        require(msg.sender == owner, "Only owner");
        _risk = newRisk;
    }

    function setHealthy(bool healthy_) external {
        require(msg.sender == owner, "Only owner");
        _healthy = healthy_;
    }
}
