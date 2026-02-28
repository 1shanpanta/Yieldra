// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockERC20.sol";

/// @title MockTreasuryToken
/// @notice Simulates a tokenized treasury product (like Ondo OUSG) for testing
contract MockTreasuryToken {
    IERC20 public underlying;
    mapping(address => uint256) public balanceOf;

    constructor(address _underlying) {
        underlying = IERC20(_underlying);
    }

    function mint(uint256 usdcAmount) external {
        underlying.transferFrom(msg.sender, address(this), usdcAmount);
        balanceOf[msg.sender] += usdcAmount; // 1:1 for simplicity
    }

    function redeem(uint256 tokenAmount) external {
        require(balanceOf[msg.sender] >= tokenAmount, "Insufficient balance");
        balanceOf[msg.sender] -= tokenAmount;
        underlying.transfer(msg.sender, tokenAmount);
    }
}
