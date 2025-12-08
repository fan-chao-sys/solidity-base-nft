// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy"); // 这里应该是 "hardhat-deploy"
require("@openzeppelin/hardhat-upgrades"); // 顺序不能错

// 引入 dotenv 模块，用于读取环境变量
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28", // 确保版本支持 viaIR
    settings: {
      viaIR: true,      // 启用 IR 编译 (注意是 viaIR，不是 vlaIR)
      optimizer: {
        enabled: true,
        runs: 200       // 注意是 200，不是 208
      }
    }
  },
  namedAccounts: {
    deployer: {
      default: 0, // 默认使用第一个账户作为部署者
    },
    alice: {
      default: 1, // 第二个账户作为 Alice
    },
    bob: {
      default: 2, // 第三个账户作为 Bob
    },
    carol: {
      default: 3, // 第四个账户作为 Carol
    }
  },
  networks: {
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [
        process.env.PRIVATE_KEY1 || process.env.PRIVATE_KEY,  // deployer
        process.env.PRIVATE_KEY2 || process.env.PRIVATE_KEY,  // alice (如果没有配置，使用同一个)
        process.env.PRIVATE_KEY3 || process.env.PRIVATE_KEY,  // bob
        process.env.PRIVATE_KEY4 || process.env.PRIVATE_KEY   // carol
      ].filter(key => key) // 过滤掉undefined的值
    }
  }
};