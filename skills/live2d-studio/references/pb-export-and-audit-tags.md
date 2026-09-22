---
name: pb-export-and-audit-tags
layer: L2
requires: [pb-backup-rebuild-psd]
verify_with: [pb-render-compare]
touches: [export]
---

# pb-export-and-audit-tags — 导出与标签审计（"标签审计"唯一定义处）

> 本篇是红线 R-b"标签审计"的**唯一定义处**；每次导完必跑。工具路径先按 [ref-toolchain.md](ref-toolchain.md) 重定位（含写死路径反查程序）。

## 前置

- source/manifest 已改完（[pb-backup-rebuild-psd.md](pb-backup-rebuild-psd.md) 已执行）；导出路径已确认（便携 `portable/PSD2Live` + 角色 `export_*.py`，或 GUI/MCP，见 [route-model-generation.md](route-model-generation.md)）。

## 步骤

1. 跑导出脚本，产出 `export/`（`.model3.json`、`.moc3`、贴图集、`*.psd2live.json`）。
2. **审计**：取 `check_psd2live_tags.py`（深参考 [index.md](index.md)，`skill_view` 读出后在 scratch 运行）列每层 `tag/side`，高亮 `unknown` 与缺失物理绑定。
3. **时间戳核对**：`*.psd2live.json` 生成时间必须晚于 PSD 修改时间，否则读到的是上次标签——重导出再审。
4. 逐层核对 `tag/side/parameter` 与预期（改过哪层，重点看哪层）。

## 完成判据

- 审计输出零 `unknown`，或逐条给出处置说明；每层参数绑定与设计意图一致；时间戳核对通过。

## 回滚

审计不符 → 修 manifest/层名后回 [pb-backup-rebuild-psd.md](pb-backup-rebuild-psd.md) 步骤 2 重来；不许只手改 `psd2live.json`（会被下次导出覆盖）。
