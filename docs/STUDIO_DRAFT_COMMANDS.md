# Studio 草稿命令 v1（R1b / R1c）

人和 Agent 共用 `studio/src/editor/` 的命令、版本、差异与历史规则。UI 的图层显示、轮廓坐标、关键点和拖拽都通过该领域层执行。Agent 可直接调用结构化接口，无须模拟点击或修改 React 状态。

本轮限于美术 IR。命令不修改素材路径、图层 ID、层名、语义分类、bbox、绑定、物理或 Overlay。`commit` 复用已有 `save` API；完整 schema、素材与工作区版本仍由既有 Python 保存契约检查。重建与原生建模继续使用既有流程，未增加原生调用或 MCP 工具。

## 状态和版本

`inspect` 和 `diff` 默认返回完整 `{ok:true,state}`。`state` 含：

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 当前为 `1` |
| `draftId` | 本次草稿身份；打开新版本或成功保存后更新 |
| `revision` | 内存草稿版本；编辑、历史变更和锁状态切换后递增 |
| `baseRevision` | 已保存 IR 的工作区版本，由保存 API 校验 |
| `ir` | 当前候选 IR 的独立副本 |
| `changes` | 与已保存版本比较的 `{partId,field,before,after}` 数组 |
| `dirty`, `canUndo`, `canRedo` | 未保存修改和历史能力 |
| `phase` | `idle`、`gesture`、`saving` 或 `operation` |
| `history` | E1b 新增：`undoSteps`、`redoSteps`、`retainedBytes`、`maxSteps`、`maxBytes`、`droppedSteps`，历史数量/预算及被淘汰步骤数 |

修改请求必须携带当前 `{draftId,revision}`。UI 或另一个 Agent 修改后，旧请求返回 `DRAFT_CONFLICT`，需要重新读取、核对差异再决定下一步。跨标签页或外部 CLI 的并发写入由保存时的 `baseRevision` 校验处理；编辑 token 不跨标签页共享。E4 只广播浏览器备份记录变化，并不广播/覆盖活动草稿。

差异只覆盖命令拥有的字段；`null` 表示之前或之后不存在该字段。显示/透明度省略时按 `true`/`255` 比较，因此默认值相同的命令不产生修改。差异按字段聚合，并非逐条命令审计日志。

E1a 保持 v1 返回结构；E1b 在状态中新增只读的 `history` 统计，不改变请求结构、版本 token 或保存格式。`execute`/`inspect` 的状态仍是独立可修改副本；修改返回值不会提交编辑。React 内部订阅使用按版本缓存的冻结快照，同一状态重复读取保持引用稳定；等值命令和相同保存基线不触发订阅通知。内部图层索引不改变 IR 顺序或 ID 语义。

## 命令

`apply` 接受非空 `commands` 数组，命令按数组顺序执行。全部在独立候选 IR 上验证；任何一条失败，整批不改变状态、版本或历史。每批有效变更为一个撤销步骤。

| type | 除 `type`、`partId` 外的字段 | 规则 |
| --- | --- | --- |
| `set_visibility` | `visible` | 布尔值 |
| `set_opacity` | `opacity` | 0–255 整数 |
| `set_polygon` | `points` | 至少三个 `[x,y]`，有限数值，画布坐标 |
| `set_landmark` | `name`, `point` | 新增或更新一个关键点 |
| `remove_landmark` | `name` | 必须已存在 |

未知命令或字段被拒绝，图层按 ID 定位。关键点名称禁止空白及现有保留字段；关键点仍是注记，不驱动绑定。自由数值命令沿用现有编辑规则，不强制坐标落在 bbox 内；鼠标拖动继续按 bbox 限制位置。

## 浏览器 Agent 入口

打开 Studio 后，同页 JavaScript/浏览器自动化可以调用 `window.studioDraft.execute(request)`。它是当前标签页的异步结构化入口；没有 HTTP/MCP 地址，无浏览器连接的 Agent 使用下节的离线工具。

```javascript
const read = await window.studioDraft.execute({schemaVersion: 1, operation: 'inspect'});
if (!read.ok) throw new Error(read.error.message);
const partId = read.state.ir.parts[0].id; // 应先选择实际目标图层
const changed = await window.studioDraft.execute({
  schemaVersion: 1,
  operation: 'apply',
  state: {draftId: read.state.draftId, revision: read.state.revision},
  commands: [
    {type: 'set_visibility', partId, visible: false},
    {type: 'set_landmark', partId, name: 'iris_center', point: [200, 300]},
  ],
});
if (!changed.ok) throw new Error(changed.error.message);
console.log(changed.state.changes); // 核对结果
```

随后选择 `undo`、`redo`、`discard` 或 `commit`，请求携带最新 token，例如：

```javascript
const committed = await window.studioDraft.execute({
  schemaVersion: 1, operation: 'commit',
  state: {draftId: changed.state.draftId, revision: changed.state.revision},
});
if (!committed.ok) throw new Error(committed.error.message);
```

成功返回新草稿状态及保存 API 的 `saved` 快照，并刷新界面的已保存版本。`commit` 只保存 IR，模型仍可能待重建；无修改时跳过 API。保存期间禁止其他修改，失败保留候选 IR 和撤销历史。`SAVE_MISMATCH` 表示保存响应与候选不一致，需重新打开工作区核对；这不保证远端保存未发生。

错误格式为 `{ok:false,error:{code,stage,message,retryable,partId?,field?},state}`，未加载时 `state:null`。E3 新增 `stage` 和 `retryable`，既有 code/message 不变；调用方按 code 分支，message 仅供显示。主要错误：`INVALID_REQUEST`、`INVALID_COMMAND`、`PART_NOT_FOUND`、`LANDMARK_NOT_FOUND`、`DRAFT_CONFLICT`、`BUSY`、`NOT_LOADED`；保存层还可能返回 `BASE_CONFLICT`、`BACKEND_BUSY`、`EDIT_SCOPE`、`SAVE_FAILED`、`SAVE_MISMATCH`。失败响应含当前状态供重新核对，不应盲目重试覆盖；retryable 也不授权自动重发写操作。

E3 增加只读响应选择：`inspect` / `diff` 可带 `response:"summary"`，返回 token、基线、差异、历史和阶段，不返回 `ir`；或带 `response:"parts",partIds:["<ID>"]`，额外返回独立的 `parts` 副本。省略 partIds 时返回所有图层，指定 ID 时保持 IR 原顺序；任一 ID 不存在则整体失败。partIds 仅用于 parts 响应，不能用于修改或捕获请求。轻量响应中的 token 与完整状态相同，仍可提交命令；它不包含 IR，不能将其当作完整离线提案。有效的轻量读取失败时 state 为 null，避免重新返回完整 IR。默认或 `response:"full"` 保持旧 v1 完整响应，无须修改既有 Agent。

协议单一来源为 [protocol.schema.json](../schemas/studio/protocol.schema.json)，封装版本 `1` 与 IR 自身 `schemaVersion:"0.1.0"` 分开。共享解析入口用于浏览器、离线 Node 和 HTTP 桥接；Python 使用同一 schema。IR 部分只是传输结构，保存时仍核对完整 authoring-rig schema、素材/哈希、稳定 ID、编辑范围与 revision，不替代任何持久化验证。

HTTP / Python Studio 成功快照和导入预检新增 `schemaVersion:1`。失败仍保留旧 `status:"error",error:"message"`，同时新增 `detail:{code,stage,message,retryable,partId?,field?}`。HTTP 的版本/忙冲突为 409，非法请求为 400，体积超限为 413，CLI 启动/非法响应为 502；来源与方法限制继续执行。旧服务端字符串仅在统一适配器内解释。旧无 envelope 的保存/导入请求保持接受，显式携带未知 schemaVersion 会拒绝。

## 无浏览器的 JSON 工具

安装 Studio 现有依赖后，在仓库根执行：

```bash
node studio/scripts/draft-cli.mjs < request.json > proposal.json
```

`request.json` 格式如下，`ir` 应为完整现有 IR，`baseRevision` 应取自工作区快照：

```json
{
  "schemaVersion": 1,
  "baseRevision": "<工作区保存版本>",
  "ir": {"canvas": {"width": 100, "height": 100}, "parts": []},
  "commands": [{"type": "set_visibility", "partId": "<真实图层ID>", "visible": false}]
}
```

上例仅展示结构；空 `parts` 无目标图层会返回 `PART_NOT_FOUND`。工具读取 stdin，stdout 只输出一行 JSON。成功为 `{ok:true,state}`，失败为 `{ok:false,error}` 并退出非零。`state.ir` 与 `state.changes` 是候选及差异；工具不读素材、不写工作区、不连接保存服务、不调用 Python/JVM。本地 IR 初步结构及命令检查不能替代保存层的完整验证。

每次执行为独立草稿，输出 token 不能用于 Studio 标签页。若将离线命令交给浏览器执行，应重新读取该标签页状态，以同一 `commands` 发起 `apply`，核对差异后再 `commit`。机器调用推荐直接执行 Node；`npm run draft` 是同工具的便捷入口，npm 可能附加日志。

## UI 和历史边界

顶部提供撤销、重做、放弃草稿，画布底部可展开逐字段差异。一次拖动包含多个移动事件，但只占一个历史步骤；指针取消或丢失捕获会恢复拖动开始状态。拖动中外部命令被拒绝，避免交错历史。

历史限于当前标签页当前草稿，不持久化。保存或成功导入新版本开始新草稿，清空历史；放弃草稿恢复最后已保存 IR 并清空历史。返回同一保存版本的构建/QA 快照不重置草稿。导入弹窗及构建/QA 期间可读状态，禁止命令写入。Cubism 参数预览属于独立 viewer 状态，不进入 IR 历史。

E1b 每步只保存受影响图层的 before/after 引用；不可编辑的素材/语义等内容在内部共享，命令只复制目标图层及被编辑字段。公开命令响应和独立 `applyCommands` 的输出仍完整隔离，修改返回值不会改变源 IR 或历史。

默认撤销与重做合计最多 100 步，并且历史负载最多 16 MiB。`retainedBytes` 是每一步 `[{index,before,after},...]` JSON 的 UTF-8 字节数之和，保守重复计算共享字段；它不是 JavaScript 堆或整个页面内存上限，不包括基线、当前快照、活动拖拽或渲染器。超出条数或字节预算时从最早撤销步骤淘汰，界面显示历史限制提示，`droppedSteps` 累计被预算淘汰的步骤。撤销/重做移动同一条记录，不重复占用预算；有效的新编辑清空重做，等值编辑或失败批次保留原历史。

单步本身超过 16 MiB 时，编辑照常生效，但该步不能撤销，并清空之前的撤销/重做历史，防止跨过未记录修改。后续在预算内的新步骤可以正常撤销到该状态；放弃草稿仍可恢复已保存基线。拖拽仅在完成时计算一个步骤，取消或最终回到原值不消耗预算、不淘汰历史，并保留重做。保存失败保留现有历史；放弃或开始新草稿清零预算统计和淘汰计数。

R1c 已加入即时图层合成与下述图像读取接口；E4 已加入后述草稿备份和恢复。原生绑定命令及现有 Kotlin Agent 工作区的事务联动尚未实现。


## R1c 版本化美术图像输出

浏览器新增独立只读方法 `window.studioDraft.capture(request)`，不改变原有 `execute` 契约、草稿版本或历史。请求为 `{schemaVersion:1,state:{draftId,revision},source?:"draft"|"saved"}`，默认 `draft`。`saved` 读取该草稿的保存基线；两种来源都要求当前草稿 token，以便明确对照关系。

```javascript
const read = await window.studioDraft.execute({schemaVersion: 1, operation: 'inspect'});
if (!read.ok) throw new Error(read.error.message);
const result = await window.studioDraft.capture({
  schemaVersion: 1,
  state: {draftId: read.state.draftId, revision: read.state.revision},
  source: 'draft',
});
if (!result.ok) throw new Error(result.error.message);
// 将 dataUrl 作为多模态 Agent 的图像输入；勿把 base64 当文本塞进提示词。
console.log(result.image.draftId, result.image.revision, result.image.bounds);
const imageInput = result.image.dataUrl;
```

成功响应为 `{ok:true,image}`，`image` 包含：

| 字段 | 含义 |
| --- | --- |
| `mimeType`, `dataUrl` | `image/png`，以及 `data:image/png;base64,...` |
| `width`, `height` | 完整 IR 画布的原始像素尺寸 |
| `bounds` | 非零 alpha 范围 `[left,top,right,bottom]`，空画布为 `null` |
| `source` | `draft` 或 `saved` |
| `draftId`, `revision`, `baseRevision` | 图像绑定的草稿身份、请求版本和保存基线 |
| `renderVersion` | 当前像素渲染契约为 `1` |

图像只包含平面美术，没有棋盘格、选中轮廓、关键点标记、页面文字或 Cubism 模型。预览姿态、画布聚焦和屏幕尺寸不影响导出像素；隐藏图层与零透明度不出现在图像中。渲染共享现有 Python 的像素中心裁切、even-odd 和普通 alpha 合成规则；导出 PNG 的 RGBA 与仓库的 Python 对照样本逐字节一致。

调用前或异步完成时 token 不匹配均返回 `DRAFT_CONFLICT`，不返回可能被误认成新版本的图像。拖拽、保存或工作区操作中返回 `BUSY`。失败格式为 `{ok:false,error:{code,stage,message,retryable,partId?,field?}}`；素材读取、哈希、尺寸、格式问题分别可能返回 `ASSET_LOAD`、`ASSET_HASH`、`ASSET_SIZE`、`ASSET_FORMAT`，超出 16777216 像素限制返回 `IMAGE_SIZE`。16 位 PNG 当前明确拒绝；工作区原文件不会因此改变。返回错误后可修复素材或重新读取状态再尝试，不会悄悄跳过图层。

界面“导出美术 PNG”调用相同读取流程。只有显式导出编码 PNG，日常拖动传输 RGBA 并重绘。解码和逐像素工作在 Worker 中；屏幕显示使用 Canvas，缩放插值不能作为原始像素相等性的判据。

这个图像入口需要当前 Studio 标签页以及可读取的工作区素材。离线 `draft-cli.mjs` 仍只生成 JSON 提案，没有新增远程渲染服务或自动保存能力。

### E2 像素身份、调度与资源边界

像素缓存身份包含画布、可见层序、素材路径/哈希/大小/位置、轮廓与透明度；注记、选中、锁和草稿 revision 不进入像素身份。最多复用两幅完整成图，保存与草稿可命中同一结果；外部返回的像素副本彼此隔离。此缓存不会替代 capture 的请求前后 token 核对，即使像素相同，编辑期间的旧 capture 仍返回 `DRAFT_CONFLICT`。

默认总管线预算 384 MiB：48 MiB 保守预留给最多六份请求副本，336 MiB 共享 LRU 池计入解码/裁切缓存、活动素材和完整帧、编解码保守工作量、传输及等待客户端确认的结果。活动内容固定，预算优先淘汰未使用缓存；分配前预算不足即失败。它是受管分配/工作量的上限，不代表精确 JS 堆、GPU、浏览器 RSS 或调用者持有已完成响应的总上限。图片解码串行；尺寸和 IDAT 解压长度在进入像素解码器前校验，16 位格式依旧明确拒绝。

只有一个 Worker 任务执行，最多排队一个最新显示请求；新显示取代旧排队请求，并取消正在执行的旧显示，逐行像素工作协作让出。同步 PNG 编解码只能在调用前后检查取消。显式截图最多四个（含正在执行的截图），保持顺序；显示取消不会取消显式截图。每份 IR JSON 最多 2 MiB，输入 PNG 最多 16 MiB；素材和画布的 16777216 像素限制仍适用。大画布编码所需工作量可能在达到像素上限前超出预算，失败不输出缩小或部分图像。

新增资源错误：`QUEUE_FULL`（显式截图超过四个）、`MEMORY_BUDGET`（IR 请求超限或共享预算不足）、`ABORTED`（过期显示或释放客户端）、`BACKEND_BUSY`（直接并发调用像素引擎）。队列或预算错误不会更改草稿；可等待当前任务结束后重试。已有素材、几何及版本错误规则不变。

## E4 稳定工作区与浏览器草稿恢复

工作区快照新增 `workspaceId`，由 Python 持久化到 `studio-state.json`，不使用名称或临时 draftId。新工作区创建一次 UUID；旧工作区首次打开/读取时在已有排他锁内补齐 ID，只更新工作区状态，IR、源素材、版本和成功产物不因迁移变化。移动工作区保留 ID；复制整份工作区也会保留它，代表同一项目身份。

浏览器 IndexedDB 保存协议版本 1 的增量检查点：workspaceId、draftId、baseRevision、revision、updatedAt 和字段 before/after changes，不复制整份 IR 或整套历史。完成编辑并回到 idle 后合并等待 200 ms，写入串行并只保留最新待写状态；拖拽/保存中的中间状态不备份。只有事务完成才显示“草稿已备份”。同一记录最多 8 MiB，同一工作区最多 20 份/32 MiB JSON 负载；超限拒绝新写入，保留旧记录和当前内存草稿，提示导出/删除旧记录或重试，不自动淘汰未知草稿。

刷新或重新启动同一浏览器配置后，先读取已保存 IR，再列出恢复记录，绝不自动应用。基线相同可选择“恢复草稿”；基线已变化时逐字段比较 before/after，只有当前值仍等于 before 的命令可重放，已等于 after 的跳过，冲突/缺失图层保留在旧记录并显示差异。重放兼容修改为一个原子编辑步骤，可一次撤销；仍须显式保存 IR。原历史不恢复。已有未保存草稿时禁用恢复，需先保存或放弃，避免交错覆盖。

不同标签页使用不同 draftId 记录，不互相覆盖；备份变化通过 BroadcastChannel 或窗口重新聚焦刷新。保存、放弃或撤销到无修改时，只删除本页成功写入的记录。被选中恢复的旧记录仍保留，尤其是包含未重放冲突的记录；可导出完整检查点 JSON，或明确确认删除。删除事务再次核对 revision/updatedAt，记录已更新时返回 `RECOVERY_CONFLICT` 并保留新记录。错误还包括 `RECOVERY_FORMAT`、`RECOVERY_WORKSPACE`、`RECOVERY_SIZE`；浏览器拒绝存储/配额错误直接在备份状态显示，当前编辑不被清空。

备份属于该浏览器配置及 `127.0.0.1:5173` 来源，浏览器清理、隐私会话或未提交事务的强制中断可能使它丢失。pagehide 尝试提交，但不能保证最近 200 ms 或未完成手势在进程崩溃时恢复；重要修改仍应保存 IR 或导出记录。JSON 检查点不是完整模型包，导出后当前没有独立文件导入按钮，可用既有命令提案流程核对并重放兼容字段。
