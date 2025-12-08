// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8;

import "./NFTAuction.sol";

contract NFTAuctionV2 is NFTAuction{
    /// @dev 升级后的初始化钩子，补充父类初始化验证，保持 owner 不变
    /// @custom:oz-upgrades-validate-as-initializer
    function initializeV2() public reinitializer(2) {
        address currentOwner = owner();
        __Ownable_init(currentOwner);
        _transferOwnership(currentOwner);
        __ReentrancyGuard_init();
    }

    /**
     * @dev 测试函数，用于验证升级是否成功
     * @return 返回版本标识字符串
     */
    function getVersion() public pure returns (string memory) {
        return "SimpleAuction V2.0";
    }

}