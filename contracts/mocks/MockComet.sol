// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockComet
/// @notice Simulates Compound V3 (Comet) for testing
contract MockComet {
    IERC20 public underlying;
    mapping(address => uint256) public balanceOf;
    uint64 public supplyRatePerSecond;

    constructor(address _underlying) {
        underlying = IERC20(_underlying);
        // Default: ~5% APY
        // 5% / seconds_per_year ≈ 1.585e-9 * 1e18 ≈ 1585489599
        supplyRatePerSecond = 1585489599;
    }

    function setSupplyRate(uint64 rate) external {
        supplyRatePerSecond = rate;
    }

    function supply(address /* asset */, uint256 amount) external {
        underlying.transferFrom(msg.sender, address(this), amount);
        balanceOf[msg.sender] += amount;
    }

    function withdraw(address /* asset */, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        underlying.transfer(msg.sender, amount);
    }

    function getSupplyRate(uint256 /* utilization */) external view returns (uint64) {
        return supplyRatePerSecond;
    }

    function getUtilization() external pure returns (uint256) {
        return 0.8e18; // 80% utilization
    }
}
