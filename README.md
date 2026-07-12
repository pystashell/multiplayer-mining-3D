# Holo-Sweeper 3D

一个使用 Three.js、Cloudflare Workers、Durable Objects 和 Hibernating WebSockets 构建的多人 3D 扫雷游戏。

## 在线试玩

**[立即打开 Holo-Sweeper 3D](https://3d-multiplayer-mining.liuxingzhi99.workers.dev)**

输入昵称后创建房间，点击“复制邀请”，把带有 `?room=房间码` 的链接发给朋友即可联机。

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

开发服务器运行时，可以执行真实双 WebSocket 测试：

```bash
npm run test:live
```

## 部署

```bash
npx wrangler login
npm run deploy
```

部署后，网页、房间 API 和 WebSocket 共用同一个 `workers.dev` 域名。创建房间后 URL 会自动附加 `?room=六位房间码`，可以直接复制给朋友。
