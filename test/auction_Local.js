// 本地执行测试脚本初始化
// 引入 Hardhat 的 ethers、upgrades 和 deployments 模块，用于与区块链交互和部署可升级合约
const { ethers, upgrades, deployments } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 定义主测试函数，使用 async 因为需要等待异步操作
async function main(){
    console.log("=== 使用 deployments.fixture 自动部署和测试 ===\n");
    
    // 🔑 关键：使用 deployments.fixture 自动执行部署
    // 这会确保部署和测试在同一个节点会话中完成
    await deployments.fixture(["auction"]); // 使用部署脚本的标签 "auction"
    console.log("✅ 部署完成（或已存在）\n");
    
    // 🔄 可选：执行升级（通过环境变量 UPGRADE 或命令行参数 --upgrade 控制）
    const shouldUpgrade = process.env.UPGRADE === "true" || process.argv.includes("--upgrade");
    if (shouldUpgrade) {
        console.log("🔄 执行升级 fixture（如果未升级则自动升级）...\n");
        await deployments.fixture(["upgrade"]); // 使用升级脚本的标签 "upgrade"
        console.log("✅ 升级完成（或已存在）\n");
    } else {
        console.log("ℹ️  跳过升级（使用 --upgrade 参数或设置 UPGRADE=true 环境变量可启用升级）\n");
    }
    
    // 从 deployments 获取已部署的合约地址（NFT 和 USDC 使用 deploy() 部署，会自动保存）
    const nftDeployment = await deployments.get("NFT");
    const usdcDeployment = await deployments.get("USDC");
    console.log("从 deployments 获取的合约地址:");
    console.log("NFT 地址:", nftDeployment.address);
    console.log("USDC 地址:", usdcDeployment.address);
    
    // 读取部署信息文件以获取代理合约地址
    const storePath = path.resolve(__dirname, "../deploy/.cache/NFTAuction_deployment.json");
    let deployInfo = null;
    if (fs.existsSync(storePath)) {
        deployInfo = JSON.parse(fs.readFileSync(storePath, "utf8"));
        console.log("\n从部署信息文件读取代理合约地址:");
        console.log("NFTAuction 实现地址:", deployInfo.auction?.implementation);
        console.log("NFTAuction 代理地址:", deployInfo.auction?.proxyAddress);
        console.log("NFTAuctionFactory 地址:", deployInfo.auctionFactory?.address);
        console.log("价格预言机 ETH:", deployInfo.priceFeed?.eth);
        console.log("价格预言机 USDC:", deployInfo.priceFeed?.usdc);
    } else {
        console.log("\n⚠️  警告：部署信息文件不存在");
    }

    // 获取账户信息
    const [deployer, alice, bob, carol] = await ethers.getSigners();
    console.log("\n=== 测试账户 ===");
    console.log("deployer:", deployer.address);
    console.log("账户Alice:", alice.address);
    console.log("账户Bob:", bob.address);
    console.log("账户Carol:", carol.address);
    // 如果部署信息文件存在，验证账户地址是否匹配
    if (deployInfo && deployInfo.accounts) {
        if(deployer.address.toLowerCase() !== deployInfo.accounts.deployer.toLowerCase()){
            console.warn("⚠️  警告：部署者账户地址不匹配（可能使用了不同的账户顺序）");
        }
        if(alice.address.toLowerCase() !== deployInfo.accounts.alice.toLowerCase()){
            console.warn("⚠️  警告：账户Alice地址不匹配");
        }
        if(bob.address.toLowerCase() !== deployInfo.accounts.bob.toLowerCase()){
            console.warn("⚠️  警告：账户Bob地址不匹配");
        }
    }

    // 获取合约实例
    const nft = await ethers.getContractAt("NFT", nftDeployment.address);
    const usdc = await ethers.getContractAt("USDC", usdcDeployment.address);
    
    // 获取 NFTAuctionFactory 合约实例（从部署信息文件读取）
    if (!deployInfo || !deployInfo.auctionFactory?.address) {
        throw new Error("无法获取 NFTAuctionFactory 地址，请检查部署信息文件");
    }
    const nftAuctionFactory = await ethers.getContractAt("NFTAuctionFactory", deployInfo.auctionFactory.address);

    // 获取 tokenId
    const tokenId = deployInfo?.nft?.tokenId || 5;
    console.log(`\n=== 使用 NFT TokenId: ${tokenId} ===`);
    
    // Alice 授权 NFT 给工厂托管
    console.log("\n--- Step 1: Alice 授权 NFT 给工厂 ---");
    // 查看这个 tokenId 对应的 NFT，当前被授权给了哪个地址
    let approvedAddress = await nft.getApproved(tokenId);
    // 如果被授权给了其他地址，则取消授权,否则直接授权给工厂
    if(approvedAddress && approvedAddress !== ethers.ZeroAddress && approvedAddress.toLowerCase() !== nftAuctionFactory.address.toLowerCase()){
        console.log(`当前NFT ${tokenId} 被授权给了 ${approvedAddress}`);
        console.log("取消授权...");
        await nft.approve(ethers.ZeroAddress, tokenId);
    }
    console.log("授权NFT给工厂...");
    
    // 使用 Alice 账户连接 NFT 合约，并调用 approve 方法授权给工厂地址
    await nft.connect(alice).approve(nftAuctionFactory.target || nftAuctionFactory.address, tokenId);
    console.log("授权成功");

    // Alice 调用工厂创建拍卖
    console.log("\n--- Step 2: Alice 调用工厂创建拍卖 ---");
    console.log("创建拍卖...");
    const duration = 5 * 60; // 5分钟（5 * 60 秒）
    const startPrice = ethers.parseUnits("1", 6); // 1 USDC
    // 使用 Alice 账户连接工厂合约，调用 createNFTAuction 创建新拍卖
    // 注意：合约要求 _payTokenType 不能为零地址，所以传入 USDC 地址
    const txCreate = await nftAuctionFactory.connect(alice).createNFTAuction(
        duration,                  // 持续时间
        startPrice,                // 起拍价
        usdcDeployment.address,    // 支付代币类型（USDC地址）
        tokenId,                   // Token ID
        nftDeployment.address,     // NFT 合约地址
    );
    // 等待交易被确认
    const receipt = await txCreate.wait();
    // 通过拍卖 ID（1）获取创建的拍卖合约地址
    const auctionAddr = await nftAuctionFactory.getNFTAuctionAddress(1);
    console.log("Auction address:", auctionAddr);
    console.log("拍卖创建成功");

    // 获取拍卖合约实例（传入合约名和地址）
    const auction = await ethers.getContractAt("NFTAuction", auctionAddr);

    // 为新创建的拍卖合约设置价格预言机
    console.log("\n--- 设置拍卖合约的价格预言机 ---");
    
    // 检查部署信息
    if (!deployInfo || !deployInfo.priceFeed) {
        console.error("✗ 错误：部署信息中未找到价格预言机配置！");
        throw new Error("价格预言机地址未配置，请确保部署脚本正确执行并保存了部署信息");
    }
    
    console.log("部署信息中的价格预言机配置:", JSON.stringify(deployInfo.priceFeed, null, 2));
    
    // 使用当前会话的 deployer（deployments.fixture 确保账户一致）
    const deployerSigner = deployer;
    console.log("使用部署者账户:", deployerSigner.address);
    console.log("Factory 合约地址:", nftAuctionFactory.target || nftAuctionFactory.address);
    console.log("拍卖合约地址:", auctionAddr);
    
    // 设置 ETH 价格预言机（address(0) 代表 ETH）
    if (!deployInfo.priceFeed.eth) {
        console.error("✗ 错误：部署信息中未找到 ETH 价格预言机地址！");
        throw new Error("ETH 价格预言机地址未配置");
    }
    
    console.log("\n[1/2] 设置 ETH 价格预言机...");
    console.log("  ETH 价格预言机地址:", deployInfo.priceFeed.eth);
    console.log("  代币地址 (address(0) 代表 ETH):", ethers.ZeroAddress);
    
    try {
        // 检查设置前的状态
        const ethPriceFeedBefore = await auction.getPriceFeed(ethers.ZeroAddress);
        console.log("  设置前的 ETH 价格预言机地址:", ethPriceFeedBefore);
        
        const setEthPriceFeedTx = await nftAuctionFactory.connect(deployerSigner).setAuctionPriceFeed(
            auctionAddr,
            ethers.ZeroAddress,  // address(0) 代表 ETH
            deployInfo.priceFeed.eth
        );
        console.log("  交易哈希:", setEthPriceFeedTx.hash);
        await setEthPriceFeedTx.wait();
        console.log("  交易已确认");
        
        // 验证设置后的状态
        const ethPriceFeedAfter = await auction.getPriceFeed(ethers.ZeroAddress);
        console.log("  设置后的 ETH 价格预言机地址:", ethPriceFeedAfter);
        
        if (ethPriceFeedAfter.toLowerCase() === deployInfo.priceFeed.eth.toLowerCase()) {
            console.log("✓ ETH 价格预言机设置成功");
        } else {
            console.error("✗ ETH 价格预言机设置失败！");
            console.error("  期望:", deployInfo.priceFeed.eth);
            console.error("  实际:", ethPriceFeedAfter);
            throw new Error(`ETH 价格预言机设置失败: 期望 ${deployInfo.priceFeed.eth}, 实际 ${ethPriceFeedAfter}`);
        }
    } catch (error) {
        console.error("✗ 设置 ETH 价格预言机时出错:", error.message);
        if (error.stack) {
            console.error("错误堆栈:", error.stack);
        }
        throw error;
    }
    
    // 设置 USDC 价格预言机
    if (!deployInfo.priceFeed.usdc) {
        console.error("✗ 错误：部署信息中未找到 USDC 价格预言机地址！");
        throw new Error("USDC 价格预言机地址未配置");
    }
    
    console.log("\n[2/2] 设置 USDC 价格预言机...");
    console.log("  USDC 价格预言机地址:", deployInfo.priceFeed.usdc);
    console.log("  USDC 代币地址:", usdcDeployment.address);
    
    try {
        // 检查设置前的状态
        const usdcPriceFeedBefore = await auction.getPriceFeed(usdcDeployment.address);
        console.log("  设置前的 USDC 价格预言机地址:", usdcPriceFeedBefore);
        
        const setUsdcPriceFeedTx = await nftAuctionFactory.connect(deployerSigner).setAuctionPriceFeed(
            auctionAddr,
            usdcDeployment.address,
            deployInfo.priceFeed.usdc
        );
        console.log("  交易哈希:", setUsdcPriceFeedTx.hash);
        await setUsdcPriceFeedTx.wait();
        console.log("  交易已确认");
        
        // 验证设置后的状态
        const usdcPriceFeedAfter = await auction.getPriceFeed(usdcDeployment.address);
        console.log("  设置后的 USDC 价格预言机地址:", usdcPriceFeedAfter);
        
        if (usdcPriceFeedAfter.toLowerCase() === deployInfo.priceFeed.usdc.toLowerCase()) {
            console.log("✓ USDC 价格预言机设置成功");
        } else {
            console.error("✗ USDC 价格预言机设置失败！");
            console.error("  期望:", deployInfo.priceFeed.usdc);
            console.error("  实际:", usdcPriceFeedAfter);
            throw new Error(`USDC 价格预言机设置失败: 期望 ${deployInfo.priceFeed.usdc}, 实际 ${usdcPriceFeedAfter}`);
        }
    } catch (error) {
        console.error("✗ 设置 USDC 价格预言机时出错:", error.message);
        if (error.stack) {
            console.error("错误堆栈:", error.stack);
        }
        throw error;
    }
    
    console.log("\n✓ 所有价格预言机设置完成");
    // 调用拍卖合约的 getAuctionInfo 方法，获取拍卖信息
    const auctionInfo = await auction.getAuctionInfo();
    console.log("拍卖信息: Auction info:", {
        seller: auctionInfo.seller,                                    // 卖家地址
        tokenId: auctionInfo.tokenId.toString(),                       // Token ID（转换为字符串）
        startPrice: auctionInfo.startPrice.toString(),                 // 起拍价（转换为字符串）
        duration: auctionInfo.duration.toString(),                     // 持续时间（转换为字符串）
        ended: auctionInfo.ended,                                       // 是否结束
      });

    // Bob 竞价 USDC 出价 10 USDC
    console.log("\n--- Step 3: Bob 竞价 USDC 出价 10 USDC ---");
    // 查询 Bob 的 USDC 余额
    const bobBalanceAmount = await usdc.balanceOf(bob.address);
    // 打印 Bob 竞价前的 USDC 余额（格式化为6位小数）
    console.log("Bob USDC balance before:", ethers.formatUnits(bobBalanceAmount, 6));

    // Bob 授权 USDC 给拍卖合约
    // 使用 Bob 账户连接 USDC 合约，授权拍卖合约可以使用 10 USDC
    await usdc.connect(bob).approve(auctionAddr, ethers.parseUnits("10", 6));
    // Bob 竞价 USDC 出价 10 USDC
    // 使用 Bob 账户连接拍卖合约，调用 bid 方法，使用 USDC 出价 10 USDC
    await auction.connect(bob).bid(usdcDeployment.address, ethers.parseUnits("10", 6));
    // 打印 Bob 出价成功信息
    console.log("Bob placed 10 USDC bid");

    // 获取bob竞价后，合约存储的竞价账户信息
    // 再次获取拍卖信息，查看竞价后的状态
    const auctionInfoAfterBob = await auction.getAuctionInfo();
    // 打印最高出价者地址
    console.log("Highest bidder:", auctionInfoAfterBob.highestBidder); // 竞价者
    // 打印最高出价金额（格式化为6位小数，单位 USDC）
    console.log("Highest bid:", ethers.formatUnits(auctionInfoAfterBob.highestBid, 6), "USDC"); // 最高价

    // Carol 竞价 ETH 出价 0.01 ETH
    console.log("\n--- Step 4: Carol 用 ETH 出价 0.01 ETH ---");
    
    // 验证 ETH 价格预言机是否已设置
    console.log("验证价格预言机设置状态...");
    const ethPriceFeedCheck = await auction.getPriceFeed(ethers.ZeroAddress);
    console.log("  ETH 价格预言机地址:", ethPriceFeedCheck);
    const usdcPriceFeedCheck = await auction.getPriceFeed(usdcDeployment.address);
    console.log("  USDC 价格预言机地址:", usdcPriceFeedCheck);
    
    if (ethPriceFeedCheck === ethers.ZeroAddress) {
        console.error("✗ 错误：ETH 价格预言机未设置！");
        console.error("  当前 ETH 价格预言机地址:", ethPriceFeedCheck);
        console.error("  期望的 ETH 价格预言机地址:", deployInfo.priceFeed.eth);
        throw new Error("ETH 价格预言机未设置");
    }
    
    if (usdcPriceFeedCheck === ethers.ZeroAddress) {
        console.error("✗ 错误：USDC 价格预言机未设置！");
        throw new Error("USDC 价格预言机未设置");
    }
    
    console.log("✓ 价格预言机验证通过");
    
    // 查询 Carol 的 ETH 余额
    const carolBalanceBefore = await ethers.provider.getBalance(carol.address);
    // 打印 Carol 竞价前的 ETH 余额（格式化为以太单位）
    console.log("Carol ETH balance before:", ethers.formatEther(carolBalanceBefore));

    // 使用 Carol 账户连接拍卖合约，调用竞价方法
    await auction.connect(carol).bid(ethers.ZeroAddress,ethers.parseEther("0.01"),{
        value: ethers.parseEther("0.01"),  // 发送 0.01 ETH 作为交易值
    });
    // 获取 Carol 竞价后的拍卖信息
    const auctionInfoAfterCarol = await auction.getAuctionInfo();
    // 打印最高出价者（应该是 Carol）
    console.log("Highest bidder:", auctionInfoAfterCarol.highestBidder);
    // 打印最高出价金额（格式化为以太单位）
    console.log("Highest bid:", ethers.formatEther(auctionInfoAfterCarol.highestBid), "ETH");

    // 验证 bob 的 USDC 是否被退回？
    // 查询 Bob 竞价后的 USDC 余额
    const bobBalanceAfter = await usdc.balanceOf(bob.address);
    // 打印 Bob 竞价后的 USDC 余额（应该被退回，与竞价前相同）
    console.log("Bob USDC balance after (should be refunded):", ethers.formatUnits(bobBalanceAfter, 6));
    // 比较余额是否与竞价前相同（如果相同说明已退回）
    if (bobBalanceAfter.toString() === bobBalanceAmount.toString()) {
        console.log("✓ Bob's USDC has been refunded");
    }

    // 时间快进,结束拍卖
    console.log("\n--- Step 5: 结束拍卖 ---");
    // 增加区块链时间（增加 duration + 1 秒，使拍卖时间到期）
    await ethers.provider.send("evm_increaseTime", [duration + 1]);
    // 挖一个新区块，使时间变化生效
    await ethers.provider.send("evm_mine");
    // 调用拍卖合约的 endAuction 方法，结束拍卖
    await auction.endAuction();
    console.log("Auction ended");

    // 验证最终状态
    console.log("\n--- Step 6: 验证最终状态 ---");
    // 获取拍卖结束后的最终信息
    const finalAuctionInfo = await auction.getAuctionInfo();
    // 打印最终拍卖信息对象
    console.log("Final auction info:", {
        ended: finalAuctionInfo.ended,                                    // 是否已结束（应该是 true）
        highestBidder: finalAuctionInfo.highestBidder,                   // 最高出价者（应该是 Carol）
        highestBid: ethers.formatEther(finalAuctionInfo.highestBid),     // 最高出价（格式化为以太单位）
    });

    // 查询 NFT 的所有者（拍卖结束后应该转移给最高出价者）
    const nftOwner = await nft.ownerOf(tokenId);
    // 打印 NFT 当前所有者
    console.log("NFT owner after auction:", nftOwner);
    // 打印期望的所有者（应该是 Carol）
    console.log("Expected owner (Carol):", carol.address);
    // 比较 NFT 所有者是否与 Carol 地址相同
    if (nftOwner.toLowerCase() === carol.address.toLowerCase()) {
        // 如果相同，打印确认信息
        console.log("✓ NFT successfully transferred to Carol");
    }

    // 查询 Alice 的 ETH 余额（应该收到拍卖金额）
    const aliceBalance = await ethers.provider.getBalance(alice.address);
    // 打印 Alice 的 ETH 余额（格式化为以太单位）
    console.log("Alice ETH balance:", ethers.formatEther(aliceBalance));
    

    // 验证合约升级
    console.log("\n--- Step 7: 验证合约升级 ---");
    console.log("验证拍卖代理地址：", auctionAddr);

    // 验证工厂记录的实现地址
    const factoryImplAddress = await nftAuctionFactory.getNFTAuctionImplementation();
    console.log("工厂中的实现合约地址：", factoryImplAddress);

    if (deployInfo && deployInfo.auction && deployInfo.auction.implementation) {
        console.log("部署信息中的实现合约地址：", deployInfo.auction.implementation);
        if (factoryImplAddress.toLowerCase() === deployInfo.auction.implementation.toLowerCase()) {
            console.log("✓ 工厂实现合约地址与部署信息一致");
        } else {
            console.log("⚠️ 工厂实现合约地址与部署信息不一致");
        }
    }

    // 读取当前拍卖代理的实现地址
    const auctionImplAddress = await upgrades.erc1967.getImplementationAddress(auctionAddr);
    console.log("拍卖代理指向的实现地址：", auctionImplAddress);

    // 升级后验证版本；未开启升级则仅输出提示
    if (shouldUpgrade) {
        try {
            const nftAuctionV2 = await ethers.getContractAt("NFTAuctionV2", auctionAddr);
            const version = await nftAuctionV2.getVersion();
            console.log("✓ 升级后合约版本：", version);
            
            if (version === "SimpleAuction V2.0") {
                console.log("   拍卖代理已成功升级到 V2");
            } else {
                console.error("✗ 合约版本不匹配，升级可能未成功");
                console.error("   期望：SimpleAuction V2.0；实际：", version);
            }
        } catch (error) {
            console.error("✗ 验证升级时出错:", error.message);
        }
    } else {
        console.log("未开启升级流程（--upgrade 或 UPGRADE=true），跳过版本验证。");
    }

    console.log("\n=== 测试完成 ===");
}


// 导出 main 函数，以便其他脚本可以调用
module.exports = { main };

// 如果直接运行此脚本，执行主函数
if (require.main === module) {
  main()
    // 如果执行成功，正常退出（退出码 0）
    .then(() => process.exit(0))
    // 如果执行出错，捕获错误
    .catch((error) => {
      // 打印错误信息
      console.error(error);
      // 异常退出（退出码 1）
      process.exit(1);
    });
}
