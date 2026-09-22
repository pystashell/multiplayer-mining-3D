# 引导角色图映射

角色姓名、代号、职业和全部运行时图片统一配置在
`public/guide-character.js`。更换角色时只修改该文件，不需要逐页搜索界面、
剧情或样式表。

## 运行资源

| 游戏图位 | 项目资源 | 原始素材 |
| --- | --- | --- |
| `easy.main` | `public/assets/guide-zero-domain-cartographer.png` | `bc425831-eccd-498e-88c3-c4a9347b490f.png` |
| `medium.main` | `public/assets/parallax-neighbor-perspective.png` | `50ee4a73-9fc7-44cc-ac33-b4736bbeebda.png` |
| `hard.main`、`ultimate.main` | `public/assets/parallax-final-protocol.png` | `0c18f161-17b6-4929-8de8-44247f01aeb8.png` |
| `squad.main` | `public/assets/parallax-squad-command.png` | `327f7606-b7d5-4a3b-991e-c168c2c10dd2.png` |
| `easy.neighbors` | `public/assets/parallax-easy-neighbors.webp` | `051426c8-301d-4d5a-82cf-5dabf2f4ae66.png` |
| `easy.scan` | `public/assets/parallax-easy-scan.webp` | `8becbac2-40bb-4fe0-9f74-ea2c7d19b63a.png` |
| `easy.finish` | `public/assets/parallax-easy-finish.webp` | `665d1d5a-73f7-4513-806f-6cb32792eb70.png` |
| `medium.tip` | `public/assets/parallax-medium-tip.webp` | `ba236bb2-df37-42bf-9d91-1913e18c711c.png` |
| `medium.scan` | `public/assets/parallax-medium-scan.webp` | `be837666-6e0c-4654-b7d4-6c45023afaae.png` |
| `medium.inspect` | `public/assets/parallax-medium-inspect.webp` | `7900103b-024c-4ba6-ba35-d6cc37569f57.png` |
| `medium.ready` | `public/assets/parallax-medium-ready.webp` | `848aaf67-0d83-49c7-8bbd-2807a1873a58.png` |

四张章节主图保留原始 PNG。高级与多人主图使用不含旧世界观术语或角色编号
的版本。七张对话图由各自的独立原图居中裁切为
`692×1152`，并导出为 WebP，以保持现有对话界面的加载体积。
