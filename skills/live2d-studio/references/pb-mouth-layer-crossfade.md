---
name: pb-mouth-layer-crossfade
layer: L2
requires: [pb-backup-rebuild-psd]
verify_with: [pb-render-compare]
touches: [source, export]
---

# pb-mouth-layer-crossfade — 嘴部双图层交叉淡入（layerOverrides）

> 选择条件：**图层重叠/透明度过渡错误**（闭嘴时两层都在画、开合跳变）走本篇；纯落位/汇聚线几何错误走 [pb-mouth-geometry-repair.md](pb-mouth-geometry-repair.md)；原画自带双线 → [route-art-repair.md](route-art-repair.md)。

## 前置

- 基线与备份同左篇；机制按需取 [deep-live2d-psd2live-mouth-pipeline.md](deep-live2d-psd2live-mouth-pipeline.md)（[index.md](index.md)：为何 `mouth_open` 无透明度网格、交叉淡入配方全文）。

## 步骤

1. 在 `PipelineConfig.layerOverrides[<层id>]` 配置交叉淡入：`type=TOGGLE`、`tag=MOUTH_OPEN`、`parameter="ParamMouthOpenY"`（tag 决定嘴部压缩网格，type 决定不透明度来源）。
   - **修模型，不修渲染器**（R-c）：禁止在 viewer 里 monkey-patch `getDrawableOpacity` 顶替——Cubism Editor/lip sync/宿主会照旧露出。
2. 落位仍须满足 seam 判据（与左篇同一条件，两层同线）。
3. 导出 → [pb-export-and-audit-tags.md](pb-export-and-audit-tags.md)；**读回 psd2live.json** 确认该层 type/parameter 已变、tag 仍为 `mouth_open`。

## 完成判据（fixture 化，P4/P5）

- 闭嘴态仅 `mouth_close` 可见、张口过程无双线/跳变（对比图同镜位）；判据数值同 [pb-mouth-geometry-repair.md](pb-mouth-geometry-repair.md) 的 fixture 阈值。
- psd2live.json 读回核对通过；viewer 无残留补丁。

## 回滚

指标不过 → fallback 回 [route-model-repair.md](route-model-repair.md) 分支 3 重判；override 配错不许靠渲染器补，回滚重配。
