const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main(){
    // 获取部署者账户
    const [deployer] = await ethers.getSigners();
    console.log("部署用户地址：", deployer.address);

    // 注意：文件已移到 scripts/ 目录，需要调整路径
    const storePath = path.resolve(__dirname, "../deploy/.cache/NFTAuction_deployment.json");
    if(!fs.existsSync(storePath)){
        console.error("部署信息文件不存在，请先部署合约");
        console.error("请先运行: npx hardhat deploy --tags auction");
        return;
    }
    
    // 读取部署信息
    const storeData = fs.readFileSync(storePath,"utf8");
    const deployInfo = JSON.parse(storeData);
    
    console.log("\n=== 开始升级流程 ===");
    console.log("原实现合约地址：", deployInfo.auction.implementation);
    console.log("工厂合约地址：", deployInfo.auctionFactory.address);
    
    // 方案2：部署新的实现合约并更新工厂中的实现合约地址
    // 这样新创建的拍卖会使用新版本的实现合约
    
    // 步骤1：部署新的 NFTAuctionV2 实现合约（直接部署，不使用代理）
    console.log("\n--- 步骤1: 部署 NFTAuctionV2 实现合约 ---");
    const NFTAuctionV2 = await ethers.getContractFactory("NFTAuctionV2", deployer);
    console.log("✓ 已加载 NFTAuctionV2 合约工厂");
    
    // 直接部署实现合约（不是代理合约）
    const nftAuctionV2Impl = await NFTAuctionV2.deploy();
    await nftAuctionV2Impl.waitForDeployment();
    const nftAuctionV2ImplAddress = await nftAuctionV2Impl.getAddress();
    console.log("✓ 新实现合约地址：", nftAuctionV2ImplAddress);
    
    // 步骤2：获取工厂合约实例
    console.log("\n--- 步骤2: 更新工厂中的实现合约地址 ---");
    
    // 验证工厂合约地址是否存在代码
    console.log("检查工厂合约代码...");
    console.log("当前网络:", (await ethers.provider.getNetwork()).name);
    console.log("当前链ID:", (await ethers.provider.getNetwork()).chainId);
    
    const factoryCode = await ethers.provider.getCode(deployInfo.auctionFactory.address);
    if (factoryCode === "0x") {
        console.error("\n❌ 错误：工厂合约地址没有代码");
        console.error(`   地址：${deployInfo.auctionFactory.address}`);
        console.error("\n⚠️  重要提示：");
        console.error("   'npx hardhat deploy' 和 'npx hardhat run' 使用不同的网络实例！");
        console.error("   每次运行都会创建新的内置 Hardhat 网络，之前的部署会丢失。");
        console.error("\n解决方案：");
        console.error("   方案1（推荐）：使用同一个网络会话");
        console.error("   1. 在一个终端启动: npx hardhat node");
        console.error("   2. 在另一个终端运行: npx hardhat deploy --tags auction --network localhost");
        console.error("   3. 然后运行: npx hardhat run scripts/upgrade_deploy.js --network localhost");
        console.error("\n   方案2：在同一个脚本中执行部署和升级");
        console.error("   创建一个组合脚本，在同一个网络会话中执行所有操作");
        console.error("\n   方案3：使用 hardhat 的内置网络（临时方案）");
        console.error("   在同一个终端会话中，先部署，然后立即运行升级脚本");
        throw new Error("工厂合约未部署或网络不匹配");
    }
    console.log("✓ 工厂合约代码存在");
    
    // 获取工厂合约实例（使用代理合约地址）
    const factory = await ethers.getContractAt("NFTAuctionFactory", deployInfo.auctionFactory.address);
    console.log("✓ 工厂合约实例已获取");
    
    // 验证当前工厂中的实现合约地址
    let currentImplAddress;
    try {
        // 尝试直接调用函数
        currentImplAddress = await factory.getNFTAuctionImplementation();
        console.log("工厂当前实现合约地址：", currentImplAddress);
        
        // 验证地址是否有效
        if (!currentImplAddress || currentImplAddress === ethers.ZeroAddress) {
            console.log("⚠️  警告：工厂中的实现合约地址为空或零地址");
            console.log("   这可能表示工厂合约未正确初始化");
            // 尝试从部署信息中获取
            if (deployInfo.auction.implementation) {
                console.log("   使用部署信息中的实现合约地址：", deployInfo.auction.implementation);
                currentImplAddress = deployInfo.auction.implementation;
            }
        }
    } catch (error) {
        console.error("✗ 获取工厂实现合约地址时出错:", error.message);
        console.error("   错误详情:", error);
        
        // 尝试使用 upgrades 插件获取实现合约地址
        try {
            console.log("   尝试使用 upgrades 插件获取实现合约地址...");
            const implAddressFromProxy = await upgrades.erc1967.getImplementationAddress(deployInfo.auctionFactory.address);
            console.log("   从代理合约获取的实现地址：", implAddressFromProxy);
            currentImplAddress = implAddressFromProxy;
        } catch (upgradeError) {
            console.error("   使用 upgrades 插件也失败:", upgradeError.message);
            console.error("\n   可能原因：");
            console.error("   1. 工厂合约未正确初始化（检查初始化函数名是否为 'initalize'）");
            console.error("   2. 工厂合约的 ABI 不匹配");
            console.error("   3. 代理合约的实现地址不正确");
            console.error("   4. 网络连接问题");
            
            // 如果部署信息中有实现合约地址，使用它
            if (deployInfo.auction.implementation) {
                console.log("\n   使用部署信息中的实现合约地址继续...");
                currentImplAddress = deployInfo.auction.implementation;
            } else {
                throw new Error("无法获取工厂实现合约地址，且部署信息中也没有实现合约地址");
            }
        }
    }
    
    // 步骤3：更新工厂中的实现合约地址
    console.log("更新工厂实现合约地址...");
    const updateTx = await factory.connect(deployer).setNFTAuctionImplementation(nftAuctionV2ImplAddress);
    await updateTx.wait();
    console.log("✓ 交易哈希：", updateTx.hash);
    
    // 验证更新是否成功
    const newImplAddress = await factory.getNFTAuctionImplementation();
    if (newImplAddress.toLowerCase() === nftAuctionV2ImplAddress.toLowerCase()) {
        console.log("✓ 工厂实现合约地址更新成功");
    } else {
        console.error("✗ 工厂实现合约地址更新失败");
        console.error("  期望：", nftAuctionV2ImplAddress);
        console.error("  实际：", newImplAddress);
        throw new Error("工厂实现合约地址更新失败");
    }

    // 更新部署信息
    deployInfo.auction.implementation = nftAuctionV2ImplAddress;
    deployInfo.auction.upgraded = true;
    deployInfo.auction.upgradeTime = new Date().toISOString();
    
    // 保存更新后的部署信息
    fs.writeFileSync(storePath, JSON.stringify(deployInfo, null, 2));
    console.log("✓ 部署信息已更新到:", storePath);
    
    console.log("\n=== 升级完成 ===");
    console.log("新实现合约地址：", nftAuctionV2ImplAddress);
    console.log("工厂合约地址：", deployInfo.auctionFactory.address);
    console.log("\n注意：只有升级后新创建的拍卖会使用新版本的实现合约。");
    console.log("     已存在的拍卖代理合约仍使用旧版本的实现合约。");
}

// 导出 main 函数，以便其他脚本可以调用
module.exports = { main };

// 如果直接运行此脚本，执行主函数
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

