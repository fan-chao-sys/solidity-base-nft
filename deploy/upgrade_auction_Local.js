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
    
    // 步骤1：升级现有拍卖代理到 NFTAuctionV2（UUPS 升级，不换 proxy 地址）
    console.log("\n--- 步骤1: 升级拍卖代理到 NFTAuctionV2 (UUPS) ---");
    const deployerSigner = await ethers.getSigner(deployer);
    const NFTAuctionV2 = await ethers.getContractFactory("NFTAuctionV2", deployerSigner);
    console.log("✓ 已加载 NFTAuctionV2 合约工厂");

    if (!deployInfo.auction?.proxyAddress) {
        throw new Error("部署信息中缺少 auction.proxyAddress，无法执行 upgradeProxy");
    }
    const auctionProxyAddress = deployInfo.auction.proxyAddress;
    console.log("待升级的拍卖代理地址：", auctionProxyAddress);

    const upgradedAuction = await upgrades.upgradeProxy(auctionProxyAddress, NFTAuctionV2, {
        kind: "uups",
    });
    await upgradedAuction.waitForDeployment();
    const newAuctionImpl = await upgrades.erc1967.getImplementationAddress(auctionProxyAddress);
    console.log("✓ 升级完成，新实现合约地址：", newAuctionImpl);

    // 步骤2：更新工厂中的实现合约地址，确保新创建的拍卖使用 V2 实现
    console.log("\n--- 步骤2: 更新工厂中的实现合约地址 ---");
    const factory = await ethers.getContractAt("NFTAuctionFactory", deployInfo.auctionFactory.address);
    console.log("✓ 工厂合约实例已获取");

    const updateTx = await factory.connect(deployerSigner).setNFTAuctionImplementation(newAuctionImpl);
    await updateTx.wait();
    console.log("✓ 工厂实现合约地址已更新，交易哈希：", updateTx.hash);

    const verifyImpl = await factory.getNFTAuctionImplementation();
    if (verifyImpl.toLowerCase() !== newAuctionImpl.toLowerCase()) {
        throw new Error("工厂实现合约地址更新失败");
    }
    console.log("✓ 验证通过：工厂实现合约地址与新实现一致");

    // 更新部署信息
    deployInfo.auction.implementation = newAuctionImpl;
    deployInfo.auction.upgraded = true;
    deployInfo.auction.upgradeTime = new Date().toISOString();

    fs.writeFileSync(storePath, JSON.stringify(deployInfo, null, 2));
    console.log("✓ 部署信息已更新到:", storePath);

    console.log("\n=== 升级完成 ===");
    console.log("拍卖代理地址：", auctionProxyAddress);
    console.log("新实现合约地址：", newAuctionImpl);
    console.log("工厂合约地址：", deployInfo.auctionFactory.address);
    console.log("\n注意：已存在的拍卖代理保持同一个地址，逻辑已升级到 V2；");
    console.log("     工厂已指向 V2，实现后新创建的拍卖也将使用 V2。");
}

// 导出标签和依赖关系
// dependencies 确保先执行 "auction" 标签的部署脚本
module.exports.tags = ["upgrade", "all"];
module.exports.dependencies = ["auction"];

