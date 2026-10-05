# Agent 技能与外部工具

本仓的 PSD/Live2D 技能入口是 [live2d-studio](../skills/live2d-studio/SKILL.md)。模型修复、参考对齐、导出和渲染检查的说明已包含在技能目录中，不要求另外安装旧的 `live2d-psd-model-repair` 或 `reference-art-alignment`。

此文件只说明什么时候需要外部能力，不记录某台机器安装了多少技能，也不保证下表工具已经可用。

## 需要外部能力的情况

| 场景 | 可使用的能力 | 范围 |
|---|---|---|
| See-through 后仍有粘连、遮挡歧义或部件数量不符 | Blender 技能中的 `source-part-segmentation` 手册 | 生成具名 mask、部件清单和歧义报告；之后回到 PSD 流程 |
| 需要 3D 底模、网格/UV 对照或烘焙贴图 | 当前宿主提供的 Blender 技能与 Blender MCP | 只处理 Blender/3D 工作，不直接套用到 Cubism ArtMesh |
| 需要外部生成透明素材 | 宿主提供的图像生成工具 | 先生成文件，再按 [素材导入契约](../schemas/authoring-rig/README.md) 检查和导入 |
| 需要引用核对、评审或 GitHub 操作 | 当前宿主的对应工具或技能 | 按当前任务选择，不作为软件运行依赖 |

Blender 手册通常由统一入口路由，`source-part-segmentation` 不一定是独立技能。先读取宿主实际列出的 Blender 技能入口，再找对应手册；不要根据名称猜 `.agents/skills/<手册名>/SKILL.md`。

Blender 的材质、骨骼和动画方法，以及其默认阈值，不能直接用作 Live2D 的绑定或验收规则。Live2D 问题仍以本仓 PSD2Live、IR 和 Cubism 渲染结果为依据。

## 在不同宿主中使用

- Codex：使用当前会话提供的技能目录和工具入口。
- Hermes：使用当前 profile 的技能索引及 `skill_view`；具体适配见 [host-adapter.md](../skills/live2d-studio/references/host-adapter.md)。
- 文件读取方式：以宿主提供的实际 `SKILL.md` 路径为准。项目级与用户级技能目录可能同时存在，要确认读取的是哪一份。

只读取当前任务需要的技能。能力缺失时使用已有仓库工具，并说明哪一步无法完成；不为完成一次任务自动安装外部技能、服务或模型。

迁入技能的来源与许可保存在 [vendor-manifest.md](../skills/live2d-studio/references/vendor-manifest.md)。本文件中的外部技能指针不表示这些技能随仓分发。
