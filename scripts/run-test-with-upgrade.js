// scripts/run-test-with-upgrade.js
// 包装脚本：设置环境变量并运行测试脚本

process.env.UPGRADE = "true";

// 使用 hardhat run 来执行脚本，这样可以使用 hardhat 的环境
const { execSync } = require("child_process");
const path = require("path");

const testScriptPath = path.resolve(__dirname, "../test/auction_Local.js");

try {
    execSync(`npx hardhat run ${testScriptPath}`, {
        stdio: "inherit",
        env: { ...process.env, UPGRADE: "true" }
    });
} catch (error) {
    process.exit(1);
}

