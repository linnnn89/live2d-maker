# R1 之后的工程改进审阅

审阅日期：2026-10-06；进度更新：2026-10-07。审阅基线：已合并 R1a/R1b 的 `main@5006207`，以及 R1c 分支中的即时合成实现。下文代码观察和旧测量保留审阅时含义；E1a/E1b/E2 已实施，结果见末节，E3–E6 尚未实施。

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

**E1a 已于 2026-10-07 实施：按 ID 索引、轻量内部 token、差异缓存及稳定订阅快照**。保持公开命令和保存行为不变，37 项既有回归加 2 项状态隔离/千层序列回归通过。

E1b 有界图层历史和 E2 渲染失效与预算已完成，随后依次是 E3 协议统一、E4 恢复。Python/原生签名与 WorkspaceService 等改造继续在用户 Windows PC 上按用例推进。

### E1a 实施与本机对照

`commands.ts` 用 ID→位置 Map 替代命令中的逐层查找和差异中的 O(N²) 匹配。Session 复用索引，命令不能改变图层数量/顺序；差异按当前 IR 身份缓存，锁和手势 phase 变化不重复计算差异。内部获取 token/phase/dirty 不再调用完整 inspect。每个版本只创建一次冻结的订阅快照，无效批次、等值命令或相同基线安装不更换快照；公开 inspect/execute 仍返回独立可修改副本。候选 IR 和撤销历史仍是全量副本，不声称已实现 E1b。

Windows x64 / Node 24.19.0，优化前 `7fef01a` 与 E1a 使用同一脚本、相同合成 IR。每层有四个轮廓点，修改末层 landmark；每种图层数运行 5 个新 Controller，每次预热 2 次，再记录 20 次，共 100 个样本。不订阅 UI、不调用像素渲染器，包含 `edit()` 的状态发布成本。两次测量在同一本机完成，期间本地 Vite 服务运行；数值不是 UI 帧率或真实大素材工程的承诺，也不与上一节的 Linux 短采样横向比较。

| 图层数 | 中位耗时：前 → 后 | P95：前 → 后 | 最大耗时：前 → 后 |
| --- | --- | --- | --- |
| 100 | 2.167 → 1.570 ms | 3.048 → 2.180 ms | 3.579 → 2.757 ms |
| 500 | 12.009 → 7.910 ms | 15.060 → 12.206 ms | 20.649 → 18.389 ms |
| 1000 | 27.774 → 15.620 ms | 32.220 → 20.300 ms | 35.819 → 32.746 ms |

Edge 154.0.4258.53 在 1440×1000 和 390×844 使用实际 Studio/Python API，导入 ds 24 层示例，验证隐藏/撤销/重做/放弃、Agent 裁切和透明度、保存基线、PNG 下载及刷新恢复。完整 RGBA 与现有 `composite_ir` 逐字节一致，无页面/控制台错误，窄屏无横向溢出。本机 Python 缺少已声明的 jsonschema，验收前仅在项目虚拟环境补齐固定版本。未执行原生重建/Overlay/QA，生产 Python/Kotlin 和 PNG 渲染器未改动。本机证据保留在忽略目录 `out/e1a-evidence/`。

### E1b 实施与本机对照（2026-10-07）

内部批次复制 IR 外壳/图层数组，以及目标图层和被编辑字段；全批验证成功才发布。历史以受影响图层的 before/after 作为一个原子步骤，图层 ID 和顺序固定，非编辑字段共享。公开 inspect/execute 和独立 applyCommands 仍输出完整隔离副本；React 快照仍按版本深复制并冻结，不声称每次 UI 更新都成为 O(1)。

撤销/重做合计最多 100 步，历史 JSON UTF-8 负载最多 16 MiB；共享字段也计入每一步的序列化预算，这是保守的历史负载度量，不是精确堆或整页总内存预算。超额淘汰最早记录；单个步骤超过上限时保留修改但建立历史屏障，清空之前历史，避免撤销跳过无法记录的步骤。状态增加 history 统计和界面提示。拖拽完成只记一个步骤，取消/净零变更保留重做和预算；放弃/新基线清零统计。完整规则见 [命令契约](STUDIO_DRAFT_COMMANDS.md)。

优化前 `main@fc1858c` 与 E1b 在同一 Windows / Node 24.19.0 环境使用与 E1a 相同的 100/500/1000 图层脚本，每组 5 次新 Controller、2 次预热、20 次采样，共 100 个样本：

| 图层数 | 中位耗时：前 → 后 | P95：前 → 后 | 最大耗时：前 → 后 |
| --- | --- | --- | --- |
| 100 | 1.565 → 0.871 ms | 2.181 → 1.234 ms | 2.675 → 1.541 ms |
| 500 | 8.089 → 4.523 ms | 11.128 → 5.282 ms | 18.476 → 8.339 ms |
| 1000 | 15.986 → 8.950 ms | 20.822 → 10.624 ms | 33.248 → 16.380 ms |

另用同一 1000 图层 IR、同一个末层 landmark 连续编辑，直接调用 Session（不构造 UI 快照）。100 次编辑均保留 100 个历史步骤，JSON 历史负载由 25,163,860 B 降至 59,749 B；150 次编辑时，旧实现保留 150 个全量步骤、37,745,859 B，新实现保留最近 100 个图层步骤、59,899 B。前后负载结构不同，但均为实际持有历史的序列化大小；不要将字节数等同于堆使用或 UI 帧率。临时 GC 堆采样有噪声，仅作为本机证据，不据此承诺内存比例。

验证：构建与 42 项回归通过，只新增 3 项，覆盖字段缺省/精确往返、批次隔离、步数及 UTF-8 字节预算、大步骤屏障、分支重做和 250 次移动的拖拽事务。Edge 154 在真实 Python 工作区中验证 105 步→100 步保留、100 次撤销到第 5 步、100 次重做到第 105 步，实际拖点只记一步；保存/刷新、PNG 对照 Python、桌面/窄屏提示及布局均通过，无页面/控制台错误。证据在 `out/e1b-evidence/`。未修改生产 Python/Kotlin、模型生成、Overlay 或渲染器；E2 总预算与像素失效仍未实施。

### E2 实施与 Windows 验收（2026-10-07）

美术内容 key 与并发 token 分开：画布、可见层序、素材身份/位置、轮廓和透明度决定像素；注记、选中和编辑锁不请求重绘。最近两幅完整成图与裁切/解码缓存共用预算，输出始终独立复制；saved/draft 可复用结果，capture 的异步前后版本检查不变。

默认管线 384 MiB，其中 48 MiB 保守预留请求副本，336 MiB 共享 LRU 池统一计入素材/裁切/完整帧、活动缓冲、codec 工作量及待客户端确认的传输结果。活动内容固定，闲置缓存先淘汰，分配前检查预算。此为受管工作量统计，不代表全部 JS 堆、浏览器进程、GPU 或调用者长期保存的已完成响应。单任务执行、最多一个排队显示、四个显式截图；IR JSON 2 MiB、输入 PNG 16 MiB，超限结构化失败且恢复后可重试。

素材逐个读取、解码；检查 PNG IHDR 和精确 IDAT 扫描线解压长度，再交给现有 codec，去除非像素辅助块。已有 `fflate@0.8.3` 由间接改为直接依赖，版本/传递依赖未变。裁切/合成协作让出并取消旧显示；同步 codec 只在调用前后检查取消。使用 Worker 的 [setTimeout](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/setTimeout) 让出，未依赖兼容性仍有限的 [scheduler.yield](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield)。未实施局部矩形重合成。

构建和 45 项回归通过，新增三项针对缓存/取消、共享预算/解压长度、显示替换/截图队列。实际 Edge 154 / Python ds 24 层工作区：注记修改未新增显示请求，旧显示 `ABORTED`，四个截图成功、第五 `QUEUE_FULL`，4096² 捕获 `MEMORY_BUDGET` 后正常恢复，共享池记录峰值 169,158,976 B（上限 352,321,536 B）。完整 PNG RGBA 对照 Python 一致；105 编辑/100 撤销重做、实际拖点、保存/刷新/下载、桌面/窄屏无溢出且无页面/控制台错误。证据在 `out/e2-evidence/`。生产 Python/Kotlin、模型构建/Overlay 和安装器未改动。
