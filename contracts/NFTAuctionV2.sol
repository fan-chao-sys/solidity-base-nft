// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8;

import "./NFTAuction.sol";

contract NFTAuctionV2 is NFTAuction{

    /**
     * @dev 测试函数，用于验证升级是否成功
     * @return 返回版本标识字符串
     */
    function getVersion() public pure returns (string memory) {
        return "SimpleAuction V2.0";
    }

}