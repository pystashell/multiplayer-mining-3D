# 版本与发布流程

本仓库采用“每个产品版本一个分支”，不采用“每个 commit 一个分支”。
同一个版本分支在测试期间可以包含多次聚焦的小提交。

## 版本号规则

版本号使用 `MAJOR.MINOR.PATCH`：

- `MAJOR`：产品身份、完整故事线、核心交互或兼容边界的整体重构，例如
  `3.x` 升级为 `4.0.0`。
- `MINOR`：在同一产品基础上加入一组中等规模的新功能，例如 `4.1.0`。
- `PATCH`：修复、文案、素材或局部体验调整，例如 `4.0.1`、`4.0.2`。

## 统一版本号

同一个 SemVer 版本必须同时出现在：

- `package.json`
- `package-lock.json`
- `public/version.json`
- 浏览器缓存参数，例如 `?v=4.0.0`
- Git 标签与 GitHub Release；标签在版本号前增加 `v`

常规版本从最新的 `main` 建立分支。大型角色或故事替换可以按发布计划从指定的
已验证归档版本建立独立分支，不隐式合并 `main`。分支名称必须以正式标签开头：

```powershell
git switch -c codex/v4.0.0-short-description
npm version 4.0.0 --no-git-tag-version
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

自动化测试的登记、目的、失败处理和有效性边界见
`docs/AUTOMATED_TEST_CATALOG.md`。CI 的源码级 UI 契约不能替代真人视觉检查；
正式发布前还必须执行 `docs/PREDEPLOY_UI_MANUAL.md`。

## 发布正式版本

先推送版本分支并等待 CI 通过。常规版本可以合并到 `main`；明确要求保持独立的
大型版本无需合并，但分支必须严格匹配 `codex/<tag>-*`。随后在经过验证的提交上
创建正式标签：

```powershell
npm run dev
# 按 docs/PREDEPLOY_UI_MANUAL.md 完成人工验收
npm run ui:approve -- --reviewer "验收人" --browser "浏览器/系统" --evidence "证据路径或链接" --confirm-all
npm run predeploy
git tag -a v4.0.0 -m "Zero Domain Protocol v4.0.0"
git push origin v4.0.0
```

推送标签会启动 `.github/workflows/release.yml`。它会：

1. 检出标签对应的精确提交。
2. 确认该提交已经进入 `main`，或位于与标签严格对应的
   `codex/v4.0.0-*` 远端发布分支。
3. 检查标签、package、公开版本和缓存版本完全一致。
4. 运行全部测试和 Wrangler dry-run。
5. 确认标签中包含与当前 UI 源码摘要绑定的人工验收记录。
6. 建立 GitHub Release 草稿。
7. 将该标签对应的提交部署到 Cloudflare。
8. 检查线上 `version.json`。
9. 执行真实多人房间与 WebSocket 冒烟测试。
10. 全部成功后才公开 GitHub Release。

如果部署或线上测试失败，Release 会保持草稿状态，不会被展示成一个成功版本。

## GitHub 密钥

在仓库的 `production` Environment 中配置以下加密密钥：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

API Token 只应拥有目标 Cloudflare 账户的 Workers 部署权限。禁止把任何密钥值写入仓库。

当前正式网址：

`https://3d-multiplayer-mining.pystashell.workers.dev`
