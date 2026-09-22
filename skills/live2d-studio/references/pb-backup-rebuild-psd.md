---
name: pb-backup-rebuild-psd
layer: L2
requires: []
verify_with: [pb-render-compare]
touches: [source, psd, export]
---

# pb-backup-rebuild-psd — 备份与 PSD 重建（"备份"唯一定义处）

> 本篇是红线 R-a"可验证备份"的**唯一定义处**；其他文件只引用不复述。纯只读操作不触发本篇。

## 前置

- 已确定要修改的层清单；工具链已按 [ref-toolchain.md](ref-toolchain.md) 重定位（项目 python 跑 psd-tools，不用沙箱解释器）。

## 步骤

1. **备份四件套**到 `_backup_pre_<step>/`：source 图层、manifest、psd、**export 整目录**。
   - export 必须整目录拷（贴图集是 `*.2048/` 这类**目录**，漏掉则改前对照渲染直接失效）。
   - 完成判据：备份后能用改前 export 跑出一张 [pb-render-compare.md](pb-render-compare.md) 对照图。
2. **改 source**：新写步骤脚本（`<动作>.py`），不就地改已有脚本；同步 manifest 的层名/bounds/顺序。
3. **重建 PSD**：按 manifest 逐层 `psd.create_pixel_layer(...)` 后 save；manifest 顺序=自下而上 z 序（第 0 项最底）。
   - 完成判据：manifest 与 PSD 实际层严格一致（数量、名字、bounds 逐层相等）。
4. 交给 [pb-export-and-audit-tags.md](pb-export-and-audit-tags.md) 重导出（R-b）。

## 完成判据

改前/改后两套产物并存且各自可渲染；manifest 一致；层名三处同步（PNG 文件名/manifest/PSD 层名——改名时的硬规则，详见深参考 [deep-live2d-psd2live-semantics.md](deep-live2d-psd2live-semantics.md)）。

## 回滚

改坏即整目录回滚 `_backup_pre_<step>/`；回滚后必跑一张对照渲染确认回到基线。
