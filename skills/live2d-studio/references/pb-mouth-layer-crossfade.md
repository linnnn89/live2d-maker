---
name: pb-mouth-layer-crossfade
layer: L2
requires: [pb-backup-rebuild-psd]
verify_with: [pb-render-compare]
touches: [source, export]
---

# pb-mouth-layer-crossfade — 嘴部双图层交叉淡入（layerOverrides）

> 选择条件：确认目标需要**两张绘图的透明度过渡**时走本篇。连续形变嘴的重复线条应先检查生成唇层与几何，不能仅凭主体不透明就决定交叉淡入；几何错误走 [pb-mouth-geometry-repair.md](pb-mouth-geometry-repair.md)；原画自带双线 → [route-art-repair.md](route-art-repair.md)。

## 前置

- 基线与备份同左篇；机制按需取 [deep-live2d-psd2live-mouth-pipeline.md](deep-live2d-psd2live-mouth-pipeline.md)（[index.md](index.md)：当前轮廓配置、保留几何与纯绘图切换的区别）。

## 步骤

1. 先按深参考第 3 节选择：保留连续嘴形时仍用 MOUTH_OPEN；明确需要纯绘图切换时才考虑 UNKNOWN。两者的原生配置都可用 `type=TOGGLE`、`parameter="ParamMouthOpenY"` 控制主体渐显，但几何、父级及裁剪作用不同；UNKNOWN 还会触发 Studio 现有交付拒绝，不能当作通用方案。
   - **修模型，不修渲染器**（R-c）：禁止在 viewer 里 monkey-patch `getDrawableOpacity` 顶替——Cubism Editor/lip sync/宿主会照旧露出。
2. 在同一镜位检查两张绘图的位置与中间过渡；纯绘图切换不套用口腔几何的 48% 汇聚线。
3. 导出 → [pb-export-and-audit-tags.md](pb-export-and-audit-tags.md)；**读回 psd2live.json** 确认 type/parameter/tag 与所选方案一致，再检查转头继承及口腔内部件裁剪。配置语义不等于现有 Studio/MCP 入口已支持所有字段。

## 完成判据（fixture 化，P4/P5）

- 闭合图形符合目标，过渡没有非预期双线/跳变，转头时位置正确。仅在目标为两张独立图交叉淡入时检查互补透明度；不采用全局像素或宽高比阈值。
- psd2live.json 读回核对通过；viewer 无残留补丁。

## 回滚

指标不过 → fallback 回 [route-model-repair.md](route-model-repair.md) 分支 3 重判；override 配错不许靠渲染器补，回滚重配。
