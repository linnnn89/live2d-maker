# Studio 草稿命令 v1（R1b）

人和 Agent 共用 `studio/src/editor/` 的命令、版本、差异与历史规则。UI 的图层显示、轮廓坐标、关键点和拖拽都通过该领域层执行。Agent 可直接调用结构化接口，无须模拟点击或修改 React 状态。

本轮限于美术 IR。命令不修改素材路径、图层 ID、层名、语义分类、bbox、绑定、物理或 Overlay。`commit` 复用已有 `save` API；完整 schema、素材与工作区版本仍由既有 Python 保存契约检查。重建与原生建模继续使用既有流程，未增加原生调用或 MCP 工具。

## 状态和版本

`inspect` 和 `diff` 都返回 `{ok:true,state}`。`state` 含：

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

修改请求必须携带当前 `{draftId,revision}`。UI 或另一个 Agent 修改后，旧请求返回 `DRAFT_CONFLICT`，需要重新读取、核对差异再决定下一步。跨标签页或外部 CLI 的并发写入由保存时的 `baseRevision` 校验处理，本接口没有跨标签页广播。

差异只覆盖命令拥有的字段；`null` 表示之前或之后不存在该字段。显示/透明度省略时按 `true`/`255` 比较，因此默认值相同的命令不产生修改。差异按字段聚合，并非逐条命令审计日志。

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

错误格式为 `{ok:false,error:{code,message,partId?,field?},state}`，未加载时 `state:null`。主要错误：`INVALID_REQUEST`、`INVALID_COMMAND`、`PART_NOT_FOUND`、`LANDMARK_NOT_FOUND`、`DRAFT_CONFLICT`、`BUSY`、`NOT_LOADED`；保存层还可能返回 `BASE_CONFLICT`、`BACKEND_BUSY`、`SAVE_FAILED`、`SAVE_MISMATCH`。失败响应含当前状态供重新核对，不应盲目重试覆盖。

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

本轮未实现实时图层合成、跨刷新恢复、原生绑定命令或现有 Kotlin Agent 工作区的事务联动。相关工作分别需要核对浏览器显示规则或用户 Windows PC 的端到端行为。
