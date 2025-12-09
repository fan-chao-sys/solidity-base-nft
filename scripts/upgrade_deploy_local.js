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
    
    // 步骤1：部署新的 V2 实现合约
    console.log("\n--- 步骤1: 部署 NFTAuctionV2 实现合约 ---");
    const NFTAuctionV2 = await ethers.getContractFactory("NFTAuctionV2", deployer);
    
    // 只部署实现合约，不创建代理
    const v2Impl = await NFTAuctionV2.deploy();
    await v2Impl.waitForDeployment();
    const v2ImplAddress = await v2Impl.getAddress();
    console.log("✓ NFTAuctionV2 实现合约已部署，地址：", v2ImplAddress);
    
    // 步骤2：通过 Factory 批量升级所有拍卖
    console.log("\n--- 步骤2: 批量升级所有拍卖合约 ---");
    
    const factoryCode = await ethers.provider.getCode(deployInfo.auctionFactory.address);
    if (factoryCode === "0x") {
        throw new Error("工厂合约未部署或网络不匹配");
    }
    console.log("✓ 工厂合约代码存在");
    
    const factory = await ethers.getContractAt("NFTAuctionFactory", deployInfo.auctionFactory.address);
    console.log("✓ 工厂合约实例已获取");
    
    // 获取所有拍卖地址
    const auctionAddresses = await factory.getAllAuctionAddresses();
    const auctionCount = auctionAddresses.length;
    console.log(`✓ 找到 ${auctionCount} 个拍卖合约需要升级`);
    
    if (auctionCount === 0) {
        console.log("⚠️  没有找到需要升级的拍卖合约");
    } else {
        // 使用 Hardhat upgrades 插件批量升级所有拍卖
        for (let i = 0; i < auctionAddresses.length; i++) {
            const auctionAddr = auctionAddresses[i];
            if (auctionAddr !== ethers.ZeroAddress) {
                console.log(`  升级拍卖 ${i + 1}/${auctionCount}: ${auctionAddr}`);
                try {
                    await upgrades.upgradeProxy(auctionAddr, NFTAuctionV2, { kind: "uups" });
                    console.log(`  ✓ 拍卖 ${i + 1} 升级成功`);
                } catch (error) {
                    console.error(`  ✗ 拍卖 ${i + 1} 升级失败:`, error.message);
                    throw error;
                }
            }
        }
        console.log("✓ 所有拍卖合约升级完成");
    }
    
    // 步骤3：更新工厂中的实现合约地址，保证新创建的拍卖实例用 V2
    console.log("\n--- 步骤3: 更新工厂中的实现合约地址 ---");
    
    const updateTx = await factory.connect(deployer).setNFTAuctionImplementation(v2ImplAddress);
    await updateTx.wait();
    console.log("✓ 工厂实现合约地址已更新，交易哈希：", updateTx.hash);

    const verifyImpl = await factory.getNFTAuctionImplementation();
    if (verifyImpl.toLowerCase() !== v2ImplAddress.toLowerCase()) {
        throw new Error("工厂实现合约地址更新失败");
    }
    console.log("✓ 验证通过：工厂实现合约地址与新实现一致");
    
    const newAuctionImpl = v2ImplAddress;

    // 更新部署信息
    deployInfo.auction.implementation = newAuctionImpl;
    deployInfo.auction.upgraded = true;
    deployInfo.auction.upgradeTime = new Date().toISOString();
    
    fs.writeFileSync(storePath, JSON.stringify(deployInfo, null, 2));
    console.log("✓ 部署信息已更新到:", storePath);
    
    console.log("\n=== 升级完成 ===");
    console.log("新实现合约地址：", newAuctionImpl);
    console.log("工厂合约地址：", deployInfo.auctionFactory.address);
    console.log(`已升级的拍卖数量：${auctionCount}`);
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

