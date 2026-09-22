# live2d-maker — PSD / Cubism / Live2D 集成工作区

把 PSD 处理、单图拆层、Live2D 自动建模、渲染验证工具与 Agent 技能经验整合为一个可复现工作区：**一个路由入口、四层分流文档**，人和 agent 各取所需，逐层下钻，不一次性灌满。

> Windows 用户克隆后运行 [`setup-windows.bat`](setup-windows.bat) 即可创建辅助 Python 环境并下载 PSD2Live 便携版；完整 See-through 与模型权重安装见 [`环境.md`](环境.md)。源码已包含 `psd2live/` 和 `see-through/`，GB 级权重与可下载运行时不进 Git。

> **当前状态：开发态可用，尚未通过开源发布 gate。** 技能包的路由与安全降级自包含，具体工具契约依赖其绑定的 `live2d-edit-tool` 工作区。
>
> 一句话：PSD 进来，分层 → 建模 → 验证 → 发布，每一步都有对应的操作手册和深度参考。

## 组件地图

| 组件 | 位置 | 职责 |
| :--- | :--- | :--- |
| **PSD2Live** | [`psd2live/`](psd2live/README.md) | 核心流水线：分层 PSD → 自动建模 → `.cmo3` / `.moc3` 导出（Kotlin/Gradle + MCP 接口） |
| **PSD2Live 便携版** | `portable/PSD2Live/` | jpype 起 JVM 的免构建导出器，脚本驱动 |
| **See-through** | [`see-through/`](see-through/README.md) | 单张立绘 → 多层全补绘 PSD 拆层（SIGGRAPH 2026 研究项目） |
| **live2d-viewer** | `live2d-viewer/` | 参数化渲染 harness：按参数/镜位出图，before/after 对比验证 |
| **Python 环境** | `python/` | 项目专用解释器（psd-tools / numpy / scipy / Pillow / playwright 等） |
| **技能包 + 文档** | [`skills/live2d-studio/`](skills/live2d-studio/SKILL.md) `docs/` | 多层路由技能包、工具链清单、外部技能注册表 |

## 快速开始

**Agent 入口只有一个**：[`skills/live2d-studio/SKILL.md`](skills/live2d-studio/SKILL.md)（L0 路由表，按症状分流；Hermes 宿主经技能加载，纯文件宿主直接读）。
进入后按 L0 → `references/route-*.md` → `references/pb-*.md` → `references/index.md` 逐层下钻，**每次只读一层**。

**人类**：按上表找组件；PSD2Live 深入阅读 [`psd2live/docs/README.md`](psd2live/docs/README.md)（自带文档地图）。

## 文档与技能索引

| 要找什么 | 去哪 |
| :--- | :--- |
| 按症状/任务分流（唯一入口） | [`skills/live2d-studio/SKILL.md`](skills/live2d-studio/SKILL.md) |
| 分域路线（输入拆层/生成/修复/美术/运行时/MCP） | `skills/live2d-studio/references/route-*.md` |
| 操作手册（备份重建/导出审计/渲染对比/嘴部修复/发布交接） | `skills/live2d-studio/references/pb-*.md` |
| 深度参考指针索引（含取用方式） | [`skills/live2d-studio/references/index.md`](skills/live2d-studio/references/index.md) |
| 工具链与路径重定位（权威正文） | [`docs/toolchain.md`](docs/toolchain.md) |
| 外部技能注册表（权威正文） | [`docs/skill-map.md`](docs/skill-map.md) |
| 交接记录（编号小节追加） | [`docs/HANDOFF.md`](docs/HANDOFF.md) |
| PSD2Live 完整文档 | [`psd2live/docs/README.md`](psd2live/docs/README.md) |

## 路由架构

```
L0 skills/live2d-studio/SKILL.md        路由表 + 红线（≤120 行，唯一常驻入口）
 ├─ L1 references/route-<domain>.md     分域判定树 + 精简编排（6 篇，≤200 行）
 │   ├─ L2 references/pb-<op>.md        单一操作 SOP（6 篇，≤220 行）
 │   └─ L3 references/index.md          深参考指针（按需取一篇；含 host-adapter/stubs）
 ├─ docs/toolchain.md                   工具与环境权威正文
 └─ docs/skill-map.md                   外部技能注册表权威正文
```

设计原则：L0/L1 只做决策与编排，配方下沉 L2/L3；禁止内联复制他文件内容。结构、预算、链接、
路由语料由 `skills/live2d-studio/scripts/check_routing.py` 机器校验（`--release` 附加发布 gate）。
定位声明：本技能包是**项目自行分发**的领域技能包（多文件路由形态），非 Hermes 官方仓库的
单技能投稿形态。

## 许可与第三方组件

- `psd2live/` 自带 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`（含 Live2D SDK 非分发政策）。
- `see-through/` 自带 `LICENSE`（上游研究项目，保留署名）。
- 本工作区原创文档的开源许可待项目所有者定稿（发布 gate G3；台账见
  [`skills/live2d-studio/references/vendor-manifest.md`](skills/live2d-studio/references/vendor-manifest.md)）。
