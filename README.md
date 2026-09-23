# Zero Domain Protocol: Sector Purge

[![CI](https://github.com/pystashell/multiplayer-mining-3D/actions/workflows/ci.yml/badge.svg)](https://github.com/pystashell/multiplayer-mining-3D/actions/workflows/ci.yml)

一个使用 Three.js、Cloudflare Workers、Durable Objects 和 Hibernating WebSockets 构建的多人 3D 扫雷游戏。

## 在线试玩

**[立即打开零域协议：区块清除](https://3d-multiplayer-mining.pystashell.workers.dev)**

输入昵称后创建房间，点击“复制邀请”，把带有 `?room=房间码` 的链接发给朋友即可联机。

界面支持中文和英文，并会根据浏览器语言自动选择；也可以在大厅或游戏左上角随时切换。首次进入时会自动生成电脑术语昵称；任务模式由零域测绘师提供引导。角色姓名、代号、职业和图片只需在 `public/guide-character.js` 中配置一次，所有中英文界面会自动更新。

## 架构

- `public/` 保留原有 Three.js 画面、切片、音效和粒子效果。
- `worker/index.js` 提供建房、加入、身份认证、WebSocket 和入口限流。
- 每个六位房间码对应一个 `GameRoom` Durable Object。
- `worker/room-engine.js` 在服务端生成并保存三维雷区，客户端只收到已揭开的公开格子。
- 房间状态写入 Durable Object SQLite，实例休眠或重新创建后可以恢复。
- 客户端命令使用 ID、递增序号、ACK、重发和服务端回执去重。
- 房间 24 小时无活动后由 Alarm 自动回收；广告复活倒计时也由服务端 Alarm 裁决。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:8787`。

## Steam 桌面版

Steam 版直接包装同一份 `public/`，不会维护第二套前端。桌面包版本直接继承网页版 `package.json`，没有独立 Steam 版本号。日常主力开发网页版后，
用一个命令同步版本号、共享规则并生成完整 Windows Steam 内容包：

```bash
npm run steam:dev
npm run steam:from-web
```

`steam:from-web` 依次执行版本同步、`worker/room-engine.js` 到浏览器/Steam
规则镜像同步、完整回归测试、Electron 打包、内容校验和真实 EXE 烟测。
底层的 `npm run steam:build` 保持严格模式，供 CI 检查仓库中的生成文件是否已经提交。

构建产物位于 `dist/steam/content/`。当前 Steam 发布目标严格锁定为本地单机：多人入口
不可见、桌面壳拒绝外部网络请求，并且打包校验会阻止 Lobby、P2P 和 Steamworks 桥接
模块进入交付物。现有网页版 Cloudflare 多人模式保持不变。未来如增加 Steam 联机，将
作为独立版本重新设计、测试和发布。Steam Direct、商店素材与 SteamPipe 见
[Steam 包装与上架流程](docs/STEAM_RELEASE.md)。

## 验证

```bash
npm test
npm run deploy:dry
```

推送任意分支或建立 Pull Request 后，GitHub Actions 也会自动执行以上检查。测试记录可以在仓库的 **Actions → CI** 中查看。

`npm test` 中的测试是配置驱动的通用契约，不依赖当前角色姓名或素材文件名。
每个测试的目的、失败处理和有效性边界见
[自动化测试目录](docs/AUTOMATED_TEST_CATALOG.md)。
正式发布还必须按 [UI 人工测试手册](docs/PREDEPLOY_UI_MANUAL.md)
完成真实桌面、手机和双客户端验收；完整门禁见
[发布前质量流程](docs/PREDEPLOY_PROCESS.md)。

开发服务器运行时，可以执行真实双 WebSocket 测试：

```bash
npm run test:live
```

## 部署

```bash
npx wrangler login
npm run predeploy
npm run deploy
```

`npm run predeploy` 会运行全部自动化、Wrangler dry-run，并验证与当前源码绑定的
UI 人工验收记录；`npm run deploy` 会再次执行这套门禁后才部署。

部署后，网页、房间 API 和 WebSocket 共用同一个 `workers.dev` 域名。创建房间后 URL 会自动附加 `?room=六位房间码`，可以直接复制给朋友。

正式版本采用“版本分支 → CI → SemVer 标签 → GitHub Release → Cloudflare”的固定流程。
常规版本可先合并 `main`；独立的大型角色或故事版本也可以从与标签同名的受控发布
分支直接发布。详细规则和所需密钥见 [RELEASING.md](RELEASING.md)。
