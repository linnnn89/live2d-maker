---
name: route-runtime-integration
layer: L1
domain: runtime-integration
order: [pb-render-compare]
verify_with: [pb-render-compare]
next_routes: []
fallback: [{on: 双端渲染分流不成立, to: route-runtime-integration.md#诊断, max_retries: 1}]
---

# route-runtime-integration — 模型好、宿主/SDK/渲染坏

**归我**：模型自身没问题，只在本软件/宿主里显示错（整块空白、碎片错位、纹理 V 错、矩阵错、SDK 加载失败）。
**不归我**：模型数据/美术缺陷（→ [route-model-repair.md](route-model-repair.md)）。
**硬约束（R-c）**：本域**一行模型文件都不许动**；也不得用渲染器补丁掩盖模型缺陷。

## 判定树（先自证分流，再定位）

1. **双端渲染自证**：同一 `model3.json` 在参数化 harness 与宿主各渲一张同镜位（[pb-render-compare.md](pb-render-compare.md)）。harness 正常 + 宿主异常 ⇒ 责任在宿主侧，继续；两侧皆异常 ⇒ 转 [route-model-repair.md](route-model-repair.md)。
2. **整块空白/碎片错位** → 矩阵还是纹理 V：分流程序取 [deep-live2d-runtime-render-check.md](deep-live2d-runtime-render-check.md)（[index.md](index.md)）。
3. **与官方运行时不一致** → Cubism SDK 配置（权威正文 `psd2live/docs/zh/guide/CUBISM_SDK_SETUP.md`，`read_file`）。
4. **原版基准对照**（Cubism 2.1 老模型表现）→ 确定性 harness 取 [deep-live2d-original-21-render-harness.md](deep-live2d-original-21-render-harness.md)。
5. **诊断期间在 viewer 里打的任何补丁，结论前必须删除**——"所见即模型"。

## 编排

- order：`[pb-render-compare]`（双端取证）→ 宿主侧修复（渲染器/SDK/纹理加载，不在本包 L2 范围，按上述权威正文执行）→ verify_with `pb-render-compare` 双端复测。

## 完成判据

- 双端渲染一致，或给出"修模型 vs 修宿主"的证据边界结论（R-c/R-e）；viewer 补丁已清理。

## 诊断（回退锚）

分流不成立（harness 也异常）→ 转 [route-model-repair.md](route-model-repair.md)；仍不成立 → 回 [SKILL.md](../SKILL.md) 前置判别。
