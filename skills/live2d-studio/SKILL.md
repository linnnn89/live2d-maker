---
name: live2d-studio
description: "PSD/Live2D 任务路由与编排入口，分流到分域路线手册。"
version: 0.1.0
author: live2d-edit-tool contributors, Hermes Agent
license: GPL-3.0-only
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [PSD, Live2D, routing, pipeline]
    related_skills: []
---

# live2d-studio — PSD / Live2D 任务路由与编排入口

**本包负责分流与编排，并内置原 `live2d-psd-model-repair` 与 `reference-art-alignment` 的深度配方；不再依赖这两个旧技能。** 本包的路由、深参考与安全降级自包含，具体工具契约依赖其绑定的 `live2d-edit-tool` 工作区。每次只加载命中的一层：L0（本文件）→ L1 `references/route-*.md` → L2 `references/pb-*.md` → L3 `references/index.md` 按需取一篇。禁止预读下层"备用"。

## 安装与加载

- 位置：`skills/live2d-studio/`。加载方式：放入或**链接**（Windows 用 junction，优于拷贝）到 `~/.hermes/skills/`（profile 级）；项目级需 git root + `.hermes/skills/` + `skills.trusted_project_dirs`。新装技能**新会话**才可见（loader 会话缓存）。
- 结构校验：`python scripts/check_routing.py`（缺失文件报清单不崩栈）。
- 宿主差异与取用方式：[references/host-adapter.md](references/host-adapter.md)。

## 前置判别：下一步要动什么（四选一）

| 要动的东西 | 去向 |
| :--- | :--- |
| 改模型数据（层/标签/结构/参数） | [references/route-input-layering.md](references/route-input-layering.md)（无结构）或 [references/route-model-repair.md](references/route-model-repair.md)（有结构，只读分诊） |
| 改美术（重切/换图/对齐参考） | [references/route-art-repair.md](references/route-art-repair.md) |
| 不改任何文件，先出证据 | [references/pb-render-compare.md](references/pb-render-compare.md)（只读） |
| 模型没问题，宿主里显示错 | [references/route-runtime-integration.md](references/route-runtime-integration.md)（一行模型文件都不许动） |

## 症状路由表（键=用户原话症状）

| 用户说 | 去向 |
| :--- | :--- |
| "像小胡子" / 嘴部两条线 / 嘴合不上 | [references/route-model-repair.md](references/route-model-repair.md) |
| 部件不跟参数 / 跟着头走 / 该摆不摆 | [references/route-model-repair.md](references/route-model-repair.md) |
| 长发穿胸 / 层次穿透 / 被挡住还显示 | [references/route-model-repair.md](references/route-model-repair.md) |
| 眼白溢出 / 虹膜不圆 / 睫毛撕裂 | [references/route-model-repair.md](references/route-model-repair.md) → [references/route-art-repair.md](references/route-art-repair.md) |
| 头发/脸大小位置和原版不一样 / 刘海偏低 | [references/route-art-repair.md](references/route-art-repair.md) |
| 整块空白 / 碎片错位（仅本软件） | [references/route-runtime-integration.md](references/route-runtime-integration.md) |
| 只有一张立绘 / 要拆层 / 做新模型 / 拆层粘连 | [references/route-input-layering.md](references/route-input-layering.md) |
| 导出失败 / 标签不对 / moc3 有问题 | [references/route-model-generation.md](references/route-model-generation.md) |
| 给我对比图 / 出证据 | [references/pb-render-compare.md](references/pb-render-compare.md) |
| 要发布 / publish / 交接 | [references/pb-publish-and-handoff.md](references/pb-publish-and-handoff.md) |
| MCP 接不上 / agent 怎么调 | [references/route-automation-mcp.md](references/route-automation-mcp.md) |

## 使用规则

- 命中后**必须读对应 L1** 再动手；不确定先读 [references/route-model-repair.md](references/route-model-repair.md)（只读分诊，命中 art/runtime 立即转出，不得默认改模型）。
- 不读对应 L2 playbook 不得执行操作；不读 L3 不得引用公式/配方。
- 深配方只从 [references/index.md](references/index.md) 按需取包内一篇；未吞并的外部协作技能经 [references/ref-skill-map.md](references/ref-skill-map.md) 调用，缺失时如实降级，不得编造。

## 红线（无条件，按风险选取）

- **R-a** 首次修改 source/模型/导出产物前，按 [references/pb-backup-rebuild-psd.md](references/pb-backup-rebuild-psd.md) 创建可验证备份；纯只读操作不触发备份。
- **R-b** 导出后必跑标签审计（唯一定义处 [references/pb-export-and-audit-tags.md](references/pb-export-and-audit-tags.md)）。
- **R-c** 不用渲染器补偿模型缺陷，也不用改模型掩盖宿主缺陷；先双端渲染证据确定责任边界。
- **R-d** 未完成规定验证不得发布或宣称修复完成；允许标注未验收状态的中间提交。
- **R-e** 验证只报真做过的（没做的写"未做"）。
- **R-f** 不按记忆拼路径：先按 [references/ref-toolchain.md](references/ref-toolchain.md) 的重定位程序确认工具链。
- **R-g** 美术效果用户终裁；结构性改动先证据+选项+推荐。
- **R-h** 推荐≠修改：不改已安装技能本体。

每篇 L1 末尾有回退锚（判定不成立时的出口）；预算与结构由 `scripts/check_routing.py` 强制。
