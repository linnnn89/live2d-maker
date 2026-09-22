---
name: pb-publish-and-handoff
layer: L2
requires: [pb-backup-rebuild-psd]
verify_with: [pb-render-compare]
touches: [export, public]
---

# pb-publish-and-handoff — 发布与交接

## 前置（R-d）

- [pb-render-compare.md](pb-render-compare.md) 验收已通过。**试换类请求（"换成这个试试"）到此为止**：只出并排对比图等用户结论，不 publish、不 commit，manifest `artRevision` 打可区分标签。

## 步骤

1. `publish.py`（或构建脚本）写入发布目录。**注意**：部分流水线脚本直接覆盖已发布产物——跑前先备份发布目录（R-a）。
2. 一致性校验：moc3 在 export/public/dist **三处哈希必须一致**（沿用既有 MD5 流程时注明：**仅用于一致性校验，非安全认证**；新流程用 SHA-256）。
3. `npm test`（若项目具备）。

## 交接载体（宿主策略，P3 —— 见 [host-adapter.md](host-adapter.md#交接策略)）

- 当前仓库存在 `docs/HANDOFF.md` 约定 → 追加编号小节（改动摘要/验证数字/未做项）。
- 否则 → 输出**同格式交接摘要**返回用户、PR 或 Release notes；**不自动创建**仓库级交接文件。包外文件不是技能运行的必需依赖。

## 完成判据

- 三处哈希一致；交接摘要已落地（或 HANDOFF 已追加编号小节）；未做项如实列写（R-e，如"Cubism Editor 人工复核未做"）。

## 回滚

发布产物坏 → `_backup_pre_*`/发布目录备份整目录回滚；回滚后重跑一致性校验。
