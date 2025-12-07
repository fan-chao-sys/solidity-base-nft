// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// 简单的USDC合约,方便部署直接铸造USDC用
contract USDC is ERC20,Ownable {

    constructor() ERC20("USD Coin", "USDC") Ownable(msg.sender){
        // 初始铸造100万USDC给合约拥有者
        _mint(msg.sender, 1000000 * (10 ** uint256(decimals())));
    }

    // 铸造USDC 仅限合约拥有者调用
    function mint(address to, uint256 amount) external onlyOwner returns (bool) {
        _mint(to, amount);
        return true;
    }

    // USDC燃烧 仅限合约拥有者调用
    function burn(address from, uint256 amount) external onlyOwner returns (bool) {
        _burn(from, amount);
        return true;
    }

    // 重写decimals方法,USDC小数位为6
    function decimals() public pure override returns (uint8) {
        return 6;
    }

}

