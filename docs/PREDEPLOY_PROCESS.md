# 发布前质量流程

这套流程把可重复的自动化验证、真实 UI 人工验收和 Cloudflare 线上验证分开管理。任何正式部署都不能只依赖其中一类检查。

## 一条命令覆盖的自动化门禁

```powershell
npm test
```

它会按顺序执行：

1. `npm run test:catalog:check`：每个 `tests/*.test.js` 都必须登记，测试目录不能过期。
2. `npm run ui:manual:check`：UI 手册必须与机器可读清单一致。
3. `npm run vendor:check`：固定的本地依赖和许可证不能漂移。
4. `npm run version:check`：package、公开版本和缓存版本一致。
5. `node --test tests/*.test.js`：运行全部规则、客户端、内容、UI 源码契约、安全和发布回归。

每个套件、每个可执行用例标题、失败处理和有效性边界见
[自动化测试目录](AUTOMATED_TEST_CATALOG.md)。

## “通用测试”的判定

测试必须验证长期行为或配置契约，而不是验证当前偶然取值：

- 角色测试使用任意合成角色配置，不能写死当前姓名、ID 或代号。
- 素材测试从 `GUIDE_ART` 读取路径，不能把当前文件名复制到断言。
- 故事禁用词与必需概念来自 `config/content-policy.json`，这是可评审的产品政策，不散落在测试代码。
- UI 源码测试验证结构、事件和响应式约束，但不声称已经看到真实像素结果。
- `identity-agnostic-tests.test.js` 会扫描测试源码；只要有人把当前角色身份写进测试，整套测试就会失败。

## UI 人工验收

自动化无法充分证明人物图是否一致、文本是否被遮挡、手机触摸是否顺手或两个真实浏览器是否同步，因此正式发布前必须执行
[UI 人工测试手册](PREDEPLOY_UI_MANUAL.md)。

全部场景通过后记录验收：

```powershell
npm run ui:approve -- --reviewer "验收人" --browser "Chrome 版本/系统" --evidence "截图目录或证据链接" --confirm-all
```

验收记录写入 `predeploy/ui-approvals/vX.Y.Z.json`。记录包含：

- 发布标签；
- UI 清单版本；
- `public/` 全部文件与清单本身的 SHA-256 摘要；
- 验收人、时间和实际浏览器；
- 每个必测场景的通过状态与证据。

任何 `public/` 文件或 UI 清单变化都会使旧记录失效。不能复制旧版本记录代替复测。

## 本地正式部署门禁

人工 UI 验收记录生成后运行：

```powershell
npm run predeploy
```

该命令强制执行：

1. `npm test`
2. `npm run deploy:dry`
3. `npm run ui:check`

只有三项全部通过，下面的生产部署命令才会调用 Wrangler：

```powershell
npm run deploy
```

## GitHub 与 Cloudflare 发布

分支 CI 自动运行 `npm test` 和 `npm run deploy:dry`，用于持续反馈；它不会假装完成真人视觉验收。

正式 SemVer 标签工作流还会对标签中的验收记录运行
`npm run ui:check -- <tag>`。通过后才会建立 Release 草稿、部署 Cloudflare、验证线上版本、运行真实双 WebSocket 冒烟测试，最后公开 Release。

## 失败如何处理

1. **产品确实坏了**：修复实现，重新运行完整自动化和受影响的 UI 场景。
2. **需求有意改变**：先更新需求或政策配置，再同时更新实现、测试和手册；变更记录要解释新的长期契约。
3. **内部重构导致源码断言过时，但用户行为没变**：把断言迁移到新的等价行为，不能直接删除保护。
4. **测试偶发或环境失败**：保存日志并稳定复现；无法解释的红灯仍然阻止发布。
5. **测试本身可能无效**：先用独立复现或人工检查证明产品行为正确，再修改测试，并在提交中说明旧断言为什么不再代表需求。

发布门禁失败时禁止使用 `--force`、删除用例、复制旧验收或直接调用生产 Wrangler 命令绕过流程。
