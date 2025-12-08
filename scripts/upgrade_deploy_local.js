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
    
    // UUPS 升级：直接对已部署的拍卖代理调用 upgradeProxy，不换地址
    console.log("\n--- 步骤1: 升级拍卖代理到 NFTAuctionV2 (UUPS) ---");
    if (!deployInfo.auction?.proxyAddress) {
        throw new Error("部署信息缺少 auction.proxyAddress，无法执行升级");
    }
    const auctionProxyAddress = deployInfo.auction.proxyAddress;
    console.log("待升级的拍卖代理地址：", auctionProxyAddress);

    const NFTAuctionV2 = await ethers.getContractFactory("NFTAuctionV2", deployer);
    const upgradedAuction = await upgrades.upgradeProxy(auctionProxyAddress, NFTAuctionV2, { kind: "uups" });
    await upgradedAuction.waitForDeployment();
    const newAuctionImpl = await upgrades.erc1967.getImplementationAddress(auctionProxyAddress);
    console.log("✓ 升级完成，新实现合约地址：", newAuctionImpl);
    
    // 步骤2：更新工厂中的实现合约地址，保证新创建的拍卖实例用 V2
    console.log("\n--- 步骤2: 更新工厂中的实现合约地址 ---");
    
    const factoryCode = await ethers.provider.getCode(deployInfo.auctionFactory.address);
    if (factoryCode === "0x") {
        throw new Error("工厂合约未部署或网络不匹配");
    }
    console.log("✓ 工厂合约代码存在");
    
    const factory = await ethers.getContractAt("NFTAuctionFactory", deployInfo.auctionFactory.address);
    console.log("✓ 工厂合约实例已获取");
    
    const updateTx = await factory.connect(deployer).setNFTAuctionImplementation(newAuctionImpl);
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
    console.log("新创建的拍卖将直接使用 V2；已有代理地址不变但逻辑已升级。");
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

