---
name: route-art-repair
layer: L1
domain: art-repair
order: [pb-render-compare]
verify_with: [pb-render-compare]
next_routes: [{when: 素材已落位需重导出, route: model-generation}]
fallback: [{on: 配准或落位不成立, to: route-art-repair.md#诊断, max_retries: 1}]
---

# route-art-repair — 美术重切、素材落位、参考对齐

**归我**：有结构→改某层的图（重切眼/发/嘴、补绘、接缝、素材落位、与参考插画对齐）。
**不归我**：无结构→造结构（→ [route-input-layering.md](route-input-layering.md)）；绑定/结构/参数问题（→ [route-model-repair.md](route-model-repair.md)）。
边界判据（与 route-input-layering 逐字一致，机器校验）：**无结构→造结构 / 有结构→改某层**。

## 判定树

1. **眼三层重切**（eyewhite→irides→eyelash 顺序与判据）→ 取 [deep-live2d-eye-hair-recipes.md](deep-live2d-eye-hair-recipes.md)（[index.md](index.md)）。睫毛混入下眼线会在闭眼时撕裂，重切时按配方过滤。
2. **嘴部素材重制/换件** → 风格以用户参考图为准，不盲搬贴图分量；落位前报素材宽高比与 seam 偏差（配方 [deep-live2d-psd2live-mouth-pipeline.md](deep-live2d-psd2live-mouth-pipeline.md)），随后走 [pb-mouth-geometry-repair.md](pb-mouth-geometry-repair.md) 或 [pb-mouth-layer-crossfade.md](pb-mouth-layer-crossfade.md)。
3. **与原版参考图对齐**（脸/发/饰大小位置差异）→ 先配准量化再动手；Live2D 专用配方取 [deep-live2d-reference-alignment.md](deep-live2d-reference-alignment.md)，通用地标与素材换装补充取 [deep-alignment-registration-and-metrics.md](deep-alignment-registration-and-metrics.md) / [deep-alignment-asset-swap-fitting.md](deep-alignment-asset-swap-fitting.md)。整组刚性平移优先；参考图必须未被二次缩放/截边；裁切图用地标配定，不用轮廓 IoU。若症状是“刘海偏高/偏低、发际线不齐、拉高/拉低试试”，按 [index.md](index.md) 取 `scripts/hairline_probe.py` 生成逐列探针与试改证据；脚本只负责测量，不取代用户的美术终裁。
4. **素材落位** → 同一取景取用；跨取景先解平移量再搬；落位后必报锚点偏差（配方 [deep-live2d-eye-hair-recipes.md](deep-live2d-eye-hair-recipes.md) 落位节）。
5. **前后发切分/层次美术** → 归属规则查 [route-model-repair.md](route-model-repair.md) 分支 4，美术重切在本篇。

## 编排

- order：`[pb-render-compare]`（改前基线）→ 美术修改 → verify_with `pb-render-compare`（同镜位复测）。
- 改 source 前置：R-a 备份走 [pb-backup-rebuild-psd.md](pb-backup-rebuild-psd.md)；改完回 [route-model-generation.md](route-model-generation.md) 重导出。

## 完成判据

- 量化差量复测到个位数像素（指标随 fixture 固定）；放大叠加图目视复核做过才写"已复核"。
- 测量结论交叉验证：两个独立可复现指标同落一个差量（R-e）。

## 诊断（回退锚）

配准/落位不成立 → 本节重选分支（max_retries≤1）；测不准 → 参考图换未处理版本重来；仍不成立 → 回 [SKILL.md](../SKILL.md)。
