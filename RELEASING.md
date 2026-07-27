# 版本与发布流程

本仓库采用“每个产品版本一个分支”，不采用“每个 commit 一个分支”。
同一个版本分支在测试期间可以包含多次聚焦的小提交。

## 统一版本号

同一个 SemVer 版本必须同时出现在：

- `package.json`
- `package-lock.json`
- `public/version.json`
- 浏览器缓存参数，例如 `?v=3.1.0`
- Git 标签与 GitHub Release；标签在版本号前增加 `v`

开始下一个版本时，从最新的 `main` 建立分支，然后执行：

```powershell
git switch -c v3.2-short-description
npm version 3.2.0 --no-git-tag-version
npm test
```

`npm version` 的生命周期脚本会自动同步 `public/version.json` 和浏览器缓存参数。
如果版本号没有保持一致，`npm test` 会直接失败。

Durable Object migration、网络协议、存档格式、回放格式和第三方依赖版本不跟随产品版本自动升级；只有相应格式或依赖确实发生变化时才修改。

## 持续集成

每次分支推送和 Pull Request 都会运行 `.github/workflows/ci.yml`：

1. `npm ci`
2. `npm test`
3. `npm run deploy:dry`

测试记录位于 GitHub 仓库的 **Actions → CI**。建议在 GitHub 的 `main` 分支保护规则中，把 `Test and deployment dry run` 设为合并前必须通过的检查。

## 发布正式版本

版本分支通过 CI 并合并到 `main` 后执行：

```powershell
git switch main
git pull --ff-only
git tag -a v3.1.0 -m "Zero Domain Protocol v3.1.0"
git push origin v3.1.0
```

推送标签会启动 `.github/workflows/release.yml`。它会：

1. 检出标签对应的精确提交。
2. 确认该提交已经进入 `main`。
3. 检查标签、package、公开版本和缓存版本完全一致。
4. 运行全部测试和 Wrangler dry-run。
5. 建立 GitHub Release 草稿。
6. 将该标签对应的提交部署到 Cloudflare。
7. 检查线上 `version.json`。
8. 执行真实多人房间与 WebSocket 冒烟测试。
9. 全部成功后才公开 GitHub Release。

如果部署或线上测试失败，Release 会保持草稿状态，不会被展示成一个成功版本。

## GitHub 密钥

在仓库的 `production` Environment 中配置以下加密密钥：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

API Token 只应拥有目标 Cloudflare 账户的 Workers 部署权限。禁止把任何密钥值写入仓库。

当前正式网址：

`https://3d-multiplayer-mining.pystashell.workers.dev`
