# R8 后的代码复评与后续实施计划

评审日期：2026-10-07。已 `fetch` 并快进对齐 PC 最新主线：`99f19082f0a05402e396a0a8455cb0a26b7a3f51`（PR #27，R8）。相对上次云端 R1c 提交 `7fef01a`，新增 23 个非合并提交，119 个文件发生变化。本文件中的位置和结论以该基线为准。

初次交付为评审与 plan。后续已按用户授权完成 N0–N2 并合并 PR #28，继续完成 N3、N5a、N4 和 N5b 工程归档的 Linux 范围，实施与验收见第 8–9 节。真实原生接入、交付生成本体的进一步资源修改和大型 CMO3 工程需要 PC 的 W1。原生 Windows 既有验收记录来自 [HANDOFF.md](HANDOFF.md) 第 31–42 节，不计作本次重新执行。

## 1. 结论与已完成工作的对齐

工程已经从单页编辑原型推进到包含工程修订、交付、姿态、受限关键形和动态预览的完整工作流。下一阶段应优先修复跨功能状态一致性，再收敛应用服务和资源管理。无需重做 E1–E6，也无需更换 React 或重写建模核心。

| 上次方向 | 当前代码中的落点 | 本次判断 |
| --- | --- | --- |
| E1 增量编辑和有界历史 | `editor/DraftSession.ts`、`commands.ts`、`DraftController.ts` | 已有图层索引、结构共享、快照缓存和 patch 历史；旧评审全量历史成本不能继续作为现状引用 |
| E2 像素身份与预算 | `artwork/content.ts`、`MemoryBudget.ts`、Worker/client | 已有完整帧复用、共享预算和队列限制；后续需关注新增导入和归档路径的独立分配 |
| E3 协议统一 | `schemas/studio/protocol.schema.json`、生成类型、TS/Python 校验 | 已建立单一契约和结构化错误；继续沿用 v1 兼容规则 |
| E4 草稿恢复 | `recovery/` | 已有独立草稿记录、冲突重放、失败保留；构建设置表单尚未得到同等输入保护 |
| E5 用例拆分 | `workspace/`、`project/`、`model/`、`bridge/` | 页面职责已分离，但操作门禁、保存快照和错误处理又分散到多个面板 |
| E6 / R7 原生边界 | `AuthoringPipelineFacade`、`WorkspaceService`、领域 Rig 生成器、prepared export | 显式配置、共享准备/提交和领域拆分已落地；后续原生调整仍需要 PC 验收 |
| R3–R8 产品能力 | 分类、设置、工程/交付、素材、姿态/关键形、动态预览 | 首批能力已接上；下一步先补完整操作序列中的一致性，而非立即增加时间轴或自动生成 |

## 2. 已复现的问题

本节保留修复前证据；F1 已在 N1 修复，F2/F3 已在 N2 修复，回归范围见第 8 节。

### F1 / P1：收到其他页面的新设置快照，会静默丢失本页未保存设置

位置：[BuildSettingsPanel.tsx](../studio/src/workspace/BuildSettingsPanel.tsx) 第 8–12 行；相关入口为 [useWorkspaceActions.ts](../studio/src/workspace/useWorkspaceActions.ts) 的 IR 保存与快照应用。

`useEffect` 只要看到服务端 `buildSettings.revision` 改变，就用服务端值替换整个 `form`，没有检查本地是否有未提交输入。设置的 CAS 能阻止错误保存，但不能保护此前已被这个 effect 覆盖的输入。

复现步骤：

1. 页面 A 当前保存设置是 2048，本地把贴图尺寸改为 1024，暂不保存。
2. 页面 B 将服务端设置保存为 4096。
3. 页面 A 修改美术透明度并点击“保存 IR”。IR 保存成功，返回的 Snapshot 同时携带 B 的最新设置。
4. A 的表单从 1024 直接变成 4096，“未保存”标识消失，没有冲突或输入保留提示。

本次浏览器实测值为 `1024 → 4096`，页面异常为零。丢失的是本地设置输入，服务端已经保存的 IR 没有丢失。

修复方向：将设置草稿的 `baseRevision`、本地 `values` 与最新服务端设置分开。干净表单自动跟随服务端；有本地修改时保留输入并标识基线变化，保存仍携带原基线并接受 CAS 拒绝。只有显式放弃、切换工程或确认成功保存时重置表单。不能仅靠禁用一个按钮处理所有快照入口。

### F2 / P2：HEAD 相同不代表工作内容相同，但 UI 禁止恢复当前保存修订

位置：[ProjectPanel.tsx](../studio/src/project/ProjectPanel.tsx) 第 34 行。

恢复按钮用 `record.id === history.head` 判断无需恢复。然而“保存 IR”“保存设置”等会改变工作区，并不自动创建工程修订；此时工作区已偏离 HEAD，仍需要恢复 HEAD 的内容。

复现步骤：导入工程产生修订 A → 修改透明度并保存 IR → 打开工程修订。当前 IR 已变化，但 A 的“恢复此修订”仍被禁用。初始只有一个修订的工程尤其明显。直接调用现有 `restore_project(head=A, id=A, ...)` 可以正确恢复，并生成恢复前自动备份，说明阻断发生在 UI。

修复方向：允许恢复 HEAD，保留现有 dirty/settingsPending 门禁和恢复前 checkpoint。最小修复不必新增整个工程内容哈希；如果未来确实需要禁用无变化恢复，再用完整工作内容比较，而不能把修订 ID 当作工作区内容身份。

### F3 / P2：保存再恢复后，两份 HEAD 状态不同步，下一次保存发生伪冲突

位置：[useWorkspaceActions.ts](../studio/src/workspace/useWorkspaceActions.ts) 第 120–133 行，以及 [ProjectPanel.tsx](../studio/src/project/ProjectPanel.tsx) 第 10–24 行。

`saveProject()` 返回新 `ProjectRevisions`，面板只更新 `history`，没有更新 `saved.project.head`。自动刷新却只观察后者组成的 key；`restore()` 成功后也没有显式使历史失效。

复现步骤：

1. 打开 HEAD=A 的工程，历史读取 key 为 A。
2. 保存新修订 B：面板 `history.head=B`，工作区 `saved.project.head` 仍为 A。
3. 通过面板恢复 A：服务端和返回快照均为 A，自动刷新 key 仍是 A，没有触发历史读取。
4. 界面仍把 B 标作“当前保存修订”，遗漏恢复前自动备份；下一次保存携带 B，被后端正确拒绝为 `PROJECT_CONFLICT`。

本次实测请求序列为 `open → project-revisions → project-save → project-restore → project-save`，恢复后历史刷新次数为 0，最后一次保存返回冲突。手动“读取修订记录”可以恢复，但正常单页操作不应要求这个补救步骤。

修复方向：工程元数据与修订列表由同一个用例层协调。每次保存、恢复和自动 checkpoint 后明确更新元数据或使历史失效；成功写入后，刷新失败应显示“写入成功、列表待刷新”，避免让用户误以为写入未发生而重复提交。

## 3. 架构优化空间

### 3.1 统一应用操作的生命周期

当前 `ProjectPanel`、`ParameterPanel`、`RigEditPanel`、`ModelExportPanel` 都直接组合 `api`、`editor.setBlocked`、`setBusy`、`applySnapshot` 和 `finally`。拆组件降低了页面体积，但没有统一操作边界，F1/F3 就出现在这些边界之间。

建议在现有 `workspace/` 内提取小型操作协调器：负责互斥进入/退出、快照接纳、变更后的数据失效、结构化失败；每个用例明确是否允许美术草稿、是否允许设置草稿、更新哪些持久状态。组件只保留输入和展示。保留前端 editor 门禁、HTTP gate 和 Python 文件锁各自的职责；UI 门禁不能替代后端 CAS。

Agent 的已有草稿入口也应遵守同一操作门禁。未来增加工程操作能力时，复用这些用例，不通过模拟按钮建立另一套保存逻辑。本阶段不扩大公开 Agent 写权限或新增协议版本。

### 3.2 Python 模块已分开，但底层读写职责仍集中在 `studio.py`

`projects.py`、`delivery.py`、`poses.py`、`rig_edits.py` 大量在函数内反向导入 `studio.read/write/locked/snapshot`；`studio.snapshot` 又导入这些功能模块来组合视图。这种延迟导入能运行，但会使独立验证、失败恢复和依赖追踪越来越困难。

建议先提取稳定的工作区存储原语：原子 JSON 读写、根路径和资源 URL、锁；再把 Snapshot 装配作为独立查询用例，保留 `studio.py` 的兼容入口。不要一次搬动整个 native/build 编排，也不要同时改文件格式和事务语义。

### 3.3 资源预算不能只覆盖美术 Worker

[projects.py](../tools/authoring_rig/projects.py) 的 `pack_archive` 会把所有允许文件 `read_bytes()` 放进列表，再压缩；允许展开内容最高 1 GiB。[delivery.py](../tools/authoring_rig/delivery.py) 也把交付文件集中到内存后写出。重复构建、交付和修订增加后，这些成本独立于 E2 的 Worker 预算。

这是源码层面的资源成本判断，**本轮没有测得实际内存峰值或 OOM**。建议先对归档采用分块哈希和文件流写入，统一导入/导出的文件数、单文件及总量限制，并证明“成功导出的工程可以重新导入”。随后根据实际项目增长测量是否需要保留策略；默认保留历史，不能直接清理旧构建和修订，因为它们可能仍被引用。

### 3.4 原生边界继续沿用，避免仓促再拆一轮

`WorkspaceService` 已经不依赖 Compose UI，但仍使用 `agent` 包内的 document/store/task 类型。未来第二种宿主或独立应用服务需求明确后，可把中立文档模型归入 workspace/domain；现在仅为了包名移动全部类收益有限。

本轮没有重新运行 Kotlin、JPype、CMO3 导出或 Windows 桌面。原生服务发布与历史持久化、旧基线跨引擎版本行为、动态与静态渲染的一致性，都应继续使用 PC 的真实模型验收；不能依据本次前端通过就认定这些链路重新验证完毕。

## 4. Agent、人机并发与异步时序专项

### 4.1 A 开始、B 编辑、A 的结果迟到：禁止直接 apply

规则：Agent 在 A 捕获输入与提交前提，用户产生 B 后，A 的结果只能保留为待重新评估的候选，不能自动写入 B。不能在收到结果后临时读取 B 的 token，再把旧命令包装成“基于 B”的新请求；这会绕过已有 CAS 的意义。需要重新读取、比较并基于 B 重新生成或明确重放，形成新的提交。

当前浏览器命令边界已经正确实现主要保护：[DraftSession.check](../studio/src/editor/DraftSession.ts) 校验 `draftId + revision`；有效编辑、undo/redo、手势边界和门禁变化推进 revision；保存成功/更换保存基线会生成新的 draftId。检查与同步命令应用之间没有 `await`。两个 Agent 都持有 A 时，只有第一个有效写入能成功，第二个必须重新读取。

本轮额外用真实 TS 模块和可控 Promise 完成以下复现，不依赖 `sleep` 碰运气：

| 时序 | 本次观察 | 结论 |
| --- | --- | --- |
| Agent 等待 → 用户透明度改成 160 → Agent 用 A 请求改成 80 | `DRAFT_CONFLICT`，最终值仍为 160 | 已保护 |
| 用户 A→B→undo 回 A 的内容 → 旧 A 请求提交 | revision 从 0 到 2，旧请求仍 `DRAFT_CONFLICT` | 草稿层能区分“内容相同”和“同一次编辑状态”，避免 ABA |
| 两个 Agent 同时读取 A → 先后 apply | 第一个成功、第二个 `DRAFT_CONFLICT`，保留第一个值 100 | 已保护 |
| 安装新保存基线 → 旧 session 结果回来 | `DRAFT_CONFLICT` | 已保护 |
| 进入操作门禁 → 旧请求到达 → 解除门禁 → 原请求重试 | 先 `BUSY`，后 `DRAFT_CONFLICT` | 空闲不代表旧结果重新有效 |
| 图片捕获尚未结束 → 用户编辑 → 旧 PNG 返回 | `captureArtwork` 返回 `DRAFT_CONFLICT` | 已有异步前后双检，不会把旧图标为新版本 |

必须区分几种身份：草稿 `revision` 是会话内递增版本；保存的 IR revision 是内容哈希；工程 HEAD 是历史节点；settings/Overlay/poses 有各自版本；像素 key 仅用于复用图像。它们不能互相替代。尤其后端 IR 的内容哈希在 A→B→A 后可以相同，因此它不是“期间从未发生过编辑”的证明；当前草稿层的 ABA 保护不能被扩展宣称为所有持久化接口都具有相同保证。

对未来跨进程的 Agent 长任务，除了输入哈希，应捕获适用的 workspace/session 身份与操作代次。只依赖工程 HEAD 也不够：保存 IR 不一定创建新的工程修订。是否新增持久编辑代次，须在 N0 先明确协议和迁移策略；本轮没有私自扩展 v1 请求。

### 4.2 把检查点覆盖到任务的全生命周期

| 阶段 / 时序 | 必须维持的行为 | 当前证据与待办 |
| --- | --- | --- |
| 发起 | 冻结任务需要的输入、前提版本和 workspace 身份 | 草稿命令/截图已有；应用用例分散，N0/N3 梳理统一 |
| 计算中用户继续编辑 | 可保留候选计算，不能把运行中的任务当作独占编辑权 | Agent 草稿 apply 有 CAS；需要 N3 保证每种后续应用入口都保留原前提 |
| 成功返回前状态变化 | 提交时再次校验，不以“开始时校验过”替代 | capture 已双检；导入 `commit_generated` 在文件锁内复核 IR、候选和证据哈希 |
| 同一任务的结果重复返回 / 响应丢失 | 不能产生第二次写入；不确定结果先查询确认，不能盲重试非幂等命令 | 已有 CAS 但没有统一 operationId/结果查询契约；先明确用例策略，不宣称 exactly-once |
| 取消后迟到成功、迟到失败或进度回调 | 均不得发布数据、清除新任务 busy 或覆盖新任务错误 | Worker/viewer 有局部防护；N3 为应用任务增加 owner/代次与完成状态检查 |
| 切换/关闭/重新打开同一工程 | 旧宿主句柄失效，旧结果不能写入新宿主；回调和资源释放仍应完成 | 目前工程切换是整页导航，不应假定已具备 SPA 会话切换协议；N3 预留明确 dispose/epoch 规则 |
| 旧模型计算结束时新编辑已提交 | 旧产物可留作旧版本证据，但不能替换当前模型/当前指针 | Python build 持有工作区锁；Kotlin 有 HEAD 与 live-state CAS，真实交错留 W1 验证 |
| 写入成功后 UI 读取失败 | 分开显示“已提交”和“显示待同步”，不要重复写入 | F3 所在的应用用例需要补这类结果状态 |

取消和版本校验是两个独立保证：取消可能只停止等待，底层 native 或同步 codec 仍会运行；即使不能即时终止，也必须禁止失效结果发布。反过来，拒绝旧结果不能替代释放其缓冲、临时文件、监听器和 GPU 资源。

原生侧静态核对：[ViewModelAgentWorkspace.kt](../psd2live/src/main/kotlin/io/github/psd2live/agent/ViewModelAgentWorkspace.kt) 在 prepare 后核对 tree/HEAD，再调用 `WorkspaceService.commitEdit`；适配器 `applyAgentWorkspacePreview` 比较捕获的 source、编辑映射、Overlay 和 settings。逐部件 mesh 配置包含在 `WorkspaceStateCodec.settings` 中，不能仅因为函数没有独立 `expectedMeshOverrides` 参数就判定漏检。W1 应验证 prepare 中插入用户编辑、checkout、工程切换，以及 CAS 拒绝后新预览任务/SDK 加载不受旧结果影响。本轮没有据此宣称已经复现原生竞态。

## 5. 内存、资源所有权与背压专项

| 资源 | 已有界限 / 释放机制 | 尚需补齐或验证 |
| --- | --- | --- |
| 草稿历史 | 100 步 / 16 MiB 序列化 patch 预算，超大步骤形成历史屏障 | 该数字不是 JS 堆上限；base/current、订阅快照、外部 inspect 副本另外占用。长序列测保留量，不只测一次操作峰值 |
| 美术 Worker | 384 MiB 受管预算含 48 MiB 请求预留；共享池管理缓存、活动工作、codec 和待 ack 结果 | 不是浏览器总内存上限；主线程 Canvas/ImageData、已完成返回值、GPU 不在该池中 |
| 渲染队列 | 1 个 active、最多 1 个排队显示；capture 总数最多 4；旧显示取消，结果 ack 后释放 lease | 同步 codec 只能在边界取消；超时/worker 崩溃/dispose 后每个 Promise 应恰好结算一次，旧消息不能释放新任务资源 |
| 素材导入 | 文件 ≤16 MiB，单图 ≤16,777,216 像素；mask 有同尺寸验证 | `ImportGenerated` 直接在主线程 decode、alpha 扫描、mask PNG encode，不经过 Worker 共享预算；需单独输入/解码/输出预算和可取消任务 |
| mask 手势 | 手势开始复制一份 mask，结束发布或取消恢复 | 4096² mask 每份 16 MiB，两份为 32 MiB；还需计入 sprite RGBA、PNG codec 和显示缓存。限制压缩文件大小不等于限制展开峰值 |
| 素材 URL | effect 清理时 revoke 已创建的 Object URL | 若 effect 已清理，`arrayBuffer()` 随后返回，现实现仍可能创建 URL；需检查取消后再分配、或立即 revoke 迟到 URL。列为生命周期待补回归，未声称实测用户流程持续泄漏 |
| 草稿持久化 | 每工作区最多 20 份 / 32 MiB，独立草稿键和删除版本检查 | `list()`/写前查询会 `getAll`；接近上限和多页广播时会复制多份记录。先测实际压力，再考虑游标/摘要查询；不能自动删除用户恢复记录 |
| 工程上传 / ZIP | 上传128 MiB、展开1 GiB及文件数限制 | 浏览器 Base64、JSON 请求体、Node body、Python 解码各有副本；归档又全量读文件。分别制定阶段预算和流式方案，不能只引用 Worker 数字 |
| 模型 viewer / SDK | adapter dispose 清理 RAF/poll；动态 iframe 关闭时卸载 | iframe 卸载后 GPU 回收、反复开启后会话/纹理增长需真实浏览器/PC 观察；不把缓存持有直接叫作泄漏 |

资源所有权应随任务明确移交：排队输入由调用端持有 → worker 活动 lease → 已传输结果由接收端持有 → ack 释放 worker 的相应占用。发生失败、取消、过期拒绝、worker 崩溃或宿主关闭时，必须走同等完整的结算/释放流程。终止 worker 后的旧 client/bridge 引用不应重新启动任务；当前 `ArtworkClient.dispose()` 没有永久 closed 标记，N3/N5 需要补上这类可控生命周期验证，再决定是否调整接口。

验收方法：用受控 Promise、假 scheduler、worker 端口模拟指定完成次序；覆盖“取消→迟到成功”“取消→迟到错误”“旧 worker error→新任务”“关闭→仍持有旧桥接引用”“多次 ack”。资源压力分别记录排队数、受管 bytes、对象/URL/监听器/worker 数和进程观测值。允许有界缓存形成稳定平台，不要求每次操作后进程 RSS 立即降回初值；不得由单次峰值推断长期泄漏。本次未做大工程进程内存基准，以上容量推算也不是实测峰值。

## 6. 后续实施 plan

状态：N0–N2 已通过 PR #28 合并；N3、N5a、N4 与 N5b 工程归档的 Linux 范围已实施并验收，详见第 9 节。W1 真实 Windows/native 集成与交付生成本体资源优化留 PC。按阶段提交，已有通过的保护作为回归基线，不重新实现一遍。

| 顺序 / 建议 PR | 修改范围与具体产出 | 验收标准 | 环境边界 |
| --- | --- | --- | --- |
| N0：时序契约与可控回归 | 固化第 4 节中每种用例的输入身份、读/写集合、提交前提、任务代次和取消/重复结果策略；把本轮临时核心竞态复现转为持续回归 | A→B→迟到 A 拒绝；ABA、双 Agent、手势/保存门禁、截图迟到均保持；取消/切换/旧句柄不发布结果；明确哪些持久接口只有内容 CAS | Linux 完成草稿/截图/模拟宿主；原生 prepare/commit 的交错用 W1 验证 |
| N1：保护设置草稿（F1） | `BuildSettingsPanel` 及独立设置草稿逻辑；显式区分输入基线、本地输入、服务端新值，展示冲突与重读/放弃操作 | 两页 2048/1024/4096 序列不丢输入；无改动表单正常同步；保存成功清理 pending，失败保留输入；IR/姿态/导出返回快照均不绕过规则 | Linux 完成纯逻辑、真实 React 交互和模拟 API；不修改原生重建 |
| N2：修订状态闭环（F2、F3） | 允许恢复当前 HEAD；同步 `saved.project` 与修订列表；写操作后明确刷新/失效与重试策略 | 当前 HEAD 恢复可用且保留自动备份；A→保存 B→恢复 A→再保存成功；当前修订标识正确；两页真实 head 冲突仍拒绝；列表读取失败可单独重试 | Linux 完成 TS/纯 Python 工程用例；fixture 无需原生模型 |
| N3：收敛前端操作用例 | 在 `workspace/` 提取操作协调器，逐个迁移工程、姿态、关键形、交付面板；统一快照接纳、owner/代次和 dispose 规则 | 一次仅一个写操作；异常释放自身门禁；旧成功/错误/进度都不能影响新任务；失败保留输入和最后成功模型；旧 bridge/client 不能重启任务 | Linux 验证门禁和模拟响应；Windows 原生动作仅做接入验收，不趁机改算法 |
| N4：拆出 Python 存储与查询边界 | 提取原子读写/锁/URL 原语和 Snapshot 查询，保留 CLI/`studio.py` 兼容入口；消除功能模块依赖大型入口获取底层能力 | 存储、修订、归档、姿态等纯测试通过；请求/响应及文件格式兼容；中断恢复、CAS 和旧工作区读取结果保持；不新增双重锁 | Linux 完成纯模块；迁移到 build/native 调用点之前在 PC 验证，所需 native 改动留后续 PR |
| N5a：导入与异步资源预算 | 给素材 decode/alpha/mask encode 建立独立受管任务；预算检查在分配前，补取消后 URL、buffer、worker 释放和关闭终态 | 重复导入/取消/换素材不持续累积资源；超限可恢复；迟到结果不生成可见候选或泄漏 URL；mask 保护和像素结果保持；主线程不承担大图 codec | Linux 完成纯图像和浏览器验证；不修改原生建模 |
| N5b：归档流式处理与增长预算 | 优化 `pack_archive`，分块计算 SHA 和压缩，统一容量规则；记录真实样本耗时/峰值/产物量；随后评估上传 Base64 副本 | 导出→删除原目录→导入仍保留源素材、全部修订、姿态和交付文件；超限不留下可见半成品；哈希和路径拒绝规则保持；大样本不同时持有所有原始字节 | 普通文件/ZIP 在 Linux 验证；真实 CMO3/模型产物的大工程样本由 PC 补验；默认不清理历史 |
| W1：PC 原生最终验收 | 复用现有 Windows 验收链覆盖上述接入点，单独记录问题，不在云端修改需要原生验证的实现 | PSD→建模→Overlay→交付→归档重开→姿态/动态预览；旧成功模型保留；原生签名/文件与修订引用一致；必要时补桌面保存/打开实际操作 | Windows PC 专项；未完成前不得声称原生链路验证通过 |

依赖顺序：`N0 → N1 → N2 → N3`，随后优先 N5a 的浏览器资源边界，再按实际数据推进 N4/N5b；N5b 避免与 N4 同时修改存储代码。W1 对接入原生链路的步骤逐项补验，不需要等所有工作完成后才发现集成问题。N0 如发现新的覆盖用户结果或资源失控问题，先作为明确缺陷修复，再继续结构调整。

每个 PR 应只解决明确的一类问题；先用本节场景形成有意义的回归，再修改实现。顺手展开正在修改的压缩单行代码，使门禁、异常和状态发布顺序可读；不另开全仓格式化改动。纯 Python 回归应能显式选择 Linux 解释器，Windows 启动路径/原生集成测试单独标记，不能因为纯用例混入固定 `.exe` 路径而默认跳过。

本阶段暂不新增完整时间轴、自动拆层/生成 API、持久后台任务系统或任意局部增量建模。若真实工程证明长任务恢复是首要痛点，再单独规划任务协议与取消语义，不能只在 UI 加一个不能终止 native 作业的“取消”按钮。

## 7. 本次验证与限制

- `studio`: `npm ci`、`npm test`、`npm run build` 完成。65 项中 63 通过、2 跳过；跳过原因是测试绑定 `python/Scripts/python.exe`，不表示相应能力失败。构建成功，但存在 Vite 未来 native config loader 对无扩展名导入的兼容提示，可在接下来触及 bridge 配置时处理。
- `python -m unittest tools.authoring_rig.tests.test_projects -v`：2 项通过，覆盖工程创建、保存/恢复、CAS、恢复中断、归档重开及路径/哈希拒绝。
- 两组临时 Playwright 复现调用了**真实 React 页面和纯 Python 工程函数**：浏览器 API 由路由拦截连接到这些函数，资源来自 32×32 PSD fixture。已验证 F1/F2/F3 的实际界面状态与后端结果。没有经过 Windows CLI bridge，也没有执行 native rebuild。
- 原始观测：F1 本地表单 `1024 → 4096` 且 pending 消失；F2 HEAD 未变/IR 已变/恢复按钮 disabled，同时后端恢复同一 HEAD 成功并保存备份；F3 恢复后读取历史次数为 0，界面仍显示 B，下次保存报 `PROJECT_CONFLICT`。
- 另用浏览器加载真实 `DraftController`/`captureArtwork`，以 Promise 控制迟到返回，确认第 4.1 节六类时序结果；现有前端测试同时覆盖历史预算、渲染取消/失败释放、捕获数量上限与 ack。这不等于 Windows native 交错或整进程内存压力已验收。
- 本轮重点覆盖了新功能的状态/持久化边界、协议、归档和预览调度，并静态阅读原生服务及模块边界；不是对全部 Kotlin 算法或全部 Overlay 组合的穷尽评审。

后续完成每一步时，在本文件 plan 中更新状态、PR 和验收结果，并追加 [HANDOFF.md](HANDOFF.md)。旧的 [R1 评审](ENGINEERING_REVIEW_R1.md) 保留为历史依据，不再把其中已完成的 E1–E6 当作待办。

## 8. N0–N2 实施与 Linux 验收（2026-10-07）

分支 `codex/studio-n0-n2-state-consistency`，基于评审时 main；提交评审见 [PR #28](https://github.com/linnnn89/live2d-maker/pull/28)。按 N0、N1、N2 分别提交；生产变更仅涉及 TypeScript/React，Python 新增纯工程用例驱动的界面测试，未修改 native/build 实现。

### 已实施的最小设计

- **N0**：补两个可控时序回归，覆盖 Agent 提案迟到、用户 undo 回原内容、两个 Agent 竞争和重复提交；复用原 `draftId/revision`。文档说明 Agent 必须保留开始时的 token，不允许给旧提案换上当前 token。已有截图异步双检、门禁和历史/渲染预算测试继续通过。没有新增持久编辑代次或任务调度系统。
- **N1**：`settingsDraft.ts` 只表达 workspace 身份、初始 `BuildSettingsState` 和本地设置。干净表单跟随新快照；有本地修改时保留原基线和输入，显示最新保存值。CAS 使用原基线；重读不丢输入，显式放弃采用最新值。确认设置保存成功时建立新基线，后续重建失败不把已经保存的设置误标为未保存。
- **N2**：工程用例同步已确认的 HEAD；不把历史节点 createdAt 当成工程 updatedAt。恢复包括当前 HEAD，保留后端已有自动 checkpoint；恢复后明确刷新列表。列表读取失败清空可用于写入的旧列表、保留工程操作成功提示，提供独立重试读取；不循环重试、不自动重放写入。外部 HEAD 冲突仍由现有 CAS 拒绝，说明输入保留。

本轮只增加解决三字段表单所需的局部状态和恢复列表失效计数。没有引入全局状态库、表单库、通用事务/命令框架、任意字段自动合并或新的协议版本。允许继续编辑美术，不通过全局冻结用户输入回避 F1。内存不增加新缓存；设置基线/输入是固定大小的三个数值，沿用已有有界历史和 Worker 预算。

### 外部经验与取舍

1. [React #15523：useEffect for synchronizing state and props](https://github.com/react/react/issues/15523)，特别是 [React 维护者关于按对象身份重置的建议](https://github.com/react/react/issues/15523#issuecomment-528281367) 与 [受条件约束的 render 中调整状态](https://github.com/react/react/issues/15523#issuecomment-553204248)。本项目按 workspace 身份重置设置草稿；同一 workspace 的服务端 revision 变化不强制 remount 丢输入。按条件接纳干净表单的新值，不用无条件 effect 回填。
2. [React Hook Form #8233：与远端同步表单值及默认值](https://github.com/react-hook-form/react-hook-form/discussions/8233)。讨论明确提出远端后台更新可能覆盖用户输入，以及保留 dirty 值、通知用户新数据的思路。本项目采用输入/保存基线分离和冲突说明；三个字段无需引入 RHF，也不自动重设 CAS 基线或合并他人的设置。
3. Reddit 检索线索：[提交期间禁用表单或等待 handleSubmit Promise](https://www.reddit.com/r/reactjs/comments/14dbw6w/disable_form_field_or_return_promise_in/)、[异步默认值讨论](https://www.reddit.com/r/reactjs/comments/111mrek/react_hook_form_tanstack_usequery_async/)。本次只能读取搜索索引摘要，原帖 JSON 返回 403，因此没有引用完整评论或把它们当作已核实结论。相关实现最终依据可读取的 GitHub 讨论、实际代码和回归证据；没有为这些讨论安装新库。

### 验收结果与复跑

- `npm test`：72 项，70 通过、2 项因固定 Windows Python 路径跳过；`npm run build` 通过。新增两个 Agent 时序回归、五个设置草稿回归，现有捕获/取消/预算/失败释放检查继续通过。
- `python -m unittest tools.authoring_rig.tests.test_projects -v`：2 项通过。
- 新增 [test_studio_ui.py](../tools/authoring_rig/tests/test_studio_ui.py)，使用现有 Playwright 依赖，真实 React 页面连接纯 Python 项目函数；API 经浏览器 route fixture 驱动，没有调用 Windows CLI 或原生建模。启动 `studio` 的现有 Vite 服务后执行 `STUDIO_UI_URL=http://127.0.0.1:5173 python -m unittest tools.authoring_rig.tests.test_studio_ui -v`；不设置 URL 时该套独立 UI 验收明确跳过。
- 7 个场景通过：dirty 设置保留/409/重读/放弃；干净设置同步/保存成功；保存成功后模拟 rebuild 失败；恢复 HEAD 并显示备份；保存 B→恢复 A→保存 C；恢复成功后列表读取失败且只重试读取；外部 HEAD 冲突、保留输入和重读后成功保存。
- 浏览器为 Chromium，`Browser plugin not available`，使用现有 Python Playwright。URL 为 `http://127.0.0.1:5173/?project=<fixture-id>`，桌面 1440×960，窄屏 390×844；页面身份、非空页面、无 Vite 错误覆盖层、无 pageerror、目标交互与截图检查通过。409 和模拟的 400 是主动注入的预期响应。
- 截图保存在工作区外 `/tmp/live2d-n0-n2-evidence/`，未提交进仓库。验证不覆盖实际 Cubism/native、Windows CLI/Edge 或桌面 SDK；这些继续由 W1 执行。

下一轮从 N3 中实际重复的操作收尾与关闭句柄开始，先用可控时序证明问题再抽取小范围用例；N5a 优先解决主线程大图解码和迟到资源分配。暂不一次性建立通用任务系统或并行迁移整条 Python/native 链路。

## 9. N3 起的持续实施记录与 plan（2026-10-07）

用户授权继续至规划的 Linux 范围完成，或确实需要切换真实 Windows 才能继续。基于 main@a38406f（PR #28 已合并），后续按以下顺序推进；本节逐步追加结果，不把尚未实施的项目标为完成。

1. **N3a / 已验证**：`ArtworkClient.dispose` 成为关闭终态，失败 Worker 可被新 Worker 替换，但旧回调只认自己的实例。关闭时清空 handler、活动/排队任务；保留旧 client 的调用返回 `ABORTED`。每次 Workspace effect setup 创建新 client 和 Agent bridge，cleanup 关闭对应实例。旧 bridge 拒绝 inspect/apply/commit/capture，进行中的返回也不能冒充当前宿主结果；dispose 清除对 editor/render 的引用。已提交的保存可能完成，关闭不意味着回滚；重开后查询实际保存状态，不能盲重试。
2. **N3b / 已验证**：`WorkspaceOperations` 只提供同步进入、当前所有者检查、门禁/进度和自身收尾；关闭释放引用。工程、姿态、关键形、交付、设置、IR 保存/重建/QA 和导入门禁共用；组件保留业务输入与原 CAS。先启动草稿保存，再同步加上操作门禁，避免保存新基线发布后至后续原生请求之间暴露空闲状态。交付响应确认后立即保存已成功的下载结果，快照失败单独显示并只重试读取。无队列、自动重试、后台调度或新的公开 Agent 权限。
3. **N5a / 已实施**：导入 decode/alpha/crop/mask encode/Base64 转入一次性 Worker，每个 client 只允许一个活动任务、无队列/缓存，完成/错误/取消立即终止线程。复用PNG像素规则与MemoryBudget，为单任务提供384MiB受管codec预算，分配前检查16MiB文件/像素/尺寸/预算；主线程仅保存尺寸、alpha范围、URL和原可编辑mask，准备时只传输有界mask副本。effect取消检查在URL分配前，关闭后预检返回不发布。裁切变化重新检查源图；先用重算换取简单所有权，未增加decoded缓存。
4. **N4 / 已实施**：`workspace_store.py` 提供原子JSON读写、内容revision、原写锁和资源URL，`workspace_query.py` 装配Snapshot与已保存模型证据；`studio.py` 保留兼容导出。工程/姿态/问题等纯模块直接依赖这两个边界，不反向借CLI/native入口拿文件能力。旧写锁/迁移/文件格式/签名规则保持；失败atomic replace清理自己的临时文件并保留原文件。open/save/import/rebuild/QA函数体经AST对照未变，原生编排调用点仍用兼容入口，未迁移native操作。
5. **N5b / Linux 范围已验证**：工程 ZIP 以1MiB块读取、哈希并压缩，导入按块校验/落盘，只有≤16MiB manifest完整读取。统一文件数、单文件、展开总量（包含manifest）、manifest和上传限制，导出同样拒绝casefold冲突，防止生成自身不能导入的包。失败仅清理临时ZIP，保留项目/历史。纯交付文件清单改分块哈希；native `export_model` 本体仍未修改，进一步交付打包/上传Base64资源优化需要PC真实产物与增长数据。
6. **W1 / 待 PC**：真实模型、CLI/桌面/native 集成和大型 CMO3 工程验收，沿用第 6 节的明确场景。

N3a 的三个新增回归在修复前全部失败，分别复现关闭后重启、旧 error/message 影响替换 Worker、关闭后迟到统计改变；修复后通过。补充旧 bridge 读写/捕获拒绝、迟到成功/失败、保存已提交后关闭和 50 次任务生命周期检查。它们证明队列/handler/实例收尾，不等于浏览器整体堆或 GPU 已做长期内存测量。

N3a 验收：前端 79 项，77 通过/原 Windows 路径 2 项跳过；构建通过。真实 React+纯 Python fixture 的 8 项 UI 回归通过，包括 StrictMode setup→cleanup→setup、真实 PNG Worker 捕获、卸载后旧 bridge/client 拒绝、重挂载捕获及旧 apply 拒绝。Browser plugin not available，沿用 Chromium/Playwright；桌面 1440×960、原窄屏用例390×844，页面身份/非空/无 Vite overlay/pageerror/交互与截图检查通过。证据 `/tmp/live2d-n3-evidence/`，不提交临时图片。未调用 native rebuild。

N3b 验收：前端82项，80通过/原2项跳过，构建通过。三项操作回归覆盖同一tick重入、Agent保存/手势互斥、保存成功基线发布期间仍BUSY、关闭后的旧进度/成功/失败/finally不影响新操作。UI原8项通过，新交付用例通过，StrictMode用例增加同tick重复读取只发送一次请求与旧读取迟到不清除新宿主门禁。交付生成响应为协议fixture，未执行真实native导出；其接入验收仍由W1完成。

N5a验收：前端86项（84通过/原2项跳过）、构建通过。新增源像素/Base64/裁切alpha/二值mask一致性、预算在读取/解码前拒绝与失败释放、取消/旧回调隔离、mask传输副本回归。真实UI使用2048²透明PNG，尺寸超限后恢复、三次导入/取消、Worker裁切检查、二值mask加载/编码、真实纯Python预检/提交；完成后导入Worker计数0、关闭后素材URL计数0。宿主fixture另控迟到Worker返回，effect已清理后URL创建数0。主线程仍承担mask编辑及≤16MiB原mask，准备副本≤16MiB，浏览器SVG图片/GPU和HTTP Base64副本不在codec池；384MiB并非整体浏览器内存上限，未声称RSS已测。bundle入口由N3b的473.20kB降至437.62kB，新增182.25kB的导入Worker按任务加载；未加依赖。UI完整10项通过，证据/tmp/live2d-n5a-evidence/。

N4验收：工程、Studio持久化、签名纯回归11项通过；新存储/查询4项通过，覆盖atomic replace/NaN拒绝后的原文件与tmp清理、竞争锁/异常释放、旧workspace身份迁移、原CLI `studio-open` 完整JSON响应相同。独立进程实际查询Snapshot后未加载studio/native编排模块。原生函数体AST保持，恢复中断测试在新store边界注入失败，既有checkpoint/恢复语义通过；UI完整10项通过。未改变lock文件协议或新增双重锁；默认历史保留。native生成、rig-edit实际引擎接入继续W1。

### N5b 验收与实际资源观测

新增3项纯归档回归通过：32MiB二进制fixture的流式写入与清单哈希，删除原工程/PSD后重开保留全部修订/姿态/产物；限制完整二进制`read_bytes`与ZIP整项`read`后仍可导出/导入；单文件/总量/manifest/数量/压缩上传/大小写冲突的拒绝；部分读取中断后ZIP/tmp/锁清理且项目与二进制保留。既有路径/哈希/恢复拒绝继续通过。fixture中的moc3是受控字节，不宣称真实模型已生成或通过SDK。

资源观测使用八个32MiB可压缩二进制fixture（共256MiB，16个归档文件）和32²真实PSD工程，两个独立Linux进程对比原`main`后N4的pack函数（3ccdeb8）与本批流式函数，`tracemalloc`包围pack阶段，`resource.ru_maxrss`记录进程累计峰值：

| 实现 | pack耗时（单次） | Python分配峰值 | 进程峰值RSS | ZIP大小 |
| --- | --- | --- | --- | --- |
| 原全量读取 | 1.688 s | 256.799 MiB | 331.512 MiB | 1,050,241 bytes |
| 流式 | 1.670 s | 2.324 MiB | 76.008 MiB | 1,050,236 bytes |

两次工程随机ID/时间不同，ZIP容器字节不要求相同；逐文件内容、SHA、引用与重开才是正确性验收。单次结果只证明该受控样本不再同时保留全部原始字节，不是大工程/不可压缩纹理的完整性能基准；真实CMO3/全部历史增长由W1补测。测试fixture可用`StreamingArchives.fixture`及`artifact(blocks=32)`重建，观测脚本在工作区外/tmp/live2d-archive-memory.py，未提交临时报表。

参考并读取了[CPython 3.12.8 的ZipFile实现](https://github.com/python/cpython/blob/v3.12.8/Lib/zipfile/__init__.py)：标准`write`本身即用`open(...,'w')`与`copyfileobj`流式写入，本项目原先在调用ZIP前把所有文件读入列表才造成峰值。本轮直接复用标准流接口并同时计算清单哈希，没有添加归档库或自建格式。React/GitHub和可访问的Reddit索引取舍仍见第8节，未把不可访问的Reddit全文当作依据。

### 最终 Linux 验收与复跑

- 前端 **86/86通过、0跳过**：新增`STUDIO_TEST_PYTHON=/absolute/path/to/python`可显式选Linux解释器，保留默认Windows路径。显式配置不存在则失败，不能掩盖错配。原先两项纯CLI协议/迁移检查现已实际执行，非native启动测试。
- 纯Python **18/18通过**：`python -m unittest tools.authoring_rig.tests.test_projects tools.authoring_rig.tests.test_studio tools.authoring_rig.tests.test_signatures tools.authoring_rig.tests.test_workspace_store tools.authoring_rig.tests.test_archive_streaming -v`。
- 真实React **10/10通过**，`STUDIO_UI_URL=http://127.0.0.1:5173 python -m unittest tools.authoring_rig.tests.test_studio_ui -v`，使用既有Vite服务和纯Python/API fixture；Chromium桌面1440×960/原窄屏390×844、身份/非空/无overlay/pageerror/交互/截图检查通过，预期409/400注入已区分。截图/tmp/live2d-final-evidence/，Browser plugin not available。
- `npm run build`通过，协议生成类型未变，无新增依赖；Vite的未来native config loader提示是原有未修改项。native export/keyform/open/save/import/rebuild/QA函数体已做AST对照，未改变原生编排算法。

### 现在的 PC plan / W1

Linux可独立验证的实施已完成；以下需要真实Windows及模型，云端不继续修改原生实现：

1. 合入各阶段后，在真实PC跑现有Windows回归和真实PSD的Rebuild/Overlay/姿态/动态预览/两种交付；保存IR→重建、设置保存后失败、修订恢复/再次保存和导入后的门禁都要覆盖。确认成功模型保留、取消/关闭后旧回调不能影响新的显示。
2. 复现native Agent prepare(A)→用户编辑/checkout(B)→迟到commit、关闭/重开与旧引擎基线；CAS应拒绝旧结果，新预览/错误状态保持。Linux草稿保护不能代替这个native交错验收。
3. 用包含build/review/import/delivery/poses/全部修订的真实工程归档→删除原目录→重开，核对文件哈希、模型引用、QA与动态资源。测大PNG反复导入/取消、模型iframe反复开关、交付/ZIP时的实际进程与GPU增长；允许有界缓存平台，不凭单次RSS峰值叫作泄漏。
4. 取得真实产物与内存证据后，再改`delivery.export_model`中全量文件打包与上传Base64副本。该函数涉及native准备、缓存、CMO3与交付发布，当前保留原实现；不要先引入multipart/后台job/历史删除系统。
