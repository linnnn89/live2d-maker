# 外部技能注册表（需要借外部技能时才读本文件）

收录与 PSD / Live2D / 2D 创作相关的外部技能。**加载纪律：一次只加载命中触发条件的 1～2 个，读完即用，禁止批量预读。** 未列出的技能按同样方式自查触发条件。

三类来源，加载方式不同：

| 来源 | 位置 | 加载方式 |
| :--- | :--- | :--- |
| A. Hermes 已装技能 | Hermes 技能库 | `skill_view(name)`；深参考 `skill_view(name, file_path="references/…")` |
| B. 本机 `.agents` 技能 | 单技能：`~/.agents/skills/<name>/SKILL.md`<br>Blender 手册：`~/.agents/skills/blender-skill/<分组>/<手册名>/MANUAL.md` | `read_file`，只读命中的那一个；Blender 手册须先读入口再路由（见 B 段） |
| C. GitHub 协作技能 | Hermes 技能库 | `skill_view(name)`，开源协作流程用 |

## A. Hermes 已装技能

| 技能 | 触发条件 | 备注 |
| :--- | :--- | :--- |
| `live2d-studio` 内置深参考 | 模型修复、运行时分流、参考对齐 | 已吸收原 `live2d-psd-model-repair`（8 refs + 3 scripts）与 `reference-art-alignment`（2 refs + 1 script）；旧技能无需安装 |
| `grounded-citations` | 产出需要引用可核验来源的报告 | 合规性文档用 |
| `sdlc-review` | 交接/验收评审 | 发布前把关 |

## B. 本机 `.agents` 技能（2D/Live2D 相关子集）

本机 `~/.agents/skills` 共 **18 个技能**。其中 Blender 侧已收敛为**单一入口** `blender-skill`（内含 123 篇手册，分 10 组），另有独立技能 `blender-mcp` 负责 MCP 驱动层：安装与客户端接线、端口 9876 预检、safe mode 与遥测/隐私控制、Poly Haven / Sketchfab / Hyper3D 等资产库导入、导出到磁盘、连接排障。

**两级加载纪律**：Blender 手册**不再是独立技能**，按名字读平铺路径会读空。顺序固定为：
① 读入口 `~/.agents/skills/blender-skill/SKILL.md` → ② 按其路由表进 `<分组>/INDEX.md` → ③ 只读命中的那一篇 `<手册名>/MANUAL.md`。

| 手册 / 技能 | 位置 | 触发条件 |
| :--- | :--- | :--- |
| `source-part-segmentation` | `blender-skill/08-reference-locked/` | See-through 后仍有粘连/遮挡歧义/部件数不符时，生成具名 masks、部件清单与歧义报告；不直接产出 Live2D PSD，不按对称性臆造部件 |
| `contour-to-mesh` | `blender-skill/02-modeling/` | 仅用于 Blender/3D 底模或 mascot/logo 模板复刻；不得把其网格流程直接套到 Cubism ArtMesh |
| `texture-driven-mesh-fitting` | `blender-skill/03-surfacing/` | 仅用于 Blender/3D 对照或底模的 mesh/UV 拟合；不得直接用于 Cubism ArtMesh，Live2D 网格问题仍走 `route-model-repair` |
| `texture-workflow` | `blender-skill/03-surfacing/` | Blender/3D 图集、AO/曲率/法线烘焙与贴图内存优化；纯 PSD/Live2D 主线不加载 |
| `texture-state-animation` | `blender-skill/03-surfacing/` | Blender/导出运行时的多贴图状态动画；Live2D 参数驱动透明度优先用 PSD2Live/Cubism 配方，不套用 Python handler |
| `rigging` | `blender-skill/05-motion/` | 骨骼/IK-FK/权重/面部 rig（Blender 侧工作） |
| `animation` | `blender-skill/05-motion/` | 游戏级动作循环、NLA、Graph Editor（Blender 侧） |
| `animation-quality-gate` | `blender-skill/09-quality-gates/` | 动作/形变渲染后验收：接触表、剪影稳定性、闪烁 |
| `reference-analysis-validator` | `blender-skill/08-reference-locked/` | 借用 manifest/overlay/bbox/centroid/IoU 方法；其 Blender/logo 默认阈值不直接继承，Live2D 阈值必须按 fixture 固定 |
| `reference-look-calibration` | `blender-skill/08-reference-locked/` | Blender 材质/光照/色彩校准；纯 2D 美术对齐优先用 `route-art-repair` |
| `multiview-fit-loop` | `blender-skill/08-reference-locked/` | 多视图 3D 模板对齐闭环；单视图 Live2D 参考对齐不加载 |
| `orthographic-registration` | `blender-skill/08-reference-locked/` | 正交 3D 参考视图配准；普通 Live2D 立绘对齐不加载 |
| `landmark-fit-repair` | `blender-skill/08-reference-locked/` | 借用命名地标 schema 与差量报告；Live2D 落地仍修改 source/manifest/PSD，不执行 Blender recipe |
| `fit-repair-optimizer` | `blender-skill/08-reference-locked/` | 把失配报告转成修复队列，串行/并行排障 |
| `qa-review` | `blender-skill/09-quality-gates/` | 资产出货前 QA 门禁：清单、命名审计、ship/no-ship |
| `quality-refinement-autoloop` | `blender-skill/01-orchestration/` | 结果不达标时的自精化循环（修资产 or 补技能） |
| `asset-optimization` / `export-pipeline` | `blender-skill/07-delivery/` | 面数/拓扑/UV 优化与多格式导出验证（FBX/GLTF/OBJ） |
| `character-artist` | `blender-skill/02-modeling/` | 角色建模规范：面部拓扑、发服结构、动画友好布线 |
| 风格类（`anime-style` `cartoon-style` `chibi-style` `pixel-art-style` `manga-style` 等） | `blender-skill/10-art-direction/` | 需要按特定画风重制美术时，只加载目标风格那一个 |

> B 类多为 Blender/MCP 流程能力：**2D PSD/Live2D 主线用不上就不加载**；仅当工作跨界（拆层前的底模、3D 对照、贴图烘焙）才按触发条件取用。其中 Blender 手册一律经 `blender-skill` 入口两级抵达，不得凭名字猜路径。

## C. GitHub 协作技能（开源维护用）

| 技能 | 触发条件 |
| :--- | :--- |
| `github-auth` | 首次配置 gh / token / SSH |
| `github-issues` | 建 issue、分诊、打标签 |
| `github-pr-workflow` | 开分支 → 提交 → PR → CI → 合并全流程 |
| `github-code-review` | 审 PR diff、行内评论 |
| `github-repo-management` | 建仓/发 Release（PSD2Live 发布包走 Releases） |

## 反模式

- 把注册表里的技能全部 `read_file`/`skill_view` 一遍"熟悉一下" —— 禁止。
- 为纯 2D PSD 问题加载 `blender-skill` 手册 —— 禁止。
- 按平铺路径 `~/.agents/skills/<手册名>/SKILL.md` 找 Blender 手册 —— 禁止；那些路径已不存在，会读空。只能经 `blender-skill` 入口路由。
- 复制外部技能全文进本仓库文档 —— 禁止；L3 索引只放**指针**（见 `skills/live2d-studio/references/index.md`）。
