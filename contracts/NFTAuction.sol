// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
// 导包预言机
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {console} from "hardhat/console.sol";

contract NFTAuction is Initializable,IERC721Receiver,OwnableUpgradeable,UUPSUpgradeable,ReentrancyGuardUpgradeable {

    // 拍卖结构体
    struct Auction {
        // 卖方
        address seller;
        // 开始时间
        uint256 startTime;
        // 结束时间
        uint256 endTime;
        // 持续时间
        uint256 duration;
        // 起拍价
        uint256 startPrice;

        // 最高出价者
        address highestBidder;
        // 最高出价
        uint256 highestBid;
        // 是否结束
        bool ended;

        // 参与竞价代币类型
        address payTokenType;
        // NFT-tokenId
        uint256 tokenId;
        // NFT合约地址
        address nftContractAddress;
 
        // 工厂合约地址
        address factoryAddress;
        // 拍卖ID
        uint256 auctionId;
    }

    // 存储拍卖信息结构体
    Auction public auction;

    // 预言机价格喂价映射
    mapping(address => AggregatorV3Interface) public priceFeeds;

    // 初始化函数
    function initialize(
        address _seller,
        uint256 _duration,
        uint256 _startPrice,
        address _payTokenType,
        uint256 _tokenId,  // NFT 图片ID
        address _nftContractAddress,
        address _factoryAddress,
        uint256 _auctionId
    ) external initializer {
        __Ownable_init(msg.sender);  // 注意是两个下划线
        __UUPSUpgradeable_init();    // 注意是两个下划线
        __ReentrancyGuard_init();

        // 校验参数
        require(_seller != address(0), "Invalid seller address");
        require(_nftContractAddress != address(0), "Invalid NFT address"); 
        // require(_factoryAddress != address(0), "Invalid factory address");
        require(_duration > 0, "Duration must be greater than zero");
        
        // 获取NFT合约实例验证是否拥有该NFT
        IERC721 nftContract = IERC721(_nftContractAddress);
        require(nftContract.ownerOf(_tokenId) == _seller, "Seller does not own the NFT");

        // 初始化预言机价格喂价
        _initPriceFeeds();

        // 如果ERC20代币,验证是否支持，
        // priceFeeds[address(0)] 代表ETH, 其他代表ERC20代币
        // require(priceFeeds[_payTokenType] != AggregatorV3Interface(address(0)), "Unsupported pay token type");

        // 初始化拍卖信息
        auction = Auction({
            seller: _seller,
            startTime: block.timestamp,
            endTime: 0,
            duration: _duration,
            startPrice: _startPrice,
            highestBidder: address(0),
            highestBid: 0,
            ended: false,
            payTokenType: _payTokenType,
            tokenId: _tokenId,
            nftContractAddress: _nftContractAddress,
            factoryAddress: _factoryAddress,
            auctionId: _auctionId
        });

        // TODO 发送创建拍卖事件
    }

    // ### 竞价 ###
    function bid(address _payTokenType,uint256 _amount) public payable {
        // 参数校验
        require(block.timestamp < auction.startTime + auction.duration, "Auction has ended");
        // 卖方不能参与竞价!
        require(msg.sender != auction.seller, "Seller cannot bid");

        // 判断代币是ETH还是ERC20
        if (_payTokenType == address(0)) {
            // 竞价转入携带的ETH必须与入参的amount金额一致！
            require(msg.value == _amount, "ETH bid need value equal amount");           // ETH出价
        }else {
            // ERC20 和 ETH 互斥！传ERC20时,需要限制不能携带ETH否则会导致用户额外损失ETH。
            require(msg.value == 0, "ERC20 bid need not send ETH");
            // 用户是否已经授权当前合约，msg.sender（当前竞价用户）允许address(this)（当前合约）使用的额度，使用至少_amount数量的_payToken代币
            require(IERC20(_payTokenType).allowance(msg.sender,address(this))>= _amount,"ERC20 allowance not enough"); // ERC20出价
        }

        // 预言机价格转换USDC对比高低价
        uint256 hightestUSD = _getHightestUSDValue();
        console.log("hightestUSD", hightestUSD);
        
        // 检查价格预言机是否已设置
        AggregatorV3Interface bidFeed = priceFeeds[_payTokenType];
        require(address(bidFeed) != address(0), "Price feed not set for bid token");
        
        uint256 bidUSDValue = _calculateBidUSDValue(_payTokenType, _amount);
        console.log("bidUSDValue", bidUSDValue);
        require(bidUSDValue > hightestUSD, "bid amount need > highestBid");

        // 处理ERC20转账
        if(_payTokenType != address(0)){
            // 把msg.sender账户的金额_amount,转到当前合约中address(this)
            bool transferSuccess = IERC20(_payTokenType).transferFrom(msg.sender,address(this),_amount);
            require(transferSuccess,"ERC20 transfer failed");
        }
        // 如果存在上一个竞价高者,原路径退换金额
        if (auction.highestBidder != address(0) && auction.highestBid > 0) {
            _refund(auction.highestBidder,auction.payTokenType,auction.highestBid);
        }

        // 替换最高价者和最高价
        auction.highestBidder = msg.sender;
        auction.highestBid = _amount;
        auction.payTokenType = _payTokenType;

        // TODO 发送竞价事件

    }

    // ### 结束拍卖 ###
    function endAuction() public virtual{
        // 参数校验
        require(!auction.ended,"auction had ended");
        require(block.timestamp >= auction.startTime + auction.duration,"auction not ended");

        auction.ended = true;
        IERC721 nft = IERC721(auction.nftContractAddress);

        // 判断拍卖最高价是否为空? 执行转NFT
        if (auction.highestBidder != address(0)) {
            console.log("has bidder, transfer nft to bidder:", auction.highestBidder);
            // 转账NFT：token从当前合约地址 转向最高价者地址,tokenid
            nft.safeTransferFrom(address(this),auction.highestBidder,auction.tokenId);
            // 转账交易金额给卖方
            _refund(auction.seller,auction.payTokenType,auction.highestBid);

            // TODO 发生拍卖交易事件
        }else{
            // 无人出价,退还卖家NFT
            console.log("no bidder, return nft to seller:", auction.seller);
            nft.safeTransferFrom(address(this),auction.seller,auction.tokenId);
            // TODO 发生拍卖交易事件
        }

        // TODO 发送结束拍卖事件
    }

    // 通用退款/转账函数,处理ETH和ERC20资金
    function _refund(address to,address _payTokenType,uint256 amount) internal virtual nonReentrant{
        require(to != address(0), "Recipient address not be 0");
        require(amount > 0, "amount must be > 0");

        if(_payTokenType == address(0)){
            // ETH 转账
            console.log("transfer eth to bidder:", to);
            payable(to).transfer(amount);
        }else{
            // ERC20
            console.log("transfer erc20 to bidder:", to);
            bool success = IERC20(_payTokenType).transfer(to,amount);
            require(success, "ERC20 refund failed");
        }
    }

    /**
     * @dev 计算出价的 USD 价值
     * @param _payTokenType 代币地址
     * @param _amount 代币数量
     * @return USD价值（6位小数）
     */
    function _calculateBidUSDValue(
        address _payTokenType,
        uint256 _amount
    ) internal view virtual returns (uint256) {
        AggregatorV3Interface feed = priceFeeds[_payTokenType];
        require(address(feed) != address(0), "Price feed not set for payToken");
        
        try feed.latestRoundData() returns (
            uint80,
            int256 priceRaw,
            uint256,
            uint256,
            uint80
        ) {
            require(priceRaw > 0, "Invalid price from feed");
            uint256 price = uint256(priceRaw);
            uint256 feedDecimal = feed.decimals();
            
            if (address(0) == _payTokenType) {
                return price * _amount / (10**(12 + feedDecimal));  // ETH: 10**(18 + feedDecimal - 6)
            } else {
                return price * _amount / (10**(feedDecimal));  // USDC: 10**(6 + feedDecimal - 6)
            }
        } catch Error(string memory reason) {
            revert(string(abi.encodePacked("Price feed error: ", reason)));
        } catch {
            revert("Price feed call failed");
        }
    }

    /**
     * @dev 计算当前拍卖最高出价的 USD 价值
     * @return USD价值（6位小数）
     */
    function _getHightestUSDValue() internal view virtual returns (uint256) {
        AggregatorV3Interface feed = priceFeeds[auction.payTokenType];
        require(address(feed) != address(0), "Price feed not set for payToken");
        (, int256 priceRaw, , , ) = feed.latestRoundData();
        require(priceRaw > 0, "Invalid price from feed");
        uint256 price = uint256(priceRaw);
        uint256 feedDecimal = feed.decimals();

        // 获取当前最高出价金额（默认为起拍价格）
        uint256 hightestAmount = auction.startPrice;
        if (auction.highestBidder != address(0)) {
            hightestAmount = auction.highestBid;
        }
        
        if (address(0) == auction.payTokenType) {
            return price * hightestAmount / (10**(12 + feedDecimal));  // ETH
        } else {
            return price * hightestAmount / (10**(feedDecimal));  // USDC
        }
    }

    // 查询拍卖Auction信息
    function getAuctionInfo() public view returns (Auction memory) {
        return auction;
    }

    // 查询预言机价格地址
    function getPriceFeed(address tokenAddress) public view returns (address) {
        return address(priceFeeds[tokenAddress]);
    }

    /**
     * @dev 设置代币的价格预言机（仅 owner 可调用）
     * @param tokenAddress 代币地址（address(0) 表示 ETH）
     * @param priceFeedAddress 价格预言机合约地址
     */
    function setPriceFeed(address tokenAddress, address priceFeedAddress) public onlyOwner {
        require(priceFeedAddress != address(0), "Invalid price feed address");
        priceFeeds[tokenAddress] = AggregatorV3Interface(priceFeedAddress);
    }

    // ETH =>  USD 价格 =>  0x694AA1769357215DE4FAC081bf1f309aDC325306
    // USDC => USD 价格 =>  0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E
    // 初始化预言机价格喂价
    function _initPriceFeeds() internal {
        priceFeeds[address(0)] = AggregatorV3Interface(0x694AA1769357215DE4FAC081bf1f309aDC325306);         // ETH/USD
        priceFeeds[0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E] = AggregatorV3Interface(0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E); // USDC/USD
    }


    // ERC721接受回调函数,用于接受NFT转账
    function onERC721Received(address,address,uint256,bytes calldata) external pure override returns(bytes4){
        return this.onERC721Received.selector;
    }

        /**
     * @dev UUPS升级授权函数，允许合约owner或Factory升级
     */
    function _authorizeUpgrade(
        address /* newImplementation */
    ) internal override {
        // 允许 owner 或 Factory 升级
        require(
            msg.sender == owner() || msg.sender == auction.factoryAddress,
            "Not authorized to upgrade"
        );
    }
}