// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockPriceFeed
/// @notice Simulates a Chainlink price/yield feed for testing
contract MockPriceFeed {
    int256 public answer;
    uint8 public decimals;
    uint256 public updatedAt;

    constructor(int256 _answer, uint8 _decimals) {
        answer = _answer;
        decimals = _decimals;
        updatedAt = block.timestamp;
    }

    function setAnswer(int256 _answer) external {
        answer = _answer;
        updatedAt = block.timestamp;
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer_,
        uint256 startedAt,
        uint256 updatedAt_,
        uint80 answeredInRound
    ) {
        return (1, answer, block.timestamp, updatedAt, 1);
    }
}
