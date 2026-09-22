---
name: route-model-repair
layer: L1
domain: model-repair
order: [pb-render-compare]
verify_with: [pb-render-compare]
next_routes: [{when: 属美术重切, route: art-repair}, {when: 属宿主显示错, route: runtime-integration}]
fallback: [{on: 根因分支不成立, to: route-model-repair.md#诊断, max_retries: 2}]
---

# route-model-repair — 模型数据根因判定树（只读分诊优先）

**归我**：有结构→模型数据不对（部件绑定、眼/嘴/发形态、层次 z 序、贴图溢出、破面）。
**不归我**：改某层的图（→ [route-art-repair.md](route-art-repair.md)，命中即转出）；模型好宿主坏（→ [route-runtime-integration.md](route-runtime-integration.md)，一行模型文件都不动）。
**本篇是只读分诊**：先复现取证，命中美术/宿主分支立即转出，不得默认改模型。

## 二级判定树（根因分支两跳上限，指向 L2/L3，不再分叉第三层文件）

先复现：[pb-render-compare.md](pb-render-compare.md) 建基线。然后按症状收敛：

1. **部件不跟参数/跟着别的部件走/该摆不随** → 先查语义标签，不先改美术（取 [deep-live2d-psd2live-semantics.md](deep-live2d-psd2live-semantics.md)，见 [index.md](index.md)）。一次像素差渲染即可证实/证伪；若需重导出修正标签，走 [pb-export-and-audit-tags.md](pb-export-and-audit-tags.md)。
2. **形状与美术不符**（眼白溢出、虹膜非圆、多余色块）→ 转 [route-art-repair.md](route-art-repair.md)（眼三层重切配方 [deep-live2d-eye-hair-recipes.md](deep-live2d-eye-hair-recipes.md)）。
3. **嘴部双线/"像小胡子"/开合不符** → 先分辨：原画/切片自带双线→转 [route-art-repair.md](route-art-repair.md)；否则按选择条件：几何/汇聚线错误→[pb-mouth-geometry-repair.md](pb-mouth-geometry-repair.md)；图层重叠/透明度过渡错误→[pb-mouth-layer-crossfade.md](pb-mouth-layer-crossfade.md)。机制公式取 [deep-live2d-psd2live-mouth-pipeline.md](deep-live2d-psd2live-mouth-pipeline.md)。
4. **层次穿透**（长发穿胸等）→ z 序与前后发归属：后发最底、前发最上，规则见 SKILL 引用的规范正文。
5. **脸/发/饰大小位置与原版不一致** → 转 [route-art-repair.md](route-art-repair.md)（先配准量化，取 [deep-live2d-reference-alignment.md](deep-live2d-reference-alignment.md)）。
6. **模型好、仅本软件显示错**（整块空白/碎片错位）→ 转 [route-runtime-integration.md](route-runtime-integration.md)。

## 编排

- order：`[pb-render-compare]`（复现基线）→ 修复走对应 pb → verify_with `pb-render-compare`（复测同镜位）。
- 比例问题先查素材出处（混尺度拼装）再动坐标；跨版本比较只用与遮挡无关的量（深参考 [deep-live2d-reference-alignment.md](deep-live2d-reference-alignment.md) 硬规则）。

## 完成判据

- 复现现象消失于同 spec 渲染；判据数值随 fixture 固定（见 [pb-render-compare.md](pb-render-compare.md)），不写全局像素常数。

## 诊断（回退锚）

根因分支不成立 → 回本节顶部重新分诊（max_retries≤2）；仍不成立 → 回 [SKILL.md](../SKILL.md) 前置判别。
