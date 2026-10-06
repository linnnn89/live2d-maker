# R1 之后的工程改进审阅

日期：2026-10-06。基线：已合并 R1a/R1b 的 `main@5006207`，以及本轮 R1c 分支中的即时合成实现。本文是下一阶段建议；除 R1c 外，下列优化尚未实施。

## 结论与优先级

工程主线应转向“同一份编辑事实、可控的更新成本、明确的接口和恢复规则”。现有 command/session/controller、ViewerAdapter、ArtworkRenderer 已形成可继续演进的边界。当前最值得优化的是单次编辑产生的全量工作，随后统一协议并补充恢复能力。无需整体更换 React、引入全局状态框架或重写 Kotlin 核心。

| 顺序 | 交付 | 直接收益 | 执行边界 |
| --- | --- | --- | --- |
| E1 / P0 | 草稿增量状态、图层索引、有界历史 | 大图层项目与长时间人/Agent 编辑成本可控 | TypeScript/Node，Linux 可独立完成 |
| E2 / P0 | 明确渲染失效范围、任务取消和总预算 | 注记/锁变化不重算像素，快速操作不积压过时工作 | Browser/Worker，Linux 可独立完成 |
| E3 / P1 | 版本化协议单一来源、结构化错误 | UI、CLI、Agent 行为一致，减少错误字符串判断 | 先完成纯协议和模拟适配器；真实桥接接入按 PC 边界验收 |
| E4 / P1 | 稳定工作区身份、草稿恢复与冲突流程 | 刷新或中断后可恢复，旧草稿不会覆盖新工作区 | 浏览器存储可 Linux 实现；工作区 ID 持久化接入需单独核对 |
| E5 / P1 | 按用例提取页面与应用服务 | 新工具不继续扩大 App 与多套 busy 状态 | UI 纯模块可 Linux；Python/native 编排接入留 PC |
| E6 / PC | 原生显式门面、共享 WorkspaceService、签名分层 | 降低反射和桌面耦合，减少无意义重建 | Kotlin/JPype/原生行为需 Windows 端到端验证 |

## E1：先降低编辑状态的全量成本

代码依据：

- [commands.ts](../studio/src/editor/commands.ts)：每批 `applyCommands` 先 `structuredClone(ir)`；每个命令使用 `parts.find` 定位图层。
- 同文件 `diffArtwork` 对每个 draft part 再调用 `base.parts.find`，匹配部分为 O(N²)。同一次编辑还会在变更判定和状态发布中重复计算差异。
- [DraftSession.ts](../studio/src/editor/DraftSession.ts)：`inspect()` 计算完整差异并深复制包含全部 IR 的返回值；`past` / `future` 保存整份 IR，尚无条数或字节预算。
- [DraftController.ts](../studio/src/editor/DraftController.ts)：UI `edit()` 先调用完整 `inspect()` 取 token，随后发布又调用 `inspect()`。外部请求成功后还会再次读取状态。

本轮做了一个方向性测量：Node 24.19.0，同一 Linux 执行环境，100/500/1000 个合成图层、每层四个轮廓点，通过 `DraftController.edit` 修改一个 landmark；预热 2 次、记录 10 次，不订阅 UI，不调用渲染器。

| 图层数 | IR JSON 大小 | 单次中位耗时 | 该组最大耗时 |
| --- | --- | --- | --- |
| 100 | 28,909 B | 3.20 ms | 4.15 ms |
| 500 | 146,109 B | 18.20 ms | 37.40 ms |
| 1000 | 292,609 B | 63.25 ms | 78.52 ms |

这是共享环境、合成小 IR、短采样的单次观察，同期有浏览器验证；不是用户项目性能基准，也不能用来保证优化后的帧率。它与源码中的全量复制/查找相符，说明应先改算法，再做性能承诺。

建议按两个 PR 推进：

1. 为保存基线和当前草稿维护 `Map<partId,index>`；内部提供轻量 token 读取；缓存当前 revision 的差异与状态。保留对外响应的隔离副本，避免调用者通过返回对象修改内部草稿。
2. 命令只复制受影响图层及其字段；一批命令先在私有候选中验证，全部成功才发布。历史保存受影响图层的 before/after 或可逆 patch，并设置可解释的条数/字节预算。保留原 IR 图层顺序，不能因索引化改变保存契约。

验收：现有批量原子失败、撤销/重做、手势取消、版本冲突、保存失败保留等用例继续通过；新增大图层序列与历史预算验证。外部拿到的 IR 仍可自由修改而不影响内部状态。优化前后使用相同样本记录中位及尾部耗时、持有历史大小，避免只比较文件长度或某个循环。

## E2：编辑版本和像素版本分别承担职责

R1c 已把计算移入 Worker，并缓存解码素材和裁切图层。仍有以下明确的工作量：

- [ArtworkCanvas.tsx](../studio/src/artwork/ArtworkCanvas.tsx) 依赖 IR 对象和草稿 identity；注记变化、手势/保存锁导致新快照时，也可能触发完整渲染请求。
- [ArtworkRenderer.ts](../studio/src/artwork/ArtworkRenderer.ts) 即使命中裁切缓存，仍分配整个画布、叠加所有可见层并扫描 alpha bounds；`Promise.all` 会同时请求所有可见素材。
- [artwork.worker.ts](../studio/src/artwork/artwork.worker.ts) 仅替换尚在队列中的旧显示任务，正在执行的工作不会取消；显式 capture 保留队列位置。
- [AssetCache.ts](../studio/src/artwork/AssetCache.ts) 和当前裁切缓存分别限制 128 MiB，但输入解码、当前帧、传输缓冲和捕获结果仍可能同时驻留。这不是整个 Worker 的总预算。

下一切片应让命令返回内部变更摘要，如受影响 part IDs、字段类别、是否改变像素；维护 `artworkRevision` 或等价内容身份，与外部并发控制的 `draftId/revision` 分开。注记/选中状态/锁状态不会触发像素重算，但 capture 返回前仍必须核对请求 token，不能降低 R1c 的版本一致性。

先做基线/草稿成图复用、并发解码上限、总在途字节预算、显示任务取消或协作式让出，再依据实际热点决定是否做局部矩形重合成。局部合成必须重放受影响区域的相关上下层，不能直接覆盖一个半透明图层。缓存键包含素材内容身份、画布、层序、位置、可见性、透明度和轮廓。

验收：仅修改 landmark 时合成次数不增加；快速拖动最终画面对应最后一个有效版本；显式捕获不会收到旧图；大素材压力下内存与队列有明确上限。继续以原尺寸 RGBA 比较 Python oracle，不以屏幕缩放截图判定像素相等。

## E3：把协议从实现中的重复定义提出来

[contracts.ts](../studio/src/editor/contracts.ts) 有 TypeScript 请求类型，但 `DraftController.execute`、`commands.ts`、`capture.ts` 分别手写允许字段与运行时验证，文档另写一份；离线 CLI 的 envelope 又是一种结构。[main.tsx](../studio/src/main.tsx) 内定义 Snapshot，[ImportGenerated.tsx](../studio/src/ImportGenerated.tsx) 内定义 Preview/ImportPart，[api.ts](../studio/src/api.ts) 只保留 HTTP status 和 message。

当前 `main.tsx` 用 `message.includes('IR changed in another editor')` 识别保存基线冲突；[vite.config.ts](../studio/vite.config.ts) 把多数 CLI 失败映射成 400 字符串，409 又用于 busy。更换错误文案可能影响调用者分支。这里是接口耦合事实，不表示已复现数据覆盖问题。

建议建立 `schemas/studio/` 的 command、capture、snapshot、error 契约，明确 envelope 版本与 IR 自身版本不同。生成或校验 TypeScript DTO，Node/CLI 共享运行时校验入口。错误至少有 code、stage、message、partId/field、可重试信息；旧服务端 message 适配只保留在一个兼容层。

给 Agent 增加可选的轻量响应，例如只读 token/changes 或指定图层，减少每条命令都回传整个 IR。默认保持现有 v1 行为；字段选择、兼容和版本协商先写清楚，不能直接删字段破坏已有调用。

Linux 可先完成纯 schema/解析模块和假 runner 的契约验证。真实 CLI→Python→原生错误映射及 Windows 启动路径的替换需单独在 PC 接入；本轮未改变这些生产链路。

## E4：恢复需要稳定身份，不能只存一份 JSON

目前草稿身份是临时 `draftId`，状态有 `baseRevision`，但没有供浏览器存储使用的持久 `workspaceId`；保存或导入新基线会开启新草稿，刷新后历史消失。

自动恢复应依赖稳定工作区 ID、协议版本和保存基线，保存必要的 patch/checkpoint。打开工作区时：相同基线可提示恢复；基线已变化时展示差异，允许保留/导出旧草稿，再显式重放可兼容命令；不能默认覆盖磁盘 IR。存储失败、配额不足和多个标签页也要有明确状态。

可先实现 `DraftPersistence` 接口、IndexedDB 适配器和恢复流程。工作区 ID 应由工作区持久化层提供，不能用容易重复的显示名，也不能把随机草稿 ID 当项目身份。ID 的创建、旧工作区迁移和实际打开流程另成一片验收。

E1 先于 E4：先控制编辑状态与历史大小，避免把多份完整 IR 快照直接搬进浏览器存储。

## E5：按发生变化的用例拆组件和应用服务

R1c 时 `main.tsx` 仍约 291 行，同时承担打开重试、保存/重建/QA 编排、手势事件、图层列表、差异、导入弹窗、参数和状态文案。问题在于变化原因多，不能仅凭行数断言它难以维护。

建议下一次新增画布工具时提取 `ArtworkWorkspace`、`LayerList`、`PointInspector` 和 `DraftDiff`；打开/保存/导入/任务由 `useWorkspaceActions` 或小型 application service 编排。React 订阅选中图层和必要状态，组件尽量不依赖整份可变快照。避免只把 JSX 拆文件，却把几十个状态和回调继续穿过每层。

Vite 配置中路由、资源服务、body 解析、child process 和全局 busy 也可分成 transport、runner、resource provider；先用注入的假 runner 核对协议，实际 Windows runner 接入再验收。长任务后续需要 operationId/status/progress 和可观察的排队状态；当前全局 busy 连 snapshot 请求也会阻塞，不适合直接扩展为后台任务系统。

## E6：原生侧有优化空间，但保留 PC 边界

- [native.py](../tools/authoring_rig/native.py) 的 `config_for` 遍历 Kotlin declared fields，再按位置调用 `config.copy(*args)`。建议 Kotlin 提供显式配置构造和 JSON DTO，Python 只传契约字段。
- [ViewModelAgentWorkspace.kt](../psd2live/src/main/kotlin/io/github/psd2live/agent/ViewModelAgentWorkspace.kt) 实际依赖 `PSD2LiveViewModel`，同时包含编辑锁、历史、持久化、恢复和预览更新。已有 UI 独立 `AgentWorkspace` 接口值得保留；逐个用例把实现移到 `WorkspaceService`，桌面和 Agent 作为适配器，复用现有 history/project codec。
- `RigBuilder.kt`、`PSD2LiveViewModel.kt`、`AgentMcpService.kt` 分别约 1903、2255、1868 行。按生成上下文、眼口/头发/层级职责或协议注册职责提取；保留 ID 分配、坐标系和变形顺序，不按行数机械切割。
- [stale.py](../tools/authoring_rig/stale.py) 将整个 geometry 纳入 PSD 签名，包含目前只作注记的 landmarks。后续可区分像素、绑定、注记和视图依赖；涉及旧构建报告、review revision、Overlay 基线及恢复的含义，需要版本迁移和原生验证，不能只删除一个哈希字段。

这些建议只做静态分析，本轮没有执行或修改 Windows 原生调用链。

## 建议下一次实际提交

优先提交 **E1a：按 ID 索引、轻量内部 token、差异缓存及稳定订阅快照**。保持公开命令和保存行为不变，使用现有 37 项回归作为功能基线，再针对 100/500/1000 图层做同场景前后测量。

随后依次是 E1b 有界 patch 历史、E2 渲染失效与预算、E3 协议统一、E4 恢复。Python/原生签名与 WorkspaceService 等改造继续在用户 Windows PC 上按用例推进。
