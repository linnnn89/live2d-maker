---
name: route-model-generation
layer: L1
domain: model-generation
order: [pb-export-and-audit-tags]
verify_with: [pb-render-compare]
next_routes: []
fallback: [{on: 导出失败或标签不符, to: route-model-generation.md#诊断, max_retries: 1}]
---

# route-model-generation — 生成、导出、标签审计

**归我**：PSD2Live 生成与导出（GUI/CLI/MCP 三条路径）、导出后标签审计、纹理高清化、SDK 配置。
**不归我**：造 PSD（→ [route-input-layering.md](route-input-layering.md)）；修模型形态（→ [route-model-repair.md](route-model-repair.md)）；发布（→ [pb-publish-and-handoff.md](pb-publish-and-handoff.md)）。

## 判定树

1. 要跑一次导出 → 选路径：桌面 GUI（`start-psd2live.ps1`，用法权威正文 `psd2live/docs/zh/guide/USER_GUIDE.md`）｜便携导出器（`portable/PSD2Live` + 角色 `export_*.py`）｜MCP（→ [route-automation-mcp.md](route-automation-mcp.md)）。工具路径先按 [ref-toolchain.md](ref-toolchain.md) 重定位。
2. 导完必须 → [pb-export-and-audit-tags.md](pb-export-and-audit-tags.md)（R-b）：逐层核对 `tag/side/parameter`，`unknown` 与缺失物理绑定高亮。
3. psd2live.json 时间戳早于 PSD 修改时间 → 读到的是上次标签，重导出后再审。
4. 贴图模糊/显存问题 → 纹理高清化：权威正文 `psd2live/docs/zh/guide/TEXTURE_UPSCALE.md`；一致性对照需 SDK：`CUBISM_SDK_SETUP.md`。
5. 导出成功但形态不对 → 转 [route-model-repair.md](route-model-repair.md)。

## 编排

- order：`[pb-export-and-audit-tags]`；verify_with：`[pb-render-compare]`；随后 [pb-publish-and-handoff.md](pb-publish-and-handoff.md)（试换类请求不出版，见该篇分流）。
- 失败回退：导出失败→查日志坞/CLI 输出定位；连续失败不重试第三次，回诊断。

## 完成判据

- 标签审计零 `unknown`（或逐条给出处置说明）；`export/*.psd2live.json` 时间戳新于 PSD。
- 渲染验收见 [pb-render-compare.md](pb-render-compare.md) 完成判据。

## 诊断（回退锚）

回 [SKILL.md](../SKILL.md) 前置判别；结构错→[route-model-repair.md](route-model-repair.md)，素材错→[route-art-repair.md](route-art-repair.md)。
