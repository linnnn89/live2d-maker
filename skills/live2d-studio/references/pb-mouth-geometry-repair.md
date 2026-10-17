---
name: pb-mouth-geometry-repair
layer: L2
requires: [pb-backup-rebuild-psd]
verify_with: [pb-render-compare]
touches: [source, export]
---

# pb-mouth-geometry-repair — 嘴部几何/汇聚线修复

> 选择条件（与 pb-mouth-layer-crossfade 互补）：**几何/汇聚线错误**走本篇；图层重叠/透明度过渡错误走 [pb-mouth-layer-crossfade.md](pb-mouth-layer-crossfade.md)；原画/切片自带双线 → 转 [route-art-repair.md](route-art-repair.md)，本篇不接。

## 前置

- [pb-render-compare.md](pb-render-compare.md) 已建基线（同 spec 有改前图）；备份已做（R-a）。
- 机制公式按需取 [deep-live2d-psd2live-mouth-pipeline.md](deep-live2d-psd2live-mouth-pipeline.md)（[index.md](index.md)：0.48 汇聚线、透明度网格、张嘴素材保真判据）。

## 步骤

1. 先读实际 mouthOutlineEnabled、生成唇层、直接参数轴和父级，再固定镜位查看 MouthForm × MouthOpen。`top + 0.48*h` 仅是几何基准，曲线与表情还会影响最终形状；不能直接要求独立唇线中心等于它。
2. 绑定存在而局部形状不合适时，先按 [MCP 契约第 6 节](../../../psd2live/docs/zh/agent/MCP_AUTHORING.md) 使用已有关键形/局部形变。确认源素材错位时才调整落位；素材错件 → 回 [route-art-repair.md](route-art-repair.md)。
3. 模型编辑沿用原生历史；源素材修改才重建 PSD。导出走 [pb-export-and-audit-tags.md](pb-export-and-audit-tags.md)（R-b），不强制每次局部修正都重切素材。

## 完成判据（fixture 化，P4/P5）

- 闭合线与目标一致，中间姿态和 MouthForm 表达合理，转头时不脱离；不存在非预期的重复绘制。
- 若需要量化阈值，从当前素材、配置和取景建立基线；旧案例的 4–5 px 或 48% 中心不能直接作为通过条件。
- 复测用 [pb-render-compare.md](pb-render-compare.md) 同镜位对比图。

## 回滚

指标不过 → fallback 回 [route-model-repair.md](route-model-repair.md) 分支 3 重判（几何 vs 交叉淡入选错是主因）；改动作废用 `_backup_pre_*` 回滚。
