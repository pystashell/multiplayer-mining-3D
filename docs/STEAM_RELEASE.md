# Steam 桌面版包装与上架流程

更新时间：2026-08-09

## 结论

现有游戏可以做成 Steam 单机游戏，但“网页已经能玩”不等于“现在可以直接点上架”。

技术上，单机玩法已经完全在本地执行：创建单机任务不会调用 HTTP API 或 WebSocket，
棋盘、回溯、自动测绘和本地存档都不依赖 Cloudflare。Steam 第一阶段因此采用 Electron
包装同一份 `public/`，而不是复制或重写一套游戏。

Steam 版当前明确按“Windows x64、键盘鼠标、单机、本地存档”作为首个可发布基线。
当前交付包不初始化 Steam Lobby/P2P，不暴露联机 IPC，也不携带 Steamworks 桥接模块。
未来联机能力必须作为独立版本重新进入设计、安全审计、双机验收和商店能力审核流程。
Steam Cloud、成就、手柄和 Steam Deck 兼容性也必须各自验收后才能声明。

## 一份网页源，两个交付目标

```text
public/  （唯一游戏前端源）
├─ 网页目标：Wrangler -> Cloudflare Worker / 浏览器
└─ Steam 目标：安全 Electron 外壳 -> Windows 内容目录 -> SteamPipe
```

桌面外壳没有 Node.js renderer 权限，启用了 context isolation、renderer sandbox 和
自定义 `holo://` 安全协议，并拒绝新窗口、外部导航和权限请求。Steam 单机 profile 会：

- 隐藏并禁用多人入口；
- 阻止房间 URL 把单机包切回网络模式；
- 继续使用现有本地单机引擎；
- 记住当前单机存档 ID，使关闭程序后再次启动仍能恢复；
- 不附带 Worker、测试、脚本、Cloudflare 配置、Steam 联机原型或开发依赖；
- 即使传入旧的 `--steam-online` 或 Lobby 邀请参数，仍保持单机 profile。

网页端不注入这个 profile，所以现有网页版多人功能保持不变。

## 本地开发与一键构建

前置条件：Node.js `>=22.13.0`，首次执行 `npm install`。

```powershell
# 用桌面壳直接预览同一份 public/
npm run steam:dev

# 推荐入口：从当前网页版源码同步共享文件并生成 Steam 包
npm run steam:from-web

# 严格入口：不自动同步，生成文件过期时直接失败；CI 使用这一条
npm run steam:build
```

成功后 SteamPipe 内容根目录固定为：

```text
dist/steam/content/
└─ ZeroDomainProtocol.exe
```

`dist/steam/build-manifest.json` 记录版本、Electron 版本、架构、文件数量、总字节数和
每个文件的 SHA-256。`npm run steam:verify` 会重算并检查：

- EXE 与 `resources/app.asar` 存在；
- 必需的桌面和游戏文件已经进入 ASAR；
- Worker、测试、脚本、配置、Node 依赖和本地密钥没有混入；
- `desktop/steam/`、`public/steam-room-client.js` 和 `steam_api64.dll` 没有混入；
- `steam_appid.txt` 没有被误打进正式包；
- 内容目录与构建清单逐文件一致。
- 除网页版专用的 `_headers` 和未发布联机原型外，ASAR 中每个 `public/` 文件都与网页源码逐字节一致。

`npm run steam:smoke` 会实际启动打包后的 EXE（窗口隐藏），禁用 renderer 的
`fetch` 与 `WebSocket`，开始一局任务并验证 3D Canvas、本地存档、Steam 单机 profile
和零网络调用。纯源码测试不能替代这一步。

`steam:from-web` 会先运行版本同步和 `vendor:sync`。因此 `public/` 内的界面、Three.js
渲染、音频、文案会直接进入桌面包；`worker/room-engine.js` 与
`worker/beginner-layout.js` 会自动生成 Steam/本地玩法使用的浏览器镜像。Worker 路由、
Durable Object 存储和 WebSocket 代码属于网页版基础设施，不会被打进 Steam 包。

每次推送 `codex/v*-steam-*` 分支，GitHub Actions 会在 Windows runner 上执行严格的
`npm run steam:build` 并保存内容目录 artifact；如果开发者忘记提交同步后的生成文件，
CI 会直接失败，而不会悄悄改写源码。

## 生成 SteamPipe 配置

拿到真实 App ID 和 Windows Depot ID 后，先生成不会上传内容的 Preview 配置：

```powershell
npm run steam:steampipe:config -- --app-id 123456 --depot-id 123457
```

配置输出到 `dist/steam/steampipe/`，`Preview` 默认为 `1`。确认文件映射后，如需生成
真实上传配置，显式增加 `--upload`：

```powershell
npm run steam:steampipe:config -- --app-id 123456 --depot-id 123457 --upload
```

然后用 Steamworks SDK `tools/ContentBuilder/builder/steamcmd.exe` 的
`run_app_build` 上传。构建账号密码、Steam Guard、App ID 和 Depot ID 都不写进仓库。
首次应先传到私有 beta branch，在干净 Windows 机器上从 Steam 客户端安装验证，
再由 Steamworks 后台把审核版本设为 default。不要上传安装器；SteamPipe 的内容就是
整个 `dist/steam/content/` 目录。

## Steam 后台必须完成的事项

Valve 当前要求的新产品流程：

1. 签署 Steam Distribution Agreement，完成身份、银行和税务资料。
2. 每个产品支付 100 美元 Steam Direct Fee；产品达到 1,000 美元 Adjusted Gross
   Revenue 后该费用可在后续付款中收回。
3. 首批产品从付费到可发布至少等待 30 天。
4. 完成并提交商店页审核；通常 3–5 个工作日，Valve 建议至少预留 7 个工作日。
5. 商店页通过后公开 Coming Soon 页面至少两周。
6. 上传接近最终版的 default build，再单独提交 build review；同样建议至少预留
   7 个工作日。
7. 商店页和 build 都通过后，由开发者自己点击 Release App；Steam 不会自动发布。

官方入口：

- Steam Direct：https://partner.steamgames.com/steamdirect/
- Release Process：https://partner.steamgames.com/doc/store/releasing
- Review Process：https://partner.steamgames.com/doc/store/review_process
- Uploading to Steam：https://partner.steamgames.com/doc/sdk/uploading

## 商店页与包装的人工发布门禁

下面这些不能由代码自动替你确认，未完成时只能把当前产物称为“技术预览包”：

- **名称与品牌**：在提交 pre-release review 前定稿产品名；审核后名称不能随意更改。
- **自定义图标**：提供 `steam/assets/app-icon.ico`。没有时构建会明确显示
  `icon=default-preview`，不得拿默认 Electron 图标发布。
- **商店图**：按 `steam/assets/README.md` 的当前尺寸制作全部 capsule、library
  assets 和至少五张真实 16:9 游戏截图；capsule 只能出现游戏美术、游戏名和正式副标题。
- **视频**：强烈建议准备以真实玩法为主的 1080p trailer。
- **权利台账**：逐项确认角色图、四张叙事插图、字体、代码、文案与声音拥有商业发行权；
  `THIRD_PARTY_NOTICES.md` 只覆盖已知运行时依赖，不能代替第一方素材来源证明。
- **Windows QA**：在未装 Node.js 的干净 Windows 10/11 x64 机器上，从 Steam 客户端
  安装；验证首次启动、离线启动、存档恢复、全屏 F11、Esc 退出全屏、Alt+Tab、
  多分辨率、中文/英文、音量与卸载重装。
- **商店声明**：第一阶段只勾选 Single-player 与 Keyboard/Mouse。不要勾选
  Online Co-op、Steam Cloud、Achievements、Full Controller Support 或
  Steam Deck Verified。
- **系统需求**：根据至少一台低配机和一台常规机的实际帧率/内存数据填写，不能猜。
- **代码签名**：Steam 可以分发内容目录，但正式 Windows 构建仍建议使用可信代码签名；
  签名前后都要重新执行包校验。
- **隐私与支持**：准备支持邮箱/页面、隐私说明和崩溃处理流程。当前单机包不上传遥测。

未来若启用 Steam 联机，需要重新审查多人复活文案与商店能力声明。

## 后续 Steam 联机版本（当前不发布）

当前交付只包含单机。若未来增加 Steam 联机，需要另开版本进行协议、安全、
Steam 平台能力与真实双机测试；本次构建及验证均不包含联机原型。
