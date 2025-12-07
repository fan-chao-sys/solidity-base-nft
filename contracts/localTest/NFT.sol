// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// 简单的NFT合约,方便部署直接铸造NFT用
contract NFT is ERC721,Ownable {
    // 最大NFT数量
    uint256 constant MAX_TOKEN = 1000;

    // 存储NFT的tokenId对应 的URI
    mapping (uint256 => string) _nftTokenURIs;

    constructor() ERC721("MyNFT","MNFT") Ownable(msg.sender){}

    // 重写tokenURI方法,返回对应tokenId的URI
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId > 0, "ERC721Metadata: URI query for nonexistent token");
        return _nftTokenURIs[tokenId];
    }

    // 铸造NFT 仅限合约拥有者调用
    function mint(address to,uint256 tokenId,string memory _tokenURI) external onlyOwner returns (bool) {
        require(to != address(0), "ERC721: mint to the zero address");
        require(tokenId > 0 && tokenId < MAX_TOKEN, "ERC721: tokenId must be greater than zero");
        require(bytes(_tokenURI).length > 0, "ERC721Metadata: URI must be set");

        _safeMint(to, tokenId);
        _nftTokenURIs[tokenId] = _tokenURI;
        return true;
    }
    
}