// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../mocks/MockERC20.sol";

/// @title MockAavePool
/// @notice Simulates Aave V3 Pool for testing
contract MockAavePool {
    IERC20 public underlying;
    MockERC20 public aToken;
    uint128 public currentLiquidityRate; // RAY (1e27)

    constructor(address _underlying, address _aToken) {
        underlying = IERC20(_underlying);
        aToken = MockERC20(_aToken);
        // Default: 4.5% APY = 0.045 * 1e27
        currentLiquidityRate = 45000000000000000000000000; // 4.5% in RAY
    }

    function setLiquidityRate(uint128 rate) external {
        currentLiquidityRate = rate;
    }

    function supply(address /* asset */, uint256 amount, address onBehalfOf, uint16 /* referralCode */) external {
        underlying.transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }

    function withdraw(address /* asset */, uint256 amount, address to) external returns (uint256) {
        aToken.burn(msg.sender, amount);
        underlying.transfer(to, amount);
        return amount;
    }

    function getReserveData(address /* asset */) external view returns (
        uint256, uint128, uint128, uint128, uint128, uint128,
        uint40, uint16, address, address, address, address,
        uint128, uint128, uint128
    ) {
        return (
            0,                          // configuration
            0,                          // liquidityIndex
            currentLiquidityRate,       // currentLiquidityRate
            0,                          // variableBorrowIndex
            0,                          // currentVariableBorrowRate
            0,                          // currentStableBorrowRate
            uint40(block.timestamp),    // lastUpdateTimestamp
            0,                          // id
            address(aToken),            // aTokenAddress
            address(0),                 // stableDebtTokenAddress
            address(0),                 // variableDebtTokenAddress
            address(0),                 // interestRateStrategyAddress
            0,                          // accruedToTreasury
            0,                          // unbacked
            0                           // isolationModeTotalDebt
        );
    }
}
