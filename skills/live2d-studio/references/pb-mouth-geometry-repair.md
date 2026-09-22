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

1. 复核位置量：`mouth_close` 垂直中心是否 == `bounds.top + 0.48*h` 的 seam；素材宽高比是否与原版一致（错件判据见深参考）。
2. 调整 `mouth_close` 落位使垂直中心命中 seam（位置类修复）；素材错件 → 回 [route-art-repair.md](route-art-repair.md) 换件，不硬塞。
3. 重建 PSD → [pb-export-and-audit-tags.md](pb-export-and-audit-tags.md)（R-b）。

## 完成判据（fixture 化，P4/P5）

- 闭嘴态双线消失：两水平边缘间距 ≤ 阈值（阈值随 fixture 渲染规格固定存档；占位 `TODO(实测)`——已知参考：seam 偏差 4.9px@1024 画布即现明显双线）。
- 嘴部包围盒高/画布宽 ≤ fixture 阈值（占位 `TODO(实测)`；参考：正常 4~5px vs 异常 9px@1024）。
- 复测用 [pb-render-compare.md](pb-render-compare.md) 同镜位对比图。

## 回滚

指标不过 → fallback 回 [route-model-repair.md](route-model-repair.md) 分支 3 重判（几何 vs 交叉淡入选错是主因）；改动作废用 `_backup_pre_*` 回滚。
