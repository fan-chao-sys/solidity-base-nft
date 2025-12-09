// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {console} from "hardhat/console.sol";
import "./NFTAuction.sol";

// NFT拍卖工厂合约
contract NFTAuctionFactory is Initializable,OwnableUpgradeable, UUPSUpgradeable {

    // NFT拍卖地址映射
    mapping(uint256 => address) private nftAuctionsMap;
    // NFTAuction实际合约地址
    address public nftAuctionImplementation;
    // 下个拍卖ID
    uint256 public nextAuctionId;


    // 初始化函数    
    function initalize(address _nftAuctionImplementation) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        nextAuctionId = 1;

        require(_nftAuctionImplementation != address(0), "Invalid NFTAuction implementation address");
        nftAuctionImplementation = _nftAuctionImplementation;
    }
    

    // 创建新拍卖合约
    function createNFTAuction(
        uint256 _duration,
        uint256 _startPrice,
        address _payTokenType,
        uint256 _tokenId,            // 用户NFT图片ID
        address _nftContractAddress  // 用户NFT合约地址
    ) external {
        // 参数校验
        require(_duration > 0, "Duration must be greater than zero");
        require(_nftContractAddress != address(0), "Invalid NFT contract address");
        require(_startPrice > 0, "Start price must be greater than zero");
        require(_payTokenType != address(0), "Invalid pay token type address");

        // 检查用户是否拥有NFT且已授权
        IERC721 nftContract = IERC721(_nftContractAddress);
        require(nftContract.ownerOf(_tokenId) == msg.sender, "Caller is not the owner of the NFT");
        require(nftContract.getApproved(_tokenId) == address(this) || nftContract.isApprovedForAll(msg.sender, address(this)), "Factory contract is not approved to transfer the NFT");

        // 创建NFT拍卖合约代理
        uint256 auctionId = nextAuctionId;

        // 1.部署ERC1967代理合约(uups兼容代理),指向实际合约
        ERC1967Proxy proxy = new ERC1967Proxy(
            nftAuctionImplementation,
            ""
        );
        // 2.调用代理合约的初始化函数
        address proxyAddress = address(proxy);
        NFTAuction(payable(proxyAddress)).initialize(
            msg.sender,
            _duration,
            _startPrice,
            _payTokenType,
            _tokenId,
            _nftContractAddress,
            address(this),
            auctionId
        );

        // 存储拍卖合约地址
        nftAuctionsMap[auctionId] = address(proxyAddress);
        nextAuctionId++;

        // 创建拍卖后，将NFT转移到拍卖合约中托管
        nftContract.safeTransferFrom(msg.sender, address(proxyAddress), _tokenId);

        // 打印创建拍卖合约日志
        console.log("Created NFTAuction proxy at address:", address(proxyAddress));

        // TODO 发送创建拍卖事件
    }
    
    // 根据拍卖ID获取拍卖合约代理地址
    function getNFTAuctionAddress(uint256 _auctionId) external view returns (address) {
        return nftAuctionsMap[_auctionId];
    }

    // 获取实际合约地址
    function getNFTAuctionImplementation() external view returns (address) {
        return nftAuctionImplementation;
    }

    /**
     * @dev 获取拍卖总数
     * @return 拍卖总数
     */
    function getAuctionCount() external view returns (uint256) {
        return nextAuctionId - 1;
    }

    /**
     * @dev 获取所有拍卖地址（用于外部批量升级）
     * @return 所有拍卖地址数组
     */
    function getAllAuctionAddresses() external view returns (address[] memory) {
        uint256 count = nextAuctionId - 1;
        address[] memory addresses = new address[](count);
        for (uint256 i = 1; i <= count; i++) {
            addresses[i - 1] = nftAuctionsMap[i];
        }
        return addresses;
    }

    /**
     * @dev 批量升级所有拍卖合约（仅 owner 可调用）
     * @param newImplementation 新的实现合约地址
     */
    function batchUpgradeAuctions(address newImplementation) external onlyOwner {
        require(newImplementation != address(0), "Invalid implementation address");
        
        uint256 count = nextAuctionId - 1;
        for (uint256 i = 1; i <= count; i++) {
            address auctionAddress = nftAuctionsMap[i];
            if (auctionAddress != address(0)) {
                // 通过代理合约调用 upgradeToAndCall（UUPS 升级方法）
                NFTAuction(payable(auctionAddress)).upgradeToAndCall(newImplementation, "");
            }
        }
        
        // 更新工厂中的实现地址
        nftAuctionImplementation = newImplementation;
    }

    /**
     * @dev 更新实现合约地址（仅 owner 可调用）
     * @param _newImplementation 新的实现合约地址
     */
    function setNFTAuctionImplementation(address _newImplementation) external onlyOwner {
        require(_newImplementation != address(0), "Invalid implementation address");
        nftAuctionImplementation = _newImplementation;
    }

     /**
     * @dev 为拍卖合约设置价格预言机（仅 owner 可调用）
     * @param auctionAddress 拍卖合约地址
     * @param tokenAddress 代币地址
     * @param priceFeedAddress 价格预言机地址
     */
    function setAuctionPriceFeed(
        address auctionAddress,
        address tokenAddress,
        address priceFeedAddress
    ) external onlyOwner {
        require(auctionAddress != address(0), "Invalid auction address");
        NFTAuction(payable(auctionAddress)).setPriceFeed(tokenAddress, priceFeedAddress);
    }

    /**
     * @dev UUPS升级授权函数，只有合约owner可以授权升级
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

}