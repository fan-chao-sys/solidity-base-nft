// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockPriceFeed
 * @dev 用于本地测试的模拟 Chainlink 价格预言机
 */
contract MockPriceFeed is AggregatorV3Interface {
    uint8 private _decimals;
    int256 private _price;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 price_) {
        _decimals = decimals_;
        _price = price_;
        _updatedAt = block.timestamp;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external pure override returns (string memory) {
        return "Mock Price Feed";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _price, _updatedAt, _updatedAt, _roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt, 
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, _price, _updatedAt, _updatedAt, 1);
    }

    /**
     * @dev 设置价格（仅用于测试）
     */
    function setPrice(int256 newPrice) external {
        _price = newPrice;
        _updatedAt = block.timestamp;
    }
}

