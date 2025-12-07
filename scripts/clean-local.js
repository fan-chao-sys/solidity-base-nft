// scripts/clean-local.js
// 清理本地部署记录的脚本
// 用于删除 hardhat-deploy 的部署记录和缓存，解决本地网络重置后的部署问题

const fs = require("fs");
const path = require("path");

async function main() {
    console.log("=== 开始清理本地部署记录 ===\n");

    const projectRoot = path.resolve(__dirname, "..");
    
    // 需要清理的目录和文件
    const pathsToClean = [
        path.join(projectRoot, "deployments", "hardhat"),  // hardhat-deploy 的部署记录
        path.join(projectRoot, "deploy", ".cache"),        // 部署缓存
    ];

    let cleanedCount = 0;

    for (const cleanPath of pathsToClean) {
        try {
            if (fs.existsSync(cleanPath)) {
                // 删除目录及其所有内容
                fs.rmSync(cleanPath, { recursive: true, force: true });
                console.log(`✓ 已删除: ${path.relative(projectRoot, cleanPath)}`);
                cleanedCount++;
            } else {
                console.log(`- 不存在: ${path.relative(projectRoot, cleanPath)}`);
            }
        } catch (error) {
            console.error(`✗ 删除失败: ${path.relative(projectRoot, cleanPath)}`);
            console.error(`  错误: ${error.message}`);
        }
    }

    console.log(`\n=== 清理完成！共清理 ${cleanedCount} 个目录 ===`);
    console.log("\n提示：现在可以运行部署命令:");
    console.log("  npx hardhat deploy --tags auction");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

