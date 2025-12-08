# NFT 可升级拍卖示例（Hardhat）

可升级（UUPS）版的 NFT 拍卖示例，包含工厂创建拍卖、竞价/结束流程，以及升级到 `NFTAuctionV2` 的脚本和测试。

## 快速开始

```bash
npm install
```

### 本地部署/测试
- 仅部署（不升级）：`npm run test:local`
- 部署并升级：`npm run test:local -- --upgrade`
  - 或在 PowerShell 中：`$env:UPGRADE="true"; npm run test:local`

### 主要脚本
- `deploy/deploy_auction_Local.js`：本地部署 NFT、USDC、拍卖代理与工厂。
- `deploy/upgrade_auction_Local.js`：对已部署的拍卖代理执行 UUPS 升级，并更新工厂实现指针。
- `scripts/upgrade_deploy_local.js`：等效的升级脚本入口。
- `test/auction_Local.js`：端到端流程测试（含可选升级验证）。

### 合约
- `contracts/NFTAuction.sol`：拍卖逻辑（UUPS）。
- `contracts/NFTAuctionFactory.sol`：拍卖工厂（UUPS），创建新的拍卖代理。
- `contracts/NFTAuctionV2.sol`：拍卖 V2，新增版本标识函数 `getVersion()`.
