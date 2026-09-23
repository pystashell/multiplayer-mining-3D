# 自动化测试目录

> 本文件由 `config/test-suite-manifest.json` 与真实 `tests/*.test.js` 自动生成。
> 请不要直接编辑；修改清单后运行 `npm run test:catalog`。

## 如何使用

当前登记 **43 个测试套件、315 个静态用例定义**。参数化用例会在运行时展开为多个实际结果。

- “测试内容”直接取自可执行用例名称，因此目录不会与代码分叉。
- 每个套件都明确说明失败处理和测试何时可能需要评审。
- 角色改名、代号变化或更换素材，不是修改通用测试的理由。
- 源码级 UI 契约只能发现结构回归，仍必须执行 `PREDEPLOY_UI_MANUAL.md`。

## 强制门禁

| 命令 | 检查内容 | 失败时处理 |
| --- | --- | --- |
| `npm run test:catalog:check` | 确认每个自动化测试文件都已登记，且本文档与真实测试标题一致。 | 补充或修正测试清单后运行 npm run test:catalog 重新生成目录；不要跳过目录检查。 |
| `npm run ui:manual:check` | 确认 UI 人工测试手册与机器可读清单一致。 | 修改 config/predeploy-ui-checklist.json 后运行 npm run ui:manual 重新生成手册。 |
| `npm test` | 运行目录、UI 手册、依赖、版本和全部 Node 自动化回归。 | 根据本目录对应套件处理失败；任何红灯都阻止部署。 |
| `npm run deploy:dry` | 让 Wrangler 构建并校验将要部署的 Cloudflare Worker 包。 | 修复 Worker 配置、兼容性、绑定或打包错误后重新运行完整门禁。 |
| `npm run ui:check` | 确认人工 UI 验收与当前 public 源码摘要及发布版本完全绑定。 | 按 UI 手册重新验收并记录；禁止复制旧版本验收文件或跳过。 |
| `npm run verify:live-version` | 确认 Cloudflare 线上版本与正在发布的不可变标签一致。 | 停止发布，核对部署目标、标签、缓存和线上 version.json。 |
| `npm run test:live` | 用两个真实 WebSocket 客户端验证线上建房、加入和房间同步。 | 保留 Release 草稿，检查线上 Worker、Durable Object、网络和协议日志后重新部署验证。 |

## 套件与用例

### auto-survey-engine.test.js

- 分类：游戏规则与权威状态
- 自动化层级：行为级自动化
- 套件目的：验证自动测绘在服务端的权限、保密、去重、取消、持久化和有界完成行为。
- 任一用例失败：先用失败用例的固定输入复现，再检查规则实现、状态迁移和测试夹具。若规则确实被产品决策修改，应在同一变更中同步需求、实现和断言，不能只放宽断言。
- 有效性评审：内部重构不应使这类行为契约失效；只有公开规则、协议或兼容边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L52](../tests/auto-survey-engine.test.js#L52) | `allows only a solo host to control automated survey and blocks manual board actions while running` |
| [L78](../tests/auto-survey-engine.test.js#L78) | `uses the normal protected first dig and exposes no future target or hidden mine data` |
| [L101](../tests/auto-survey-engine.test.js#L101) | `keeps a scan-strategy flag visible for one snapshot before a later dig may Auto-Purge it` |
| [L133](../tests/auto-survey-engine.test.js#L133) | `uses hidden truth for compression steps and finalizes the successful replay` |
| [L159](../tests/auto-survey-engine.test.js#L159) | `cancels by run id, rejects stale pulls, permits manual play afterward, and restart clears status` |
| [L181](../tests/auto-survey-engine.test.js#L181) | `serializes and restores an active pull session without exposing its private control fields` |
| [L200](../tests/auto-survey-engine.test.js#L200) | `de-duplicates the same observed automated-survey step across distinct transport commands` |
| [L239](../tests/auto-survey-engine.test.js#L239) | `authoritatively completes a 9x9x9 ${label} board within one-cell progress bounds` |

### auto-survey-integration.test.js

- 分类：游戏规则与权威状态
- 自动化层级：行为级自动化
- 套件目的：验证自动测绘与房间引擎、Reduction、存档恢复和最终完成流程的整合。
- 任一用例失败：先用失败用例的固定输入复现，再检查规则实现、状态迁移和测试夹具。若规则确实被产品决策修改，应在同一变更中同步需求、实现和断言，不能只放宽断言。
- 有效性评审：内部重构不应使这类行为契约失效；只有公开规则、协议或兼容边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L73](../tests/auto-survey-integration.test.js#L73) | `uses Reduction when enabled without exposing future targets or the mine table` |
| [L90](../tests/auto-survey-integration.test.js#L90) | `keeps the server runner available to ordinary Free Mode board configurations` |
| [L110](../tests/auto-survey-integration.test.js#L110) | `uses a correct visible flag for at least one full snapshot when Reduction is disabled` |
| [L131](../tests/auto-survey-integration.test.js#L131) | `de-duplicates a repeated automatic step and rejects stale runs` |
| [L148](../tests/auto-survey-integration.test.js#L148) | `cancels cleanly and allows ordinary play to resume` |
| [L172](../tests/auto-survey-integration.test.js#L172) | `restores an in-progress run and still de-duplicates a pre-reconnect step` |
| [L191](../tests/auto-survey-integration.test.js#L191) | `completes the 9x9x9 / 60-mine hidden run within a bounded step and time budget` |

### auto-survey-ui.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证自动测绘入口、HUD、移动端锁定、协议命令和任务进度的 UI 源码契约。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L18](../tests/auto-survey-ui.test.js#L18) | `keeps the 9x9x9 ultimate mission hidden while giving it an exact campaign identity` |
| [L36](../tests/auto-survey-ui.test.js#L36) | `routes hard completion into the hidden mission and only ultimate completion into Free Mode` |
| [L50](../tests/auto-survey-ui.test.js#L50) | `keeps automated survey separate from Add-ons and exposes a dedicated live HUD` |
| [L74](../tests/auto-survey-ui.test.js#L74) | `starts only on supported solo surfaces and uses the authoritative three-command protocol` |
| [L92](../tests/auto-survey-ui.test.js#L92) | `deduplicates each observed step, waits for all live wave animations, and resumes from snapshots` |
| [L108](../tests/auto-survey-ui.test.js#L108) | `distinguishes automated scan flags with a red visual without recoloring manual flags` |
| [L121](../tests/auto-survey-ui.test.js#L121) | `locks competing mobile controls and keeps a 44px abort target at the top safe area` |
| [L133](../tests/auto-survey-ui.test.js#L133) | `localizes the automated-survey surface without touching internal protocol keys` |
| [L156](../tests/auto-survey-ui.test.js#L156) | `keeps the successful replay entry and lifecycle available after auto-solving` |

### camera-gestures.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证鼠标与触摸相机平移的阈值、互斥、取消恢复和相机目标同步。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L26](../tests/camera-gestures.test.js#L26) | `right-drag panning starts at exactly 5px and never while the center is fixed` |
| [L34](../tests/camera-gestures.test.js#L34) | `left+right Minesweeper gestures and foreign pointers cannot become camera pans` |
| [L42](../tests/camera-gestures.test.js#L42) | `mobile hold waits 420ms and a premature move or second pointer cancels it` |
| [L73](../tests/camera-gestures.test.js#L73) | `touch panning starts only after the hold and its 6px handoff movement` |
| [L92](../tests/camera-gestures.test.js#L92) | `pointercancel and blur reset every state that can leave a gesture stuck` |
| [L121](../tests/camera-gestures.test.js#L121) | `screen-space pan moves camera and target together while recenter preserves offset` |

### content-policy.test.js

- 分类：角色配置、故事与中英文内容
- 自动化层级：配置驱动自动化
- 套件目的：按数据化政策扫描玩家可见内容，阻止退役设定回流并保留当前故事的核心概念。
- 任一用例失败：先检查单一配置源、模板插值、翻译键或内容政策。普通角色改名不得通过修改测试解决；只有故事或产品政策经确认改变时，才同步更新政策配置和测试。
- 有效性评审：测试必须对任意合法角色配置成立；角色姓名、代号、职业和素材替换不构成测试失效理由。

| 源码 | 测试内容 |
| --- | --- |
| [L49](../tests/content-policy.test.js#L49) | `requires every configurable content rule to explain its intent and failure response` |
| [L68](../tests/content-policy.test.js#L68) | `scans configured product surfaces with data-driven retired-content rules` |
| [L88](../tests/content-policy.test.js#L88) | `keeps campaign concepts defined by product policy rather than character names` |

### control-settings.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证控制预设、持久化、非法值回退、滚轮手势和按键显示。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L39](../tests/control-settings.test.js#L39) | `defines middle-drag and right-drag control presets and recognizes custom profiles` |
| [L100](../tests/control-settings.test.js#L100) | `normalizes unsupported values and rejects unusable control profiles` |
| [L220](../tests/control-settings.test.js#L220) | `persists only valid profiles and safely falls back when storage is bad` |
| [L279](../tests/control-settings.test.js#L279) | `routes plain, Shift, and Ctrl wheel gestures with deterministic modifier precedence` |
| [L292](../tests/control-settings.test.js#L292) | `normalizes wheel delta modes, dominant axes, directions, and extreme input` |
| [L303](../tests/control-settings.test.js#L303) | `formats persisted physical key codes for the settings UI` |

### deploy-gate.test.js

- 分类：版本、供应链、安全与发布门禁
- 自动化层级：交付链自动化
- 套件目的：验证本地生产部署命令必经完整自动化、Cloudflare dry-run 和有效 UI 人工验收。
- 任一用例失败：停止发布，定位版本漂移、依赖漂移、安全头、工作流顺序或部署门禁缺失。不得跳过失败步骤；修复后从完整测试重新开始。
- 有效性评审：仅在正式更换发布平台、版本规则、安全基线或依赖管理方式时评审更新，并保留同等或更强的门禁。

| 源码 | 测试内容 |
| --- | --- |
| [L18](../tests/deploy-gate.test.js#L18) | `production deployment requires automated, bundle, and current UI approval gates` |
| [L35](../tests/deploy-gate.test.js#L35) | `the complete regression command checks documentation, assets, version, and all test files` |
| [L45](../tests/deploy-gate.test.js#L45) | `development, UI evidence, validation, and live-smoke scripts remain available` |

### dialogue-overlay.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证移动端兼容点击不会误关闭剧情对话，且弹窗键盘焦点按可见控件循环。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L8](../tests/dialogue-overlay.test.js#L8) | `ignores the compatibility click left behind by a mobile board gesture` |
| [L23](../tests/dialogue-overlay.test.js#L23) | `cycles keyboard focus through visible dialog controls` |

### game-core-vendor.test.js

- 分类：版本、供应链、安全与发布门禁
- 自动化层级：交付链自动化
- 套件目的：验证浏览器端游戏核心与服务端权威引擎来源一致，避免规则分叉。
- 任一用例失败：停止发布，定位版本漂移、依赖漂移、安全头、工作流顺序或部署门禁缺失。不得跳过失败步骤；修复后从完整测试重新开始。
- 有效性评审：仅在正式更换发布平台、版本规则、安全基线或依赖管理方式时评审更新，并保留同等或更强的门禁。

| 源码 | 测试内容 |
| --- | --- |
| [L12](../tests/game-core-vendor.test.js#L12) | `the browser game core is the exact worker engine source` |
| [L16](../tests/game-core-vendor.test.js#L16) | `the browser beginner layout differs only by its solver import path` |

### guide-character.test.js

- 分类：角色配置、故事与中英文内容
- 自动化层级：配置驱动自动化
- 套件目的：用任意合成角色验证角色配置结构、派生文本、模板渲染和运行时代码无身份写死。
- 任一用例失败：先检查单一配置源、模板插值、翻译键或内容政策。普通角色改名不得通过修改测试解决；只有故事或产品政策经确认改变时，才同步更新政策配置和测试。
- 有效性评审：测试必须对任意合法角色配置成立；角色姓名、代号、职业和素材替换不构成测试失效理由。

| 源码 | 测试内容 |
| --- | --- |
| [L49](../tests/guide-character.test.js#L49) | `accepts a complete bilingual guide profile without depending on the current identity` |
| [L61](../tests/guide-character.test.js#L61) | `derives every displayed identity field from arbitrary replacement profiles` |
| [L88](../tests/guide-character.test.js#L88) | `keeps configured identity literals out of runtime consumers and structural names` |
| [L100](../tests/guide-character.test.js#L100) | `resolves representative guide templates for every replacement profile and language` |

### guided-callout.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证教学标注和坐标轴在几何上避开棋盘与彼此，不遮挡关键操作区。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L12](../tests/guided-callout.test.js#L12) | `places a guided callout entirely outside the projected board` |
| [L30](../tests/guided-callout.test.js#L30) | `uses a side placement when there is no room above or below the board` |
| [L45](../tests/guided-callout.test.js#L45) | `returns null instead of covering the board when no safe space exists` |
| [L56](../tests/guided-callout.test.js#L56) | `floats the coordinate axes outside the board on the side nearest the real origin` |
| [L71](../tests/guided-callout.test.js#L71) | `floating axes avoid an existing guided callout even when it is nearest the origin` |

### guided-tutorial.test.js

- 分类：求解器、推理证据与教程判定
- 自动化层级：算法行为级自动化
- 套件目的：验证分级教学目标、确定性行动锁定、邻域讲解和自动揭示触发顺序。
- 任一用例失败：使用失败棋盘固定复现，检查邻域、约束、概率、证据链和目标选择。不得为了让随机样例通过而降低正确性断言。
- 有效性评审：只要三维扫雷规则和教学正确性标准不变就应持续有效；算法可以重写，但同样输入必须保持安全与可解释性。

| 源码 | 测试内容 |
| --- | --- |
| [L10](../tests/guided-tutorial.test.js#L10) | `keeps the advanced Reduction objective visible until one mine is truly removed` |
| [L36](../tests/guided-tutorial.test.js#L36) | `keeps slice controls available without proactively teaching or highlighting them` |
| [L57](../tests/guided-tutorial.test.js#L57) | `continuously derives and locks beginner actions to the guide’s certain solver target` |
| [L88](../tests/guided-tutorial.test.js#L88) | `pauses the beginner route after the first visible number and teaches neighbor inspection` |
| [L115](../tests/guided-tutorial.test.js#L115) | `keeps guide dialogue centered and moves the guided callout outside the board` |
| [L126](../tests/guided-tutorial.test.js#L126) | `shows the auto-reveal lesson once, only in intermediate after a new flag completes a clue` |

### i18n-audit.test.js

- 分类：角色配置、故事与中英文内容
- 自动化层级：配置驱动自动化
- 套件目的：验证中英文键与参数完全对齐，并用合成角色检查所有角色模板可解析。
- 任一用例失败：先检查单一配置源、模板插值、翻译键或内容政策。普通角色改名不得通过修改测试解决；只有故事或产品政策经确认改变时，才同步更新政策配置和测试。
- 有效性评审：测试必须对任意合法角色配置成立；角色姓名、代号、职业和素材替换不构成测试失效理由。

| 源码 | 测试内容 |
| --- | --- |
| [L23](../tests/i18n-audit.test.js#L23) | `keeps Chinese and English translation keys and interpolation parameters in parity` |
| [L37](../tests/i18n-audit.test.js#L37) | `resolves every guide token with a synthetic profile and keeps English copy language-pure` |

### i18n.test.js

- 分类：角色配置、故事与中英文内容
- 自动化层级：配置驱动自动化
- 套件目的：验证语言选择、任务术语、输入说明、教程、模式和多人活动的双语行为。
- 任一用例失败：先检查单一配置源、模板插值、翻译键或内容政策。普通角色改名不得通过修改测试解决；只有故事或产品政策经确认改变时，才同步更新政策配置和测试。
- 有效性评审：测试必须对任意合法角色配置成立；角色姓名、代号、职业和素材替换不构成测试失效理由。

| 源码 | 测试内容 |
| --- | --- |
| [L25](../tests/i18n.test.js#L25) | `selects Chinese only for Chinese browser language tags` |
| [L32](../tests/i18n.test.js#L32) | `localizes the Zero Domain brand instead of leaving English in Chinese mode` |
| [L41](../tests/i18n.test.js#L41) | `uses the Sector Purge version title` |
| [L50](../tests/i18n.test.js#L50) | `explains the campaign, hidden Ultimate chapter, and independent Free Mode features` |
| [L125](../tests/i18n.test.js#L125) | `uses the new public compression name everywhere while preserving internal protocol identifiers` |
| [L136](../tests/i18n.test.js#L136) | `builds localized computer-themed nicknames from random parts` |
| [L161](../tests/i18n.test.js#L161) | `localizes semantic room activities independently for each client` |
| [L166](../tests/i18n.test.js#L166) | `distinguishes 3D neighbor positions from the beginner number ceiling` |
| [L174](../tests/i18n.test.js#L174) | `teaches inspection once in beginner, transitions into guided reasoning, and only reminds once in medium` |
| [L201](../tests/i18n.test.js#L201) | `keeps slice controls localized without any proactive slice tutorial copy` |
| [L225](../tests/i18n.test.js#L225) | `teaches exact medium hint deductions and labels guesses honestly` |
| [L271](../tests/i18n.test.js#L271) | `provides mobile touch controls and long-press guidance` |
| [L314](../tests/i18n.test.js#L314) | `describes middle- and right-button camera drag choices in both languages` |
| [L328](../tests/i18n.test.js#L328) | `localizes the matrix-center switch, pan gesture, and recenter action` |
| [L359](../tests/i18n.test.js#L359) | `provides explicit click targets for the guided beginner board` |
| [L373](../tests/i18n.test.js#L373) | `names the advanced mission Final Protocol in both languages` |
| [L380](../tests/i18n.test.js#L380) | `localizes the dialogue backdrop dismissal hint` |
| [L385](../tests/i18n.test.js#L385) | `uses a single rewind action for solo mission failure` |
| [L397](../tests/i18n.test.js#L397) | `explains that a teammate ad locks the entire squad` |

### identity-agnostic-tests.test.js

- 分类：角色配置、故事与中英文内容
- 自动化层级：配置驱动自动化
- 套件目的：元测试：扫描全部自动化测试源码，禁止写死当前角色的 ID、姓名或代号。
- 任一用例失败：先检查单一配置源、模板插值、翻译键或内容政策。普通角色改名不得通过修改测试解决；只有故事或产品政策经确认改变时，才同步更新政策配置和测试。
- 有效性评审：测试必须对任意合法角色配置成立；角色姓名、代号、职业和素材替换不构成测试失效理由。

| 源码 | 测试内容 |
| --- | --- |
| [L15](../tests/identity-agnostic-tests.test.js#L15) | `keeps automated test source independent from the currently configured guide identity` |

### input-mode-ui.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证输入模式在单页应用生命周期内校准并刷新所有可见说明。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L15](../tests/input-mode-ui.test.js#L15) | `calibrates input mode before lobby click handlers and carries it through the SPA` |
| [L31](../tests/input-mode-ui.test.js#L31) | `uses one input-aware translation path and refreshes every active instruction surface` |

### input-mode.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证鼠标、触摸和混合设备的输入模式识别、重校准与本地化文案选择。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L11](../tests/input-mode.test.js#L11) | `detects the initial input mode from pointer capability instead of viewport size` |
| [L18](../tests/input-mode.test.js#L18) | `lets real pointer input recalibrate hybrid devices without guessing unknown pointers` |
| [L27](../tests/input-mode.test.js#L27) | `selects same-language input copy, replaces params, and falls back to the base key` |
| [L40](../tests/input-mode.test.js#L40) | `keeps all gameplay instruction variants complete in Chinese and English` |

### interaction-layout.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证桌面交互布局、相机控制、教学目标、求解器面板、通讯和对话插图的结构契约。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L9](../tests/interaction-layout.test.js#L9) | `lets players lock or pan the matrix center while camera bindings remain runtime-configurable` |
| [L31](../tests/interaction-layout.test.js#L31) | `keeps view controls discoverable without making rotation a beginner task` |
| [L39](../tests/interaction-layout.test.js#L39) | `keeps control-setting actions inside the dialog and themes its scrollbar` |
| [L48](../tests/interaction-layout.test.js#L48) | `keeps the lobby compact and makes its fallback scrollbar unobtrusive` |
| [L62](../tests/interaction-layout.test.js#L62) | `keeps the beginner flag step reachable and visibly raises its flag` |
| [L70](../tests/interaction-layout.test.js#L70) | `preserves left, right, and two-button minesweeper actions across camera profiles` |
| [L85](../tests/interaction-layout.test.js#L85) | `keeps desktop two-button actions reliable across oblique views and interrupted input` |
| [L99](../tests/interaction-layout.test.js#L99) | `makes the highlighted number or cube the exact two-button target` |
| [L112](../tests/interaction-layout.test.js#L112) | `makes solver actions visual-first while keeping coordinates as secondary checks` |
| [L124](../tests/interaction-layout.test.js#L124) | `renders practical verification inside the current task panel` |
| [L138](../tests/interaction-layout.test.js#L138) | `keeps the solver at bottom center and restores squad communications` |
| [L149](../tests/interaction-layout.test.js#L149) | `plays the squad mine sound once when a player gives up revival` |
| [L156](../tests/interaction-layout.test.js#L156) | `keeps the illustrated background inside the dialogue frame without covering text` |

### local-solo-client.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证本地单人模式无需网络即可运行、恢复、回放、过期清理并兼容旧房间链接。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L99](../tests/local-solo-client.test.js#L99) | `new solo sessions run locally without fetch or WebSocket and clear their save on leave` |
| [L135](../tests/local-solo-client.test.js#L135) | `a local solo board restores after refresh and continues with a monotonic sequence` |
| [L165](../tests/local-solo-client.test.js#L165) | `local solo preserves rewind, automated survey, and the successful replay tape` |
| [L204](../tests/local-solo-client.test.js#L204) | `expired local saves are removed instead of being resumed forever` |
| [L224](../tests/local-solo-client.test.js#L224) | `an old room URL keeps using the existing network transport, including legacy server solo rooms` |
| [L241](../tests/local-solo-client.test.js#L241) | `local play remains available when persistence is unavailable` |
| [L255](../tests/local-solo-client.test.js#L255) | `runtime IDs and state cloning work without randomUUID or structuredClone` |

### minesweeper-solver-room.test.js

- 分类：求解器、推理证据与教程判定
- 自动化层级：算法行为级自动化
- 套件目的：在真实中等棋盘上验证求解器不会把地雷判安全或把安全格判为确定地雷。
- 任一用例失败：使用失败棋盘固定复现，检查邻域、约束、概率、证据链和目标选择。不得为了让随机样例通过而降低正确性断言。
- 有效性评审：只要三维扫雷规则和教学正确性标准不变就应持续有效；算法可以重写，但同样输入必须保持安全与可解释性。

| 源码 | 测试内容 |
| --- | --- |
| [L26](../tests/minesweeper-solver-room.test.js#L26) | `never labels a real medium-board mine safe or a safe cell as a certain mine` |

### minesweeper-solver.test.js

- 分类：求解器、推理证据与教程判定
- 自动化层级：算法行为级自动化
- 套件目的：验证三维约束推理、枚举、概率、证据说明、目标偏好和预算回退。
- 任一用例失败：使用失败棋盘固定复现，检查邻域、约束、概率、证据链和目标选择。不得为了让随机样例通过而降低正确性断言。
- 有效性评审：只要三维扫雷规则和教学正确性标准不变就应持续有效；算法可以重写，但同样输入必须保持安全与可解释性。

| 源码 | 测试内容 |
| --- | --- |
| [L18](../tests/minesweeper-solver.test.js#L18) | `derives safe cells from the overlapping 4-cell and 6-cell example` |
| [L31](../tests/minesweeper-solver.test.js#L31) | `uses direct number rules before expensive enumeration` |
| [L45](../tests/minesweeper-solver.test.js#L45) | `prefers certain mines across deterministic rule levels only when requested` |
| [L64](../tests/minesweeper-solver.test.js#L64) | `prefers an outer-shell target when equally valid deductions are available` |
| [L72](../tests/minesweeper-solver.test.js#L72) | `explains a generalized set-cover deduction with labeled human-readable clues` |
| [L104](../tests/minesweeper-solver.test.js#L104) | `turns the former 64-layout beginner hint into a three-gold-clue proof` |
| [L138](../tests/minesweeper-solver.test.js#L138) | `uses the same cover relation to prove every remaining cell is a mine` |
| [L154](../tests/minesweeper-solver.test.js#L154) | `enumerates every consistent layout to find globally certain cells` |
| [L196](../tests/minesweeper-solver.test.js#L196) | `labels an unavoidable 50-50 choice as a guess with exact probability` |
| [L216](../tests/minesweeper-solver.test.js#L216) | `records the rejected safe assumption when enumeration proves a mine` |
| [L236](../tests/minesweeper-solver.test.js#L236) | `returns an explicit fixed-rule guess when exact enumeration exceeds its budget` |
| [L255](../tests/minesweeper-solver.test.js#L255) | `uses an easy-to-tap outer corner as the protected first medium-board hint` |
| [L263](../tests/minesweeper-solver.test.js#L263) | `supports the advanced 7x7x7 mission and starts from an outer corner` |
| [L272](../tests/minesweeper-solver.test.js#L272) | `never suggests a cell that has already been removed by sector purge` |

### mobile-ui.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证移动端选择抑制、大厅宽度、手势、五键操作区、层级和提示面板结构。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L9](../tests/mobile-ui.test.js#L9) | `suppresses native mobile selection without blocking form text selection` |
| [L17](../tests/mobile-ui.test.js#L17) | `keeps the lobby at its 420px design width until the viewport is genuinely narrower` |
| [L24](../tests/mobile-ui.test.js#L24) | `accepts one mobile lobby tap while letting the same action retry only its existing session` |
| [L42](../tests/mobile-ui.test.js#L42) | `uses a five-button mobile dock with slices and an anchored guided-cell pointer` |
| [L56](../tests/mobile-ui.test.js#L56) | `keeps center locking independent from camera presets and exposes recenter outside the five-button dock` |
| [L75](../tests/mobile-ui.test.js#L75) | `uses a stationary mobile long-press for matrix pan and cleans up every interrupted gesture` |
| [L89](../tests/mobile-ui.test.js#L89) | `separates number auto-open from direct cell reduction on desktop and mobile` |
| [L105](../tests/mobile-ui.test.js#L105) | `stacks the tutorial action above the solver hint and mobile dock` |
| [L123](../tests/mobile-ui.test.js#L123) | `keeps mobile drawer actions clear of the guide hint panel` |
| [L141](../tests/mobile-ui.test.js#L141) | `lets players exit reasoning mode and uses a transparent clue reticle` |

### pointer-targeting.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证三维射线命中、数字纹理、代理壳、双键手势和拖拽取消不会误选格子。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L36](../tests/pointer-targeting.test.js#L36) | `visible inner cubes win over invisible clue proxy shells` |
| [L48](../tests/pointer-targeting.test.js#L48) | `a real visible number sprite keeps priority by ray distance` |
| [L60](../tests/pointer-targeting.test.js#L60) | `transparent number padding passes through while visible glyph pixels own the target` |
| [L91](../tests/pointer-targeting.test.js#L91) | `number hit testing samples the exact CanvasTexture row without mirrored false hits` |
| [L120](../tests/pointer-targeting.test.js#L120) | `the full-size clue proxy remains a fallback and ignores unavailable cells` |
| [L133](../tests/pointer-targeting.test.js#L133) | `the first-button anchor owns a two-button gesture` |
| [L142](../tests/pointer-targeting.test.js#L142) | `a glowing unopened cube owns the gesture even when a number sprite wins the new raycast` |
| [L162](../tests/pointer-targeting.test.js#L162) | `an absent number hover is null-safe while a visible clue becomes the focus target` |
| [L172](../tests/pointer-targeting.test.js#L172) | `an unavailable visual focus cancels instead of silently retargeting another cube` |
| [L186](../tests/pointer-targeting.test.js#L186) | `a focused cell without a live mesh is never considered actionable` |
| [L197](../tests/pointer-targeting.test.js#L197) | `a highlighted revealed number remains locked to the auto-open action` |
| [L208](../tests/pointer-targeting.test.js#L208) | `real camera drags cancel while small button jitter keeps the locked focus` |
| [L217](../tests/pointer-targeting.test.js#L217) | `button-state merging remembers the first button when a driver reports only the second` |

### reasoning-coordinate-axes.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证推理期间显示三维坐标轴，并在建议行动或教学推理结束后隐藏。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L7](../tests/reasoning-coordinate-axes.test.js#L7) | `shows a labeled 3D coordinate axis only while reasoning is active` |
| [L20](../tests/reasoning-coordinate-axes.test.js#L20) | `hides solver axes after the suggested target action is completed` |
| [L27](../tests/reasoning-coordinate-axes.test.js#L27) | `hides guided axes when the current teaching deduction ends` |

### release-pipeline.test.js

- 分类：版本、供应链、安全与发布门禁
- 自动化层级：交付链自动化
- 套件目的：验证 CI、正式标签发布、人工恢复发布、Cloudflare 部署和线上验证的门禁顺序。
- 任一用例失败：停止发布，定位版本漂移、依赖漂移、安全头、工作流顺序或部署门禁缺失。不得跳过失败步骤；修复后从完整测试重新开始。
- 有效性评审：仅在正式更换发布平台、版本规则、安全基线或依赖管理方式时评审更新，并保留同等或更强的门禁。

| 源码 | 测试内容 |
| --- | --- |
| [L34](../tests/release-pipeline.test.js#L34) | `CI runs complete tests before the Cloudflare deployment dry run` |
| [L45](../tests/release-pipeline.test.js#L45) | `release workflow deploys only unsuffixed semantic tags from an approved branch` |
| [L63](../tests/release-pipeline.test.js#L63) | `release remains draft until deploy and live verification both succeed` |
| [L80](../tests/release-pipeline.test.js#L80) | `manual release recovery only publishes an existing tag after live verification` |
| [L108](../tests/release-pipeline.test.js#L108) | `package scripts keep local deployment and release verification gates available` |
| [L119](../tests/release-pipeline.test.js#L119) | `live-version verification exits naturally after success on Windows` |

### release-version.test.js

- 分类：版本、供应链、安全与发布门禁
- 自动化层级：交付链自动化
- 套件目的：验证 package、锁文件、公开元数据、缓存参数和 SemVer 标签保持一致。
- 任一用例失败：停止发布，定位版本漂移、依赖漂移、安全头、工作流顺序或部署门禁缺失。不得跳过失败步骤；修复后从完整测试重新开始。
- 有效性评审：仅在正式更换发布平台、版本规则、安全基线或依赖管理方式时评审更新，并保留同等或更强的门禁。

| 源码 | 测试内容 |
| --- | --- |
| [L22](../tests/release-version.test.js#L22) | `release identity is synchronized across package, lockfile, and public metadata` |
| [L35](../tests/release-version.test.js#L35) | `release tags use semantic versions and reject mismatches` |
| [L51](../tests/release-version.test.js#L51) | `all browser cache parameters use the product release version` |
| [L65](../tests/release-version.test.js#L65) | `release check accepts the matching tag and rejects a different tag` |

### replay-engine.test.js

- 分类：游戏规则与权威状态
- 自动化层级：行为级自动化
- 套件目的：验证成功回放只记录有效行动，并正确处理撤回、去重、Reduction、Auto-Purge 和恢复。
- 任一用例失败：先用失败用例的固定输入复现，再检查规则实现、状态迁移和测试夹具。若规则确实被产品决策修改，应在同一变更中同步需求、实现和断言，不能只放宽断言。
- 有效性评审：内部重构不应使这类行为契约失效；只有公开规则、协议或兼容边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L52](../tests/replay-engine.test.js#L52) | `keeps failed and rewound attempts out of the completed successful route` |
| [L76](../tests/replay-engine.test.js#L76) | `omits incorrect flags and flag removals while de-duplicating a correct flag` |
| [L106](../tests/replay-engine.test.js#L106) | `records a correct Reduction after a failed Reduction rewind, including clue updates and waves` |
| [L132](../tests/replay-engine.test.js#L132) | `records an atomic Sector Purge with the correct flag, updated clues, and cascade wave` |
| [L161](../tests/replay-engine.test.js#L161) | `records both halves of a combined Reduction and Auto-Purge event` |
| [L190](../tests/replay-engine.test.js#L190) | `persists an in-progress tape across restore, ignores duplicates, and includes the final winning step` |
| [L221](../tests/replay-engine.test.js#L221) | `restores legacy rooms without replay fields and restart creates a clean run` |

### return-to-lobby.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证桌面与移动端都能安全返回大厅，清理状态、URL、重连和房间成员关系。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L13](../tests/return-to-lobby.test.js#L13) | `shows one always-available localized main-menu return control on desktop and mobile` |
| [L25](../tests/return-to-lobby.test.js#L25) | `returns from either game mode by clearing stale room and presentation state` |
| [L37](../tests/return-to-lobby.test.js#L37) | `RoomClient disconnect stops reconnection, clears the room URL, and rejects stale commands` |
| [L105](../tests/return-to-lobby.test.js#L105) | `RoomClient leave notifies the room before clearing its local session` |

### reveal-animation.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证直接揭示、递归波、快照同步和清除旗帜动画的时间契约。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L9](../tests/reveal-animation.test.js#L9) | `opens every player-selected first wave with one fast consistent timing` |
| [L20](../tests/reveal-animation.test.js#L20) | `paces recursive cells as overlapping outward wave fronts` |
| [L32](../tests/reveal-animation.test.js#L32) | `keeps non-action snapshot reconciliation on the neutral reveal timing` |
| [L41](../tests/reveal-animation.test.js#L41) | `holds a newly placed purge flag through its rise before the island dissolves` |

### room-client-id.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证不同浏览器 Crypto 能力下都能生成可靠且不重复的请求 ID。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L8](../tests/room-client-id.test.js#L8) | `uses native randomUUID when the browser provides it` |
| [L13](../tests/room-client-id.test.js#L13) | `uses getRandomValues on insecure mobile HTTP origins without randomUUID` |
| [L28](../tests/room-client-id.test.js#L28) | `still creates distinct request IDs when the Crypto API is unavailable` |
| [L37](../tests/room-client-id.test.js#L37) | `falls through when a partial browser implementation throws` |

### room-client-safari-reconnect.test.js

- 分类：客户端运行时与交互逻辑
- 自动化层级：行为级或源码契约自动化
- 套件目的：验证 Safari 与 IP 主机上的 WebSocket 卡顿、异常、并行尝试和正常欢迎流程。
- 任一用例失败：先判断是浏览器行为、会话状态还是事件路由发生回归，再修复实现。若仅重构内部结构，应把断言迁移到等价的公开行为，不能直接删除保护。
- 有效性评审：用户可观察行为不变时测试仍应有效；事件模型、输入协议或持久化边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L181](../tests/room-client-safari-reconnect.test.js#L181) | `detects literal IPv4 and IPv6 hosts without hedging normal domains` |
| [L199](../tests/room-client-safari-reconnect.test.js#L199) | `retries a stalled Safari WebSocket without creating a second room` |
| [L227](../tests/room-client-safari-reconnect.test.js#L227) | `retries when Safari leaves the first WebSocket connecting without any event` |
| [L248](../tests/room-client-safari-reconnect.test.js#L248) | `hedges a stuck IP WebSocket in parallel and joins through the first candidate that opens` |
| [L283](../tests/room-client-safari-reconnect.test.js#L283) | `does not kill a slow but healthy Safari welcome at the old 1600ms deadline` |
| [L304](../tests/room-client-safari-reconnect.test.js#L304) | `recovers when Safari throws synchronously while constructing the first WebSocket` |
| [L321](../tests/room-client-safari-reconnect.test.js#L321) | `does not reconnect when the first WebSocket reaches welcome normally` |

### room-engine.test.js

- 分类：游戏规则与权威状态
- 自动化层级：行为级自动化
- 套件目的：验证权威房间规则、隐私、首挖保护、递归揭示、去重、复活、权限、存档和初级布局。
- 任一用例失败：先用失败用例的固定输入复现，再检查规则实现、状态迁移和测试夹具。若规则确实被产品决策修改，应在同一变更中同步需求、实现和断言，不能只放宽断言。
- 有效性评审：内部重构不应使这类行为契约失效；只有公开规则、协议或兼容边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L36](../tests/room-engine.test.js#L36) | `normalizes three-dimensional boards and enforces the 60 percent mine limit` |
| [L49](../tests/room-engine.test.js#L49) | `normalizes Auto-Purge and Reduction independently while preserving legacy rulesets` |
| [L89](../tests/room-engine.test.js#L89) | `restores a legacy Reduction room with both advanced features enabled` |
| [L108](../tests/room-engine.test.js#L108) | `keeps mines private, guarantees the first cell is safe, and reveals mines only after loss` |
| [L128](../tests/room-engine.test.js#L128) | `publishes recursive dig cells as ordered reveal waves` |
| [L145](../tests/room-engine.test.js#L145) | `chords every unflagged neighbor when the adjacent flag count matches the clue` |
| [L165](../tests/room-engine.test.js#L165) | `publishes chord candidates as one fast first wave before recursive expansion` |
| [L182](../tests/room-engine.test.js#L182) | `does nothing when a chord clue does not have the same number of adjacent flags` |
| [L198](../tests/room-engine.test.js#L198) | `triggers a mine without revealing safe neighbors when chord flags are wrong` |
| [L216](../tests/room-engine.test.js#L216) | `acknowledges duplicate commands without applying them twice` |
| [L227](../tests/room-engine.test.js#L227) | `persists an ad revival deadline and advances it authoritatively` |
| [L246](../tests/room-engine.test.js#L246) | `task rewind only undoes the mine hit and preserves the current minefield` |
| [L286](../tests/room-engine.test.js#L286) | `only the host can reconfigure a room` |
| [L292](../tests/room-engine.test.js#L292) | `intentional leave removes a squad member and frees the seat` |
| [L304](../tests/room-engine.test.js#L304) | `host leave transfers control to the earliest remaining squad member` |
| [L322](../tests/room-engine.test.js#L322) | `a new member becomes host when reusing an empty squad room` |
| [L333](../tests/room-engine.test.js#L333) | `stores semantic activity data so every client can localize it` |
| [L344](../tests/room-engine.test.js#L344) | `keeps task mode private and exposes the selected mode in snapshots` |
| [L356](../tests/room-engine.test.js#L356) | `constructs the complete dispersed three-layer beginner candidate space at runtime` |
| [L379](../tests/room-engine.test.js#L379) | `shadow validation accepts a no-guess route and rejects a visually valid forced guess` |
| [L384](../tests/room-engine.test.js#L384) | `beginner shadow validation only accepts certain rules with a directly explainable proof` |
| [L394](../tests/room-engine.test.js#L394) | `gates the beginner first action without initializing or leaking the selected mine layout` |
| [L440](../tests/room-engine.test.js#L440) | `selects varied solver-verified beginner layouts from seeded random candidate orders` |
| [L450](../tests/room-engine.test.js#L450) | `pathological random sources remain bounded and can never bypass shadow validation` |
| [L462](../tests/room-engine.test.js#L462) | `the public solver completes generated beginner layouts with certain moves and all three flags` |
| [L511](../tests/room-engine.test.js#L511) | `restores legacy rooms as multiplayer squad rooms` |

### sector-purge-ui.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证 Sector Purge 与 Reduction 的视觉状态、动画、进度、移动端提示和关卡路由源码契约。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L11](../tests/sector-purge-ui.test.js#L11) | `renders the Sector Purge identity and live elimination banner` |
| [L18](../tests/sector-purge-ui.test.js#L18) | `keeps legacy physical purge holes removed across slicing and animates them` |
| [L27](../tests/sector-purge-ui.test.js#L27) | `uses one fast first-cell timing and a slower overlapping recursive cadence` |
| [L35](../tests/sector-purge-ui.test.js#L35) | `rewrites an Auto-Purged mine as a clue and previews its flag before reveal` |
| [L50](../tests/sector-purge-ui.test.js#L50) | `replay keeps replacement clues while retaining legacy physical purge holes` |
| [L59](../tests/sector-purge-ui.test.js#L59) | `keeps the legacy physical-hole flag preview and dissolve animation compatible` |
| [L68](../tests/sector-purge-ui.test.js#L68) | `plays dig, chord, and Reduction recursion as delayed BFS wave fronts` |
| [L87](../tests/sector-purge-ui.test.js#L87) | `refreshes recalculated numbers, hides only zero clues, and shows remaining mines` |
| [L94](../tests/sector-purge-ui.test.js#L94) | `derives progress from the active board after Reduction creates a new safe clue` |
| [L101](../tests/sector-purge-ui.test.js#L101) | `keeps the purge notice compact on mobile and below the top verification area` |
| [L106](../tests/sector-purge-ui.test.js#L106) | `progresses campaign features from classic to auto purge to the combined toolset` |
| [L117](../tests/sector-purge-ui.test.js#L117) | `keeps every campaign chapter open and moves free play configuration into the game` |
| [L138](../tests/sector-purge-ui.test.js#L138) | `maps every Free Mode lobby level to its matching board with both add-ons enabled` |
| [L172](../tests/sector-purge-ui.test.js#L172) | `queues Free Mode presets and waits for the authoritative snapshot before replacing the board` |
| [L204](../tests/sector-purge-ui.test.js#L204) | `enters the hidden Ultimate chapter after hard, then returns to a hard Free Mode board` |
| [L220](../tests/sector-purge-ui.test.js#L220) | `keeps number auto-open separate from direct cell reduction` |
| [L229](../tests/sector-purge-ui.test.js#L229) | `shows an explosion without inventing a mine when Reduction targets a safe cell` |

### sector-purge.test.js

- 分类：游戏规则与权威状态
- 自动化层级：行为级自动化
- 套件目的：验证孤立区域识别、线索重算、连锁揭示、Reduction 与 Auto-Purge 的独立及组合规则。
- 任一用例失败：先用失败用例的固定输入复现，再检查规则实现、状态迁移和测试夹具。若规则确实被产品决策修改，应在同一变更中同步需求、实现和断言，不能只放宽断言。
- 有效性评审：内部重构不应使这类行为契约失效；只有公开规则、协议或兼容边界正式改变时才评审更新。

| 源码 | 测试内容 |
| --- | --- |
| [L14](../tests/sector-purge.test.js#L14) | `finds a fully flagged mine island and identifies the clues that need recalculation` |
| [L28](../tests/sector-purge.test.js#L28) | `tracks recursive depth from all zero-clue fronts with one multi-source BFS` |
| [L43](../tests/sector-purge.test.js#L43) | `does not purge a flagged mine while it is still face-connected to an unknown cube` |
| [L54](../tests/sector-purge.test.js#L54) | `does not purge an island containing an incorrect flag` |
| [L65](../tests/sector-purge.test.js#L65) | `automatically purges a solved squad sector and publishes the removal event` |
| [L92](../tests/sector-purge.test.js#L92) | `does not invent a lead flag for a purge started by another action` |
| [L105](../tests/sector-purge.test.js#L105) | `recalculates connected clues and keeps every non-zero number visible` |
| [L128](../tests/sector-purge.test.js#L128) | `rewrites an Auto-Purged mine as the exact remaining adjacent mine count` |
| [L148](../tests/sector-purge.test.js#L148) | `cascades into hidden safe cells when a recalculated clue drops to zero` |
| [L172](../tests/sector-purge.test.js#L172) | `continues a direct reveal wave before a same-action Sector Purge cascade` |
| [L186](../tests/sector-purge.test.js#L186) | `keeps sector purge disabled during the fixed beginner tutorial` |
| [L198](../tests/sector-purge.test.js#L198) | `keeps classic flags on the board and never performs reduction` |
| [L216](../tests/sector-purge.test.js#L216) | `keeps number auto-open separate from direct cell reduction` |
| [L236](../tests/sector-purge.test.js#L236) | `direct reduction rewrites the removed mine as a clue when another mine is adjacent` |
| [L259](../tests/sector-purge.test.js#L259) | `successive reductions recalculate an earlier rewritten mine clue and clear its flag` |
| [L284](../tests/sector-purge.test.js#L284) | `direct reduction on a safe unopened cell triggers failure` |
| [L303](../tests/sector-purge.test.js#L303) | `reduction recursively opens the safe region when recalculated clues drop to zero` |
| [L336](../tests/sector-purge.test.js#L336) | `keeps feature behavior independent with ${label}` |
| [L377](../tests/sector-purge.test.js#L377) | `a Reduction bridge removal immediately Auto-Purges the newly isolated flagged mine` |

### security-headers.test.js

- 分类：版本、供应链、安全与发布门禁
- 自动化层级：交付链自动化
- 套件目的：验证 HTML、API、静态资源、异常响应和 WebSocket 的安全头与缓存策略。
- 任一用例失败：停止发布，定位版本漂移、依赖漂移、安全头、工作流顺序或部署门禁缺失。不得跳过失败步骤；修复后从完整测试重新开始。
- 有效性评审：仅在正式更换发布平台、版本规则、安全基线或依赖管理方式时评审更新，并保留同等或更强的门禁。

| 源码 | 测试内容 |
| --- | --- |
| [L43](../tests/security-headers.test.js#L43) | `Cloudflare static-asset bypasses receive the same security baseline via _headers` |
| [L53](../tests/security-headers.test.js#L53) | `HTML responses receive browser security headers and must be revalidated` |
| [L70](../tests/security-headers.test.js#L70) | `API responses retain no-store and receive the same security baseline` |
| [L82](../tests/security-headers.test.js#L82) | `versioned self-hosted vendor assets receive long-lived immutable caching` |
| [L98](../tests/security-headers.test.js#L98) | `unversioned vendor paths are not accidentally made immutable` |
| [L112](../tests/security-headers.test.js#L112) | `WebSocket upgrade responses are returned unchanged` |
| [L128](../tests/security-headers.test.js#L128) | `the public socket route preserves a successful 101 upgrade response` |
| [L150](../tests/security-headers.test.js#L150) | `HTTP rejections on the WebSocket path still receive security headers` |
| [L162](../tests/security-headers.test.js#L162) | `thrown HTTP errors are also covered by the security baseline` |

### solver-explanation.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证求解证据以可读、可滚动的逐条证明呈现，而不是不可解释的文本块。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L9](../tests/solver-explanation.test.js#L9) | `renders one readable proof row for every numbered gold clue` |
| [L19](../tests/solver-explanation.test.js#L19) | `styles the proof as a compact scroll-safe explanation instead of one opaque sentence` |

### soundtrack.test.js

- 分类：美术、字体、音频与静态资源
- 自动化层级：资源完整性与映射自动化
- 套件目的：验证各场景配乐路由、音色差异、偏好与音量持久化、音频失败回退和 UI 控制。
- 任一用例失败：检查配置映射、文件存在性、尺寸/格式、缓存版本和运行时引用。素材替换应改配置或资源，不应把当前角色文件名写死进测试。
- 有效性评审：允许更换具体素材，但完整覆盖、可加载、版本化和配置驱动这些契约必须保留。

| 源码 | 测试内容 |
| --- | --- |
| [L233](../tests/soundtrack.test.js#L233) | `routes the lobby, every campaign chapter, and multiplayer to its own score` |
| [L253](../tests/soundtrack.test.js#L253) | `free and custom boards follow their real matrix scale` |
| [L266](../tests/soundtrack.test.js#L266) | `all six original score profiles have distinct composition signatures` |
| [L288](../tests/soundtrack.test.js#L288) | `music preference defaults on and persists independently from sound effects` |
| [L310](../tests/soundtrack.test.js#L310) | `normalizes and persists independent music and sound-effect volumes` |
| [L340](../tests/soundtrack.test.js#L340) | `doubles the score master again while keeping sound effects independent` |
| [L358](../tests/soundtrack.test.js#L358) | `fails quiet when AudioContext is unavailable or cannot resume` |
| [L384](../tests/soundtrack.test.js#L384) | `starts a complete graph, keeps identical scenes, and cleans switched sessions` |
| [L437](../tests/soundtrack.test.js#L437) | `volume zero stops playback and a restored volume resumes the desired score` |
| [L473](../tests/soundtrack.test.js#L473) | `changes a running music graph volume without restarting its track` |
| [L490](../tests/soundtrack.test.js#L490) | `integrates the score with shared Safari-safe audio, room state, and lobby exit` |
| [L504](../tests/soundtrack.test.js#L504) | `keeps music independently controllable on desktop and in the mobile controls drawer` |
| [L519](../tests/soundtrack.test.js#L519) | `offers persistent live volume sliders for music and every sound effect` |
| [L548](../tests/soundtrack.test.js#L548) | `ships the selected mine-hit PCM sample as a shared relative web and Steam asset` |
| [L563](../tests/soundtrack.test.js#L563) | `mine-hit playback fetches and decodes once, uses the SFX bus, and disconnects ended sources` |
| [L593](../tests/soundtrack.test.js#L593) | `mine-hit loading fails quietly and retries after fetch or decode errors` |
| [L615](../tests/soundtrack.test.js#L615) | `mine-hit playback respects mute changes during loading and unavailable audio contexts` |
| [L635](../tests/soundtrack.test.js#L635) | `the game plays the selected sample through live volume and mute controls without the old synth` |

### steam-packaging.test.js

- 分类：版本、供应链、安全与发布门禁
- 自动化层级：交付链自动化
- 套件目的：验证 Steam 单机运行时锁定、桌面安全边界、存档恢复 URL、SteamPipe 预览配置和网页资源打包一致性。
- 任一用例失败：停止发布，定位版本漂移、依赖漂移、安全头、工作流顺序或部署门禁缺失。不得跳过失败步骤；修复后从完整测试重新开始。
- 有效性评审：仅在正式更换发布平台、版本规则、安全基线或依赖管理方式时评审更新，并保留同等或更强的门禁。

| 源码 | 测试内容 |
| --- | --- |
| [L23](../tests/steam-packaging.test.js#L23) | `runtime profiles keep web multiplayer separate from the locked Steam single-player release` |
| [L42](../tests/steam-packaging.test.js#L42) | `desktop resume URLs persist only canonical local solo save identifiers` |
| [L54](../tests/steam-packaging.test.js#L54) | `SteamPipe configuration defaults to preview and maps the verified content directory recursively` |
| [L83](../tests/steam-packaging.test.js#L83) | `desktop shell and package scripts enforce an offline-only Steam release boundary` |

### story-art.test.js

- 分类：美术、字体、音频与静态资源
- 自动化层级：资源完整性与映射自动化
- 套件目的：验证每条故事路线都有配置化插图、对话图尺寸适用，并禁止应用代码写死当前素材路径。
- 任一用例失败：检查配置映射、文件存在性、尺寸/格式、缓存版本和运行时引用。素材替换应改配置或资源，不应把当前角色文件名写死进测试。
- 有效性评审：允许更换具体素材，但完整覆盖、可加载、版本化和配置驱动这些契约必须保留。

| 源码 | 测试内容 |
| --- | --- |
| [L23](../tests/story-art.test.js#L23) | `ships a configured guide illustration for every story route` |
| [L43](../tests/story-art.test.js#L43) | `uses mobile-sized master-derived art for each dialogue beat` |
| [L57](../tests/story-art.test.js#L57) | `reuses the advanced chapter main art for every advanced dialogue` |

### success-replay-ui.test.js

- 分类：UI 结构与源码契约
- 自动化层级：源码级自动化，必须配合人工视觉验收
- 套件目的：验证成功回放入口、HUD、暂停退出、动画路径、多人/单人路由、移动端和双语文案。
- 任一用例失败：检查 DOM、CSS、可访问性属性和事件绑定是否丢失。通过源码测试不代表视觉正确，修复后仍必须执行发布前 UI 人工手册。
- 有效性评审：大规模 UI 架构重构时可替换选择器或结构断言，但必须保留等价的用户行为保护，并由人工清单确认像素级结果。

| 源码 | 测试内容 |
| --- | --- |
| [L70](../tests/success-replay-ui.test.js#L70) | `Free Mode Continue Exploration starts exactly one fresh board with the current preset or custom settings` |
| [L128](../tests/success-replay-ui.test.js#L128) | `campaign completion still advances chapters instead of using the Free Mode restart` |
| [L145](../tests/success-replay-ui.test.js#L145) | `exposes separate solo and multiplayer replay entries plus an accessible replay HUD` |
| [L159](../tests/success-replay-ui.test.js#L159) | `makes successful replay a prominent primary action on both completion surfaces` |
| [L179](../tests/success-replay-ui.test.js#L179) | `offers replay only for won snapshots and routes squad wins to the modal and solo wins to the guide` |
| [L193](../tests/success-replay-ui.test.js#L193) | `runs replay locally without sending gameplay commands and buffers authoritative snapshots while it plays` |
| [L212](../tests/success-replay-ui.test.js#L212) | `starts from a clean visual board, locks interaction, and uses the existing reveal and purge animation paths` |
| [L232](../tests/success-replay-ui.test.js#L232) | `pauses between replay steps, resumes explicitly, and exposes a direct exit` |
| [L247](../tests/success-replay-ui.test.js#L247) | `finishes with replay celebration and restores the newest authoritative snapshot on completion or exit` |
| [L265](../tests/success-replay-ui.test.js#L265) | `keeps replay independent from the hard-to-Ultimate-to-Free-Mode campaign progression` |
| [L285](../tests/success-replay-ui.test.js#L285) | `keeps the replay controls compact on phones and removes competing mobile chrome during playback` |
| [L301](../tests/success-replay-ui.test.js#L301) | `localizes replay entry, progress, pause, resume, exit, and completion copy in both languages` |

### tutorial-triggers.test.js

- 分类：求解器、推理证据与教程判定
- 自动化层级：算法行为级自动化
- 套件目的：验证自动揭示教学只在新产生且仍可行动的确定机会出现，并可精确完成。
- 任一用例失败：使用失败棋盘固定复现，检查邻域、约束、概率、证据链和目标选择。不得为了让随机样例通过而降低正确性断言。
- 有效性评审：只要三维扫雷规则和教学正确性标准不变就应持续有效；算法可以重写，但同样输入必须保持安全与可解释性。

| 源码 | 测试内容 |
| --- | --- |
| [L12](../tests/tutorial-triggers.test.js#L12) | `finds a revealed clue whose mines are fully flagged and still has hidden neighbors` |
| [L22](../tests/tutorial-triggers.test.js#L22) | `does not suggest auto-reveal before the clue has enough flags` |
| [L30](../tests/tutorial-triggers.test.js#L30) | `does not suggest auto-reveal when flags exceed the clue` |
| [L38](../tests/tutorial-triggers.test.js#L38) | `does not suggest auto-reveal when no unopened unflagged neighbor remains` |
| [L50](../tests/tutorial-triggers.test.js#L50) | `revalidates one exact clue and returns its latest actionable hidden count` |
| [L70](../tests/tutorial-triggers.test.js#L70) | `exact target revalidation expires after every actionable neighbor is opened or removed` |
| [L85](../tests/tutorial-triggers.test.js#L85) | `detects a newly available auto-reveal clue without relying on total flag count` |
| [L108](../tests/tutorial-triggers.test.js#L108) | `does not trigger from an existing opportunity when the newly added flag is elsewhere` |
| [L130](../tests/tutorial-triggers.test.js#L130) | `does not trigger without a newly added flag` |
| [L148](../tests/tutorial-triggers.test.js#L148) | `does not retrigger a clue that was already ready before a flag was moved` |
| [L163](../tests/tutorial-triggers.test.js#L163) | `chooses deterministically between multiple clues completed by the same new flag` |
| [L188](../tests/tutorial-triggers.test.js#L188) | `does not trigger when the newly completed clue has no actionable hidden neighbor` |
| [L203](../tests/tutorial-triggers.test.js#L203) | `completes the lesson only for a new successful chord reveal` |

### ui-approval.test.js

- 分类：版本、供应链、安全与发布门禁
- 自动化层级：交付链自动化
- 套件目的：验证 UI 人工验收记录必须绑定当前源码摘要、版本、完整场景和可追溯证据。
- 任一用例失败：停止发布，定位版本漂移、依赖漂移、安全头、工作流顺序或部署门禁缺失。不得跳过失败步骤；修复后从完整测试重新开始。
- 有效性评审：仅在正式更换发布平台、版本规则、安全基线或依赖管理方式时评审更新，并保留同等或更强的门禁。

| 源码 | 测试内容 |
| --- | --- |
| [L31](../tests/ui-approval.test.js#L31) | `accepts a complete approval only when every configured visual scenario passed` |
| [L42](../tests/ui-approval.test.js#L42) | `rejects stale UI hashes, missing scenarios, and incomplete human evidence` |

### vendor-assets.test.js

- 分类：美术、字体、音频与静态资源
- 自动化层级：资源完整性与映射自动化
- 套件目的：验证运行时不依赖外部字体/CDN，固定版本资源、字体权重和许可证完整。
- 任一用例失败：检查配置映射、文件存在性、尺寸/格式、缓存版本和运行时引用。素材替换应改配置或资源，不应把当前角色文件名写死进测试。
- 有效性评审：允许更换具体素材，但完整覆盖、可加载、版本化和配置驱动这些契约必须保留。

| 源码 | 测试内容 |
| --- | --- |
| [L31](../tests/vendor-assets.test.js#L31) | `the application has no runtime Google Fonts or jsDelivr dependency` |
| [L39](../tests/vendor-assets.test.js#L39) | `vendored OrbitControls resolves the local pinned Three.js module` |
| [L44](../tests/vendor-assets.test.js#L44) | `only the selected local WOFF2 weights are declared` |
| [L58](../tests/vendor-assets.test.js#L58) | `vendored runtime files and upstream licenses are present` |
