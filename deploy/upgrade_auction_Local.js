// deploy/upgrade_auction_Local.js
// 升级 NFTAuction 合约到 V2 版本的部署脚本
// 使用 hardhat-deploy 格式，可通过 deployments.fixture(["upgrade"]) 调用

const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 导出 Hardhat Deploy 要求的异步函数
module.exports = async function (hre) {
    const { getNamedAccounts, ethers, upgrades } = hre;
    const { deployer } = await getNamedAccounts();
    
    console.log("\n=== 开始升级流程 ===");
    console.log("部署用户地址：", deployer);
    
    // 读取部署信息文件
    const storePath = path.resolve(__dirname, "./.cache/NFTAuction_deployment.json");
    if (!fs.existsSync(storePath)) {
        console.error("❌ 错误：部署信息文件不存在，请先部署合约");
        throw new Error("部署信息文件不存在，请先运行部署脚本");
    }
    
    // 读取部署信息
    const deployInfo = JSON.parse(fs.readFileSync(storePath, "utf8"));
    
    console.log("原实现合约地址：", deployInfo.auction?.implementation);
    console.log("工厂合约地址：", deployInfo.auctionFactory?.address);
    
    // 检查是否已经升级
    if (deployInfo.auction?.upgraded === true) {
        console.log("\n⚠️  检测到已升级标志，检查当前状态...");
        
        // 验证工厂合约中的实现地址
        try {
            const factory = await ethers.getContractAt("NFTAuctionFactory", deployInfo.auctionFactory.address);
            const currentImplAddress = await factory.getNFTAuctionImplementation();
            
            if (currentImplAddress.toLowerCase() === deployInfo.auction.implementation.toLowerCase()) {
                console.log("✓ 合约已升级，跳过升级流程");
                console.log("当前实现合约地址：", currentImplAddress);
                return; // 已升级，直接返回
            } else {
                console.log("⚠️  部署信息显示已升级，但工厂中的地址不匹配，继续升级流程");
            }
        } catch (error) {
            console.log("⚠️  无法验证升级状态，继续升级流程");
        }
    }
    
    // 验证工厂合约地址是否存在代码
    const factoryCode = await ethers.provider.getCode(deployInfo.auctionFactory.address);
    if (factoryCode === "0x") {
        throw new Error("工厂合约未部署或网络不匹配");
    }
    console.log("✓ 工厂合约代码存在");
    
    // 步骤1：部署新的 NFTAuctionV2 实现合约（直接部署，不使用代理）
    console.log("\n--- 步骤1: 部署 NFTAuctionV2 实现合约 ---");
    const deployerSigner = await ethers.getSigner(deployer);
    const NFTAuctionV2 = await ethers.getContractFactory("NFTAuctionV2", deployerSigner);
    console.log("✓ 已加载 NFTAuctionV2 合约工厂");
    
    // 直接部署实现合约（不是代理合约）
    const nftAuctionV2Impl = await NFTAuctionV2.deploy();
    await nftAuctionV2Impl.waitForDeployment();
    const nftAuctionV2ImplAddress = await nftAuctionV2Impl.getAddress();
    console.log("✓ 新实现合约地址：", nftAuctionV2ImplAddress);
    
    // 步骤2：获取工厂合约实例
    console.log("\n--- 步骤2: 更新工厂中的实现合约地址 ---");
    const factory = await ethers.getContractAt("NFTAuctionFactory", deployInfo.auctionFactory.address);
    console.log("✓ 工厂合约实例已获取");
    
    // 获取当前工厂中的实现合约地址
    let currentImplAddress;
    try {
        currentImplAddress = await factory.getNFTAuctionImplementation();
        console.log("工厂当前实现合约地址：", currentImplAddress);
        
        if (!currentImplAddress || currentImplAddress === ethers.ZeroAddress) {
            console.log("⚠️  警告：工厂中的实现合约地址为空或零地址");
            if (deployInfo.auction?.implementation) {
                console.log("   使用部署信息中的实现合约地址：", deployInfo.auction.implementation);
                currentImplAddress = deployInfo.auction.implementation;
            }
        }
    } catch (error) {
        console.error("✗ 获取工厂实现合约地址时出错:", error.message);
        
        // 尝试使用 upgrades 插件获取实现合约地址
        try {
            console.log("   尝试使用 upgrades 插件获取实现合约地址...");
            const implAddressFromProxy = await upgrades.erc1967.getImplementationAddress(deployInfo.auctionFactory.address);
            console.log("   从代理合约获取的实现地址：", implAddressFromProxy);
            currentImplAddress = implAddressFromProxy;
        } catch (upgradeError) {
            console.error("   使用 upgrades 插件也失败:", upgradeError.message);
            
            if (deployInfo.auction?.implementation) {
                console.log("\n   使用部署信息中的实现合约地址继续...");
                currentImplAddress = deployInfo.auction.implementation;
            } else {
                throw new Error("无法获取工厂实现合约地址，且部署信息中也没有实现合约地址");
            }
        }
    }
    
    // 步骤3：更新工厂中的实现合约地址
    console.log("更新工厂实现合约地址...");
    const updateTx = await factory.connect(deployerSigner).setNFTAuctionImplementation(nftAuctionV2ImplAddress);
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

// 导出标签和依赖关系
// dependencies 确保先执行 "auction" 标签的部署脚本
module.exports.tags = ["upgrade", "all"];
module.exports.dependencies = ["auction"];

