# UI 验收记录

`ui-approvals/` 保存正式版本的人工 UI 验收证明。

- 记录只能由 `npm run ui:approve -- ... --confirm-all` 在完成 UI 手册后生成。
- 文件名必须与正式标签一致，例如 `v4.0.1.json`。
- 记录与 `public/` 源码摘要绑定；UI 或素材变化后必须重新验收。
- 正式标签必须包含对应记录，否则本地部署和 GitHub Release 都会被阻止。
- 截图可存放在仓库外或稳定的团队证据地址；不要提交密钥、令牌或私有服务日志。

完整步骤见 `docs/PREDEPLOY_PROCESS.md` 与 `docs/PREDEPLOY_UI_MANUAL.md`。
