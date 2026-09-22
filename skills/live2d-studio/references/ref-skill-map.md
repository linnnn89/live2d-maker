# ref-skill-map — 外部协作技能摘要（权威正文在仓库 `docs/skill-map.md`）

> Live2D 修复与参考对齐深配方已内置到本包；外部注册表只保留没有被本包吞并的跨界能力。

- 权威正文：仓库 `docs/skill-map.md`（`read_file` + 仓内相对路径）。
- **加载纪律**：一次只加载命中触发条件的 1～2 个；禁止批量预读。
- See-through 后仍粘连/遮挡歧义/部件数不符时，可只读本机 `.agents` 的
  `source-part-segmentation`；它产出具名 masks 和歧义报告，不直接产出 Live2D PSD。
- Blender/3D 技能不得直接套用到 Cubism ArtMesh；具体适用边界见权威注册表。
- 外部协作技能缺失时，退回本包和仓库工具能完成的流程；缺少的跨界增强如实说明，不编造。
- 项目级 `<repo>/.agents/skills/` 与用户家目录 `~/.agents/skills/` 是不同来源，不得混用。
- 迁入内容的来源与许可状态见 [vendor-manifest.md](vendor-manifest.md)。
