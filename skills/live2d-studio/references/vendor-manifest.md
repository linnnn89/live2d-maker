# vendor-manifest — 迁入内容来源/许可/版本台账（发布 gate G4）

> 原 Hermes 领域技能已按用户授权吸收到本包，并将在验证后删除旧安装。迁入不等于具备公开再分发许可；
> G4 要求本表无 TODO 且许可审计通过，才允许开源发布。

| 条目 | 原来源 | 迁入内容 | 许可 | 来源哈希 | 复核日期 | 发布状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| live2d-psd-model-repair | Hermes default profile | 主文档 + 8 refs + 3 scripts | 项目所有者授权以 GPL-3.0-only 公开 | SHA-256 `1b264f0a1a00246fdacd102a63e1351b57c5ce4c29517c130b004ba1767839fd`（12 文件，排除缓存） | 2026-09-22 | 随本仓公开 |
| reference-art-alignment | Hermes default profile | 主文档 + 2 refs + 1 script | 项目所有者授权以 GPL-3.0-only 公开 | SHA-256 `c55525c95a61b55421d5526cc2d35a1a33ea2a7bb35d2121f82a0c07d971b4ae`（4 文件） | 2026-09-22 | 随本仓公开 |
| `~/.agents/skills` 协作条目 | 本机共享技能库 | 仅注册表指针，未复制正文 | 不适用 | 不适用 | 2026-09-22 | 不随包分发 |
| psd2live/（含 docs 引用） | 本仓组件 | 仅相对路径引用 | 见 `psd2live/LICENSE` + `THIRD_PARTY_NOTICES.md` | 仓内随版 | TODO | 独立组件 |
| see-through/ | 上游研究项目 | 仅相对路径引用 | 见 `see-through/LICENSE` | 仓内随版 | TODO | 独立组件 |

嘴部 fixture 的 `TODO(实测)` 与本表许可 TODO 均补齐前，`--release` 必须保持失败。
