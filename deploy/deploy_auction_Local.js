// deploy/deploy_auction.js
// 引入 Hardhat 的 ethers、upgrades 和 deployments 模块
const { ethers, upgrades, deployments } = require("hardhat");

// 引入 Node.js 的文件系统模块，用于读写文件
const fs = require("fs");
// 引入 Node.js 的路径模块，用于处理文件路径
const path = require("path");

// 导出 Hardhat Deploy 要求的异步函数
// hre 是 Hardhat Runtime Environment 的缩写，包含所有 Hardhat 的功能
module.exports = async function (hre) {
    // 从 hre 中解构获取需要的模块和函数
    const { getNamedAccounts, deployments, ethers, upgrades } = hre;
    // 从 deployments 中解构 deploy 函数，用于部署合约
    const { deploy } = deployments;
    // 获取命名账户（在 hardhat.config.js 中配置的账户）
    const { deployer, alice, bob,carol } = await getNamedAccounts();
    
    // 打印部署开始信息和账户地址
    console.log("=== 开始部署合约 ===");
    console.log("deployer:", deployer);
    console.log("alice:", alice);
    console.log("bob:", bob);
    console.log("carol:",carol);

    // 使用 try-catch 捕获部署过程中的错误
    try {
        // 打印部署 NFT 和 USDC 的提示信息
        console.log("\n 部署NFT 和 USDC ~");
        
        // 部署 NFT 合约
        // deploy 函数是 hardhat-deploy 提供的，用于部署合约
        const nftDeployment = await deploy("NFT", {
            from: deployer,      // 指定部署者地址
            args: [],           // 构造函数参数（NFT 合约无参数）
            log: true,          // 启用日志输出
            skipIfAlreadyDeployed: false,  // 如果已部署则跳过（但会检查网络）
            force: true,         // 强制重新部署（忽略之前的部署记录）
        });
        // 获取部署后的 NFT 合约地址
        const nftDeployAddress = nftDeployment.address;
        console.log("NFT deployed:", nftDeployAddress);

        // 部署 USDC 合约
        const usdcDeployment = await deploy("USDC", {
            from: deployer,      // 指定部署者地址
            args: [],           // 构造函数参数（USDC 合约无参数）
            log: true,          // 启用日志输出
            skipIfAlreadyDeployed: false,  // 如果已部署则跳过（但会检查网络）
            force: true,         // 强制重新部署（忽略之前的部署记录）
        });
        // 获取部署后的 USDC 合约地址
        const usdcDeployAddress = usdcDeployment.address;
        console.log("USDC deployed:", usdcDeployAddress);

        // 获取合约实例，用于后续调用合约方法
        // getContractAt 用于在已部署的地址上获取合约实例
        const nftContractAddress = await ethers.getContractAt("NFT", nftDeployAddress);
        const usdcContractAddress = await ethers.getContractAt("USDC", usdcDeployAddress);

        // 定义要铸造的 NFT Token ID
        const tokenId = 5;
        
        // 获取部署者的签名者对象（Signer）
        // getSigner 返回一个 Signer 对象，用于发送交易
        const deployerSigner = await ethers.getSigner(deployer);
        
        // 使用部署者签名者连接 NFT 合约并调用 mint 方法
        // connect 方法将合约实例连接到指定的签名者
        const mintNFTTx = await nftContractAddress.connect(deployerSigner).mint(alice, tokenId, "ipfs://demo-uri");
        // 等待交易被确认
        await mintNFTTx.wait();
        console.log(`Minted NFT #${tokenId} to Alice`);

        // 铸造 USDC 给 Bob
        // parseUnits 将字符串转换为 BigNumber，第二个参数是小数位数（USDC 是 6 位小数）
        const mintAmount = ethers.parseUnits("1000", 6);
        // 调用 USDC 合约的 mint 方法
        const mintUSDCTx = await usdcContractAddress.connect(deployerSigner).mint(bob, mintAmount);
        // 等待交易被确认
        await mintUSDCTx.wait();
        console.log("Minted 1000 USDC to Bob");


        // 定义 NFTAuction 合约的初始化参数
        const sellerAddress = alice; // 卖家是 Alice
        const duration = 7 * 24 * 60 * 60; // 拍卖持续时间：7天（转换为秒）
        const startPrice = ethers.parseUnits("1", 6); // 起始价格：1 USDC（6位小数）
        const payTokenType = usdcDeployAddress; // 支付代币类型：USDC 合约地址
        const auctionId = 1; // 拍卖 ID：第一个拍卖

        // 部署 NFTAuction 实现合约（使用 UUPS 可升级代理模式）
        console.log("\n--- 部署 NFTAuction 实现合约 ---");
        // getContractFactory 的第二个参数应该是 Signer 对象，而不是地址字符串
        // 修复：使用 deployerSigner 或者不传第二个参数（使用默认 signer）
        // 或者使用：await ethers.getSigner(deployer)
        const NFTAuction = await ethers.getContractFactory("NFTAuction", deployerSigner);
        // 使用 OpenZeppelin Upgrades 插件部署可升级代理合约
        // deployProxy 会部署实现合约和代理合约
        const auctionProxy = await upgrades.deployProxy(NFTAuction, [
            sellerAddress,       // address _seller - 卖家地址
            duration,            // uint256 _duration - 拍卖持续时间（秒）
            startPrice,          // uint256 _startPrice - 起始价格
            payTokenType,        // address _payTokenType - 支付代币合约地址
            tokenId,             // uint256 _tokenId -  NFT Token ID
            nftDeployAddress,    // address _nftContractAddress - NFT 合约地址
            ethers.ZeroAddress,  // address _factoryAddress - 工厂合约地址（暂时用零地址）
            auctionId            // uint256 _auctionId - 拍卖 ID
        ], {
            initializer: "initialize",  // 指定初始化函数名
            kind: "uups"                // 指定代理类型为 UUPS（Universal Upgradeable Proxy Standard）
        });
        // 等待代理合约部署完成
        await auctionProxy.waitForDeployment();
        // 获取代理合约地址
        const proxyAddress = await auctionProxy.getAddress();
        // 获取实现合约地址（通过 ERC1967 标准获取）
        const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
        console.log("拍卖代理合约地址：", proxyAddress);
        console.log("拍卖实现合约地址：", implAddress);
        // 保存实现合约地址，用于后续部署 Factory 合约
        const auctionImplAddress = implAddress;
        // 保存代理合约地址，用于后续升级
        const auctionProxyAddress = proxyAddress;

        // 部署模拟价格预言机（用于本地测试）
        console.log("\n--- 部署模拟价格预言机 ---");
        const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed", deployerSigner);
        
        // USDC/USD 价格：1 USDC = 1 USD，价格预言机使用 8 位小数，所以是 1 * 10^8
        const usdcPriceFeed = await MockPriceFeed.deploy(8, ethers.parseUnits("1", 8));
        await usdcPriceFeed.waitForDeployment();
        const usdcPriceFeedAddress = await usdcPriceFeed.getAddress();
        console.log("USDC 价格预言机地址：", usdcPriceFeedAddress);
        
        // ETH/USD 价格：假设 1 ETH = 3000 USD，价格预言机使用 8 位小数，所以是 3000 * 10^8
        const ethPriceFeed = await MockPriceFeed.deploy(8, ethers.parseUnits("3000", 8));
        await ethPriceFeed.waitForDeployment();
        const ethPriceFeedAddress = await ethPriceFeed.getAddress();
        console.log("ETH 价格预言机地址：", ethPriceFeedAddress);

        // 为拍卖合约设置价格预言机
        console.log("\n--- 设置价格预言机 ---");
        const auctionContract = await ethers.getContractAt("NFTAuction", proxyAddress);
        
        // 设置 ETH 价格预言机（address(0) 代表 ETH）
        const setEthPriceFeedTx = await auctionContract.connect(deployerSigner).setPriceFeed(
            ethers.ZeroAddress,
            ethPriceFeedAddress
        );
        await setEthPriceFeedTx.wait();
        console.log("✓ ETH 价格预言机设置成功");
        
        // 设置 USDC 价格预言机
        const setUsdcPriceFeedTx = await auctionContract.connect(deployerSigner).setPriceFeed(
            usdcDeployAddress,
            usdcPriceFeedAddress
        );
        await setUsdcPriceFeedTx.wait();
        console.log("✓ USDC 价格预言机设置成功");

        // 部署 NFTAuctionFactory 合约（使用可升级代理模式）
        console.log("\n部署 NFTAuctionFactory 合约");
        // 获取 NFTAuctionFactory 合约工厂
        const NFTAuctionFactory = await ethers.getContractFactory("NFTAuctionFactory", deployerSigner);
        // 使用 OpenZeppelin Upgrades 插件部署可升级代理合约
        // 注意：NFTAuctionFactory 的初始化函数名是 "initalize"（注意拼写）
        const factoryProxy = await upgrades.deployProxy(NFTAuctionFactory, [
            auctionImplAddress,    // address _nftAuctionImplementation - 拍卖实现合约地址
        ], {
            initializer: "initalize",  // 注意：合约中的函数名是 "initalize"（拼写错误，但需要匹配）
            kind: "uups"              // 指定代理类型为 UUPS
        });
        // 等待代理合约部署完成
        await factoryProxy.waitForDeployment();
        // 获取工厂代理合约地址
        const factoryAddress = await factoryProxy.getAddress();
        console.log("auctionFactory address:", factoryAddress);

        // 构建部署信息对象，用于保存到文件
        const deploymentInfo = {
            network: "hardhat",                 // 网络名称
            nft: {
                address: nftDeployAddress,      // NFT 合约地址
                tokenId: tokenId,              // NFT Token ID
                aliceAddress: alice,           // Alice 的地址
            },
            usdc: {
                address: usdcDeployAddress,     // USDC 合约地址
                bobAddress: bob,               // Bob 的地址
            },
            auction: {
                implementation: auctionImplAddress,  // 拍卖实现合约地址
                proxyAddress: auctionProxyAddress,    // 拍卖代理合约地址（用于升级）
            },
            auctionFactory: {
                address: factoryAddress,       // 工厂合约地址
            },
            priceFeed: {
                eth: ethPriceFeedAddress,      // ETH 价格预言机地址
                usdc: usdcPriceFeedAddress,    // USDC 价格预言机地址
            },
            accounts: {
                deployer: deployer,            // 部署者地址
                alice: alice,                 // Alice 地址
                bob: bob,                     // Bob 地址
                carol: carol,                  // carol 地址
            },
        };

        // 保存部署信息到本地文件
        // resolve 将相对路径解析为绝对路径
        const storePath = path.resolve(__dirname, "./.cache/NFTAuction_deployment.json");
        // dirname 获取文件所在目录路径
        const dir = path.dirname(storePath);
        // 如果目录不存在，则创建目录（recursive: true 表示递归创建）
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // 将部署信息对象转换为 JSON 字符串并写入文件
        // JSON.stringify 的第三个参数是缩进空格数，用于格式化输出
        fs.writeFileSync(storePath, JSON.stringify(deploymentInfo, null, 2));
        console.log("\n=== 部署信息已保存到:", storePath, "===");
        
        // 打印部署完成信息和所有合约地址汇总
        console.log("\n部署完成！");
        console.log("\n合约地址汇总：");
        console.log("NFT地址:", nftDeployAddress);
        console.log("USDC地址:", usdcDeployAddress);
        console.log("NFTAuction地址:", auctionImplAddress);
        console.log("NFTAuctionFactory地址:", factoryAddress);

    } catch (error) {
        // 捕获并打印部署过程中的错误
        console.error("部署过程中出错:", error);
        // 重新抛出错误，以便 Hardhat 能够正确处理
        throw error;
    }
}

// 导出标签，用于 hardhat-deploy 的标签过滤
// 可以通过标签来选择性执行部署脚本
module.exports.tags = ["auction", "all"];