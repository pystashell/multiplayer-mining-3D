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

## 验证

```bash
npm test
npm run deploy:dry
```

推送任意分支或建立 Pull Request 后，GitHub Actions 也会自动执行以上检查。测试记录可以在仓库的 **Actions → CI** 中查看。

`npm test` 中的测试是配置驱动的通用契约，不依赖当前角色姓名或素材文件名。
其中一部分在真实运行时里执行：无头 Chrome（用 SwiftShader 软件渲染 WebGL，
任何机器上像素一致）驱动真实页面检查棋盘拾取、相机、回放、画面颜色和双人联机，
`wrangler dev --local` 启动真实 workerd 检查 Durable Object、闹钟、WebSocket 和
静态资源响应头。因此本机需要安装 Chrome、Chromium 或 Edge；安装在非常规位置时，
把 `HOLO_SWEEPER_BROWSER` 设为浏览器可执行文件路径。这些重型测试一次只运行一个，
整套测试约需 3 分钟。
每个测试的目的、失败处理和有效性边界见
[自动化测试目录](docs/AUTOMATED_TEST_CATALOG.md)。
正式发布还必须按 [UI 人工测试手册](docs/PREDEPLOY_UI_MANUAL.md)
完成真实桌面、手机和双客户端验收；完整门禁见
[发布前质量流程](docs/PREDEPLOY_PROCESS.md)。

查看按可执行行统计的覆盖率报告：

```bash
npm run test:coverage
```

报告会合并同一模块通过不同 `?v=` 缓存参数加载的多次执行，也会并入浏览器测试
在页面里实际执行的代码（例如 `public/app.js`），并把从未被任何测试加载的文件
计为 0%，因此“全部运行时代码”一行才是真实覆盖率；“仅已加载文件”一行只反映
被测试模块内部的完整度。CI 也用这个命令运行完整测试，每次运行的 Summary 页面
都会附上这份报告。

画面测试把固定场景的渲染结果与 `tests/fixtures/render-fingerprints.json` 比对。
只有经过 UI 人工验收的有意视觉改动，才用下面的命令重新录制；依赖升级必须还原
已录制的画面，而不是重录基线：

```bash
npm run test:render-baseline
```

开发服务器运行时，可以执行真实双 WebSocket 测试：

```bash
npm run test:live
```

## 部署

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` 会先执行一次发布前门禁 `npm run deploy:gate`：运行全部自动化、
Wrangler dry-run，并验证与当前源码绑定的 UI 人工验收记录，全部通过后才调用 Wrangler
部署。只想检查、不部署时，单独运行 `npm run deploy:gate`。

部署后，网页、房间 API 和 WebSocket 共用同一个 `workers.dev` 域名。创建房间后 URL 会自动附加 `?room=六位房间码`，可以直接复制给朋友。

正式版本采用“版本分支 → CI → SemVer 标签 → GitHub Release → Cloudflare”的固定流程。
常规版本可先合并 `main`；独立的大型角色或故事版本也可以从与标签同名的受控发布
分支直接发布。详细规则和所需密钥见 [RELEASING.md](RELEASING.md)。
