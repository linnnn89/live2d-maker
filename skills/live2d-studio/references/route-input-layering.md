---
name: route-input-layering
layer: L1
domain: input-layering
order: [pb-backup-rebuild-psd]
verify_with: [pb-render-compare]
next_routes: [{when: layered_psd_ready, route: model-generation}]
fallback: [{on: 拆层质量不达标, to: route-input-layering.md#诊断, max_retries: 1}]
---

# route-input-layering — 输入、拆层、命名、PSD 重建

**归我**：无结构→造结构（单图拆层、图层语义/命名/侧别、分层 PSD 重建）。
**不归我**：有结构→改某层的图（→ [route-art-repair.md](route-art-repair.md)）；生成与导出（→ [route-model-generation.md](route-model-generation.md)）。
边界判据（与 route-art-repair 逐字一致，机器校验）：**无结构→造结构 / 有结构→改某层**。

## 判定树

1. 只有一张立绘，要分层 → 先走 See-through 三模型分工与串联，取 [deep-live2d-layer-decomposition-tools.md](deep-live2d-layer-decomposition-tools.md)（[index.md](index.md)）。若自动拆层后仍有粘连、遮挡歧义或部件数不符，才按 [ref-skill-map.md](ref-skill-map.md) 加载本机 `.agents` 的 `source-part-segmentation`，产出具名 masks、部件清单和歧义报告后回到本路线；它不直接产出完成的 Live2D PSD，不得靠对称性臆造源图没有的部件。
2. 已有分层素材，要组 PSD → 重建：层序=manifest 自下而上，走 [pb-backup-rebuild-psd.md](pb-backup-rebuild-psd.md)。
3. 层名不确定能否被识别 → 先查别名表：取 [deep-live2d-psd2live-semantics.md](deep-live2d-psd2live-semantics.md)；命名规范权威正文 `psd2live/docs/zh/spec/PSD_LAYER_SPEC.md`（`read_file`）。
4. 层次关系错（前后发归属、z 序）→ 属模型结构修复 → 转 [route-model-repair.md](route-model-repair.md)。

## 生命周期编排（本篇是跨域主流程唯一所有者）

- order：`[pb-backup-rebuild-psd]` → next_routes 同步调用 `model-generation`（语义见 host-adapter/编排规则：目标 route 以具名完成状态返回后恢复本篇后续 order）。
- 跨域流程：拆层 → `model-generation`（生成+标签审计）→ verify_with `pb-render-compare` → `pb-publish-and-handoff`。不得两个 route 同时推进同一步骤。

## 完成判据

- 每层 tag/side 命中别名表（导出后由 [pb-export-and-audit-tags.md](pb-export-and-audit-tags.md) 核对）。
- manifest 层名/bounds/顺序与 PSD 实际层严格一致。

## 诊断（回退锚）

判定不成立 → 回 [SKILL.md](../SKILL.md) 前置判别重选；美术问题转 [route-art-repair.md](route-art-repair.md)，显示问题转 [route-runtime-integration.md](route-runtime-integration.md)。
