# Live2D Studio（P5 / P6）

本地三栏编辑器：Parts 列表、原图上的 polygon/landmark 编辑、实际 Cubism 预览与参数滑块。编辑保存到隔离工作区的 IR；Rebuild 调用既有 Python → PSD → 原生 PSD2Live → moc3 链，Run Pose QA 调用 P1。Vite 中间件仅转发白名单 CLI，不承担模型业务逻辑。

工具开发以编辑、导入、重建和 QA 工作流为验收目标。现有 mouth_open、tongue、upper teeth 用于回归验证；无需为了完成软件开发逐类制作一套角色素材。

预览由独立 ViewerAdapter 管理加载、错误、取景及重绘。参数滑块和重置按动画帧合并重绘，不编码 PNG；需要截图时才调用截图接口。预览区标明当前已保存模型，或提示未保存/已保存但尚未更新的修改。独立 viewer 支持 `embed=1`，由自身控制嵌入布局。

前端检查：`npm run build`；预览适配器、草稿命令与美术像素回归：`npm test`。这些用例不依赖 Python、JVM、Edge 或 Windows。

E3 的命令、捕获、工作区快照、导入和错误 DTO 来自 `schemas/studio/protocol.schema.json`。修改契约后在 studio 中执行 `npm run protocol:generate`；生成的 TypeScript/运行时 schema 一起提交，build 会检查生成结果是否过期。浏览器和 Node 使用同一解析入口，Python 使用仓库既有 jsonschema。新增三项协议回归，其中真实 CLI 用例在存在项目 Windows Python 时执行，否则明确跳过；其余前端回归仍无需原生环境。

Agent 的 inspect/diff 默认仍返回完整 v1 状态，可选择 summary 或指定图层以减少响应。UI/CLI/Agent 按稳定 code 识别错误，新增 stage/retryable，HTTP/Python 保留旧错误字符串供兼容。保存冲突不会自动重试或清空草稿。具体字段与兼容规则见命令契约。

E4 在编辑完成后自动保存增量草稿备份。刷新或重新启动同一浏览器配置后，选择恢复记录才会修改当前草稿；基线变化会列出兼容与冲突字段，只能显式重放兼容修改，再保存 IR。一次恢复可一次撤销，旧撤销历史不恢复。旧记录可导出或确认删除，多标签页各自备份，保存/放弃只清理本页记录。工作区稳定 ID 存在 studio-state.json，旧工作区在已有锁内自动补齐，不改源素材、IR 或生成产物。

单份检查点最多 8 MiB，同一工作区最多 20 份/32 MiB；备份失败仍保留当前编辑和旧记录，可重试。只有“草稿已备份”表示 IndexedDB 事务完成。备份依赖浏览器配置/来源，清理浏览器数据会删除它；最近 200 ms、未完成手势或强制进程中断不能保证恢复。重要修改仍须保存 IR。精确恢复、删除和资源规则见命令契约。

R1b 提供撤销、重做、放弃草稿和逐字段差异；一次拖动为一个撤销步骤，保存或导入新版本后清空草稿历史。人和 Agent 共用版本化命令。浏览器 Agent 使用 `window.studioDraft.execute`；无浏览器的 Agent 使用 `node studio/scripts/draft-cli.mjs` 从 JSON 生成候选 IR 与差异。调用契约、并发和保存边界见 [STUDIO_DRAFT_COMMANDS.md](../docs/STUDIO_DRAFT_COMMANDS.md)。离线工具只生成提案，工作区保存仍需现有完整验证。

E1b 的撤销/重做合计保留最近最多 100 步，历史 JSON 负载不超过 16 MiB；每步仅记录受影响图层。达到预算后淘汰最早步骤并提示可用历史数量。单步超过预算时保留编辑结果，但该步不可撤销，并切断旧历史；放弃草稿仍可恢复已保存 IR。取消拖拽不占用历史。这里的 16 MiB 是序列化历史预算，不是整个浏览器内存上限；统计和精确定义见命令契约。

E2 将像素内容身份与草稿并发 token 分开；注记和编辑锁变化不重算美术，保存/草稿复用最近两幅完整成图。素材顺序加载、解码，过期显示任务在可让出的边界取消；显式导出保持版本核对。默认美术管线预算 384 MiB，其中 48 MiB 预留给有界请求副本，336 MiB 统一计入解码/裁切缓存、成图、活动缓冲、编解码工作量及待确认结果。该值是保守的受管工作量预算，不是浏览器进程、GPU 或调用者长期持有已完成截图的总内存上限。

管线同一时刻只执行一个任务，最多等待一个最新显示请求和四个显式截图（截图总数含执行中的截图）；每份 IR JSON 最多 2 MiB、输入 PNG 最多 16 MiB，素材/画布仍最多 16777216 像素。PNG 解码前检查尺寸及解压长度，忽略非像素辅助块。请求或编解码工作量超限时返回 `QUEUE_FULL` / `MEMORY_BUDGET`，保留草稿并可在任务结束后重试；不会缩小导出或跳过图层。像素上限以内的大画布也可能因完整 PNG 编码工作量超过预算而无法导出。详细边界见命令契约。

## 启动

需要仓库已有 `python/Scripts/python.exe`、`requirements-tools.txt` 中的依赖、`portable/PSD2Live` 与已核对的 Cubism runtime。前端使用 Node `^20.19.0 || >=22.12.0`，本轮实测 Node 24.19.0。只安装项目内依赖：

```powershell
Set-Location I:/live2d-maker/studio
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/`，项目页可导入自己的 PSD、新建隔离工程、打开 Studio 归档及选择最近工程。日常使用无需设置启动变量。“打开开发工作区”（`?legacy=1`）保留原入口：首次将 ds 示例导入 `out/studio/`，或使用下述变量；已有工作区不会被重新导入。

首次打开遇到 `409` 工作区忙时，间隔 1 秒、2 秒自动重试，最多尝试 3 次。仍失败或遇到其他错误时，显示“重新打开工作区”，可等待当前命令结束或修正错误后重试，无须刷新页面。工作区未加载时，底部显示 IR 未加载、各产物状态未知，不显示已保存/已更新。打开请求在页面卸载时取消；写操作不自动重试。

导入其他 IR 或 PSD 时，启动前指定环境变量，输出必须是独立的新目录：

```powershell
$env:STUDIO_IR = 'out/iteration-audit/p6-mouth/final-ir/authoring-rig.json'
$env:STUDIO_WORKSPACE = 'out/studio-mouth'
npm run dev
```

开发工作区的 `STUDIO_PSD` 与 `STUDIO_IR` 二选一，相对路径均相对于仓库根；更换源模型要换新的 `STUDIO_WORKSPACE`。项目页工程存入 `out/studio-projects/<id>/`，各工程 API/资源路径和页面身份独立。输入 PNG 复制归档，源 PSD 和源 IR 从不就地保存。

## 操作与几何语义

1. 选图层；搜索只过滤列表，眼睛按钮修改 visibility。
2. 在全图或“聚焦图层”视图拖蓝色 polygon 顶点，或选中顶点后编辑 X/Y（原画布像素）。鼠标拖动限定在当前栅格 bbox 内。
3. 保存 IR。未保存时显示待更新；保存采用 revision 校验，另一窗口的旧版本会明确失败。
4. 点击 Rebuild；有未保存修改时先保存。独立目录保存 PSD、原生模型、标签审计、警告和构建 IR。成功后替换预览 URL；失败继续显示上次成功模型，旧产物保留。
5. 参数滑块读取 `window.viewer.params()` 的实际范围，并通过 `setParams` + `snapshot` 更新画面；重置恢复原生默认值。
6. 模型与当前 IR 一致时可运行 Pose QA。默认 16 姿态覆盖 neutral、头 X/Y/Z ±30、身体 X ±10、嘴 0/0.5/1、闭眼、闭眼张嘴和可用的头发参数 ±1。头发参数由导出的 CDI 清单确定；其余必需参数缺失或范围不足仍失败，不静默删姿态。产物包含固定 spec、spec hash、实际参数/镜位、16 张完整 PNG、contact sheet 和 review.json；界面可查看联系表。每次尝试先取消旧的成功 gate，失败不会继续显示本次 QA 通过。

`polygon` 是当前 PNG 的 alpha 裁切边界，按原画布像素中心、even-odd 填充；外部 alpha 置零，内部 alpha/RGB、PNG 原文件、offset/bbox 不变。不提供补画、形变或拓扑编辑；收缩后再扩张可以从保留的原 PNG 恢复。默认导入 bbox 矩形与不提供 polygon 均保持原栅格。`landmarks` 可添加命名点和拖动，保存到 IR，暂不驱动 PSD2Live 绑定。画布默认按当前草稿即时合成，隐藏、透明度和轮廓变更会更新美术画面；右侧展示最近一次成功导出的 moc3。

本界面仅允许编辑 geometry/appearance，不开放 source hash、asset 路径/哈希、稳定 ID、语义、层名或 z 序写入。语义仍由 PSD2Live 的层名分类。默认取景由透明像素 bbox 测量，不使用 Agent 视觉估坐标，因此此流程不触发 P2。

“全图”按当前显示参照图的 alpha 范围取景，包含原人物范围之外的新素材。快照保留 `sourceBounds`（原始参照），新增 `artworkBounds`（当前显示参照图）及 `build.modelBounds`（上次成功构建对应 IR 的平面合成范围）。Cubism 自动取景使用成功模型自己的范围；确认新素材但尚未重建时，旧模型镜位保持不变。新构建报告保存模型范围；旧报告缺少该字段时从其 `build-ir.json` 和保留素材计算，无须修改原报告。范围由对应版本的平面 artwork 测量，不代表所有变形极值的动态包围盒。

画布可切换“当前草稿”“已保存美术”“原始参照”。前两者使用同一像素渲染器，后者保留工作区打开时的参照图；查看保存版本和原始参照时不能拖动轮廓。保存后更新对照基线，美术变化不会自动重建模型。

R1c 的 PNG 解码、像素中心 even-odd 裁切、透明度及普通 alpha 叠加在 Web Worker 中执行；图层素材和裁切结果有缓存，普通重绘不编码 PNG。“导出美术 PNG”及 `window.studioDraft.capture` 显式导出完整画布，不包含网格、控制点或 Cubism 模型。Agent 响应携带草稿和保存版本，生成期间发生修改会返回冲突。契约见 [STUDIO_DRAFT_COMMANDS.md](../docs/STUDIO_DRAFT_COMMANDS.md#r1c-版本化美术图像输出)。

使用纯 JavaScript `fast-png@8.0.0` 保留未预乘的 PNG 样本。支持 8 位 RGB/RGBA、灰度/灰度 alpha 和低位深调色板/灰度 PNG；16 位 PNG 明确报错。单张素材和画布最多 16777216 像素；超限、缺失、尺寸或哈希不符会显示错误，不能导出部分合成结果。浏览器屏幕缩放可能插值，像素一致性按导出的原始尺寸 RGBA 核对。

## 导入生成素材

先保存 IR，再点击顶部“导入素材”。选择 8 位 RGBA 透明 PNG（最大 16 MB），填写可识别的层名与来源说明，选择手绘/人工制作、外部素材或 AI 生成；只有 AI 素材需要提示词。可新增顶层，或按现有图层 ID 替换；替换保留 ID、z 序和显示设置，画布高亮原目标位置。隐藏图层不可在此流程替换。

在画布拖动蓝色矩形放置素材，用四角手柄缩放；缩放启用按可见内容等比适配，精确整数坐标在折叠设置中。未勾选适配时要求素材尺寸等于放置范围。可选源矩形裁切记录排除的可见像素，放置示意同步显示裁切/适配和替换结果；浏览器插值与 Pillow 最终缩放可能不同，以预检合成图为准。

mask 默认全图保护。使用“矩形可编辑区”或连续画笔开放局部，“恢复保护区”擦除；可重置，也可载入与画布同尺寸的二值 PNG（最大 16 MB），再继续绘制。绿色显示可编辑区。持久检查使用原画布分辨率的 0/255 灰度 mask，界面示意最多 1024 像素长边，不对大图的 mask 数据降采样。mask 必须同时包含保护区和可编辑区，不能全图开放。

点击“检查导入”复用 `import-generated` 的完整验证，检查配准素材及前后合成图在保护区内的变化；违规显示画布范围和调整说明，不裁掉违规像素。局部前后图默认聚焦放置区域，可切换全图、并排/导入前/导入后或打开原图；报告显示变化像素和范围，以及保护区的可见像素、变化像素、最大差值。

预检和取消均不修改活动 IR、源文件或成功模型/QA。放置、绘制、来源或其他输入变化会使预检失效。“确认导入”再次核对工作区 revision、候选 IR/素材哈希、原图/mask/来源记录及 AI 提示词证据；其他编辑器修改后必须刷新并重新预检。确认后更新 IR/画布，旧模型和 QA 保留但标为待更新，须 Rebuild 后再运行 Pose QA。每次成功预检归档到 `imports/<id>/`，保留原图、mask、asset-source.json、前后图、报告和候选 IR；AI 另存提示词。图层“素材来源”显示来源说明、AI 提示词和原图 SHA-256。取消保留审计档案，不自动清理；尚未提交的放置/mask 只存在当前对话框，关闭即丢弃。

主画布的自由编辑仍仅开放 geometry/appearance；素材、层名与语义变更通过严格的导入契约完成。此入口不调用生成 API，也不从不透明图分离背景。原有 import-generated CLI 和 prompt 字段保持 AI 导入兼容；新客户端传 origin，不为人工素材制造提示词。IR provenance 的 external、description、prompt 新字段需要当前 schema，旧文件不自动改写。

## CLI、Overlay 与运行边界

所有命令在仓库根执行 `python/Scripts/python.exe -m tools.authoring_rig`，stdout 为 JSON，失败非零：

- `studio-open --workspace <新目录> [--ir <ir.json> | --psd <source.psd>]`
- `studio-snapshot --workspace <目录>`
- `studio-save --workspace <目录>`：stdin 为 `{"revision":"...","ir":{...}}`。
- `studio-import-preview --workspace <目录>`：stdin 为 `{"revision":"...","generatedPng":"<base64 PNG>","maskPng":"<base64 PNG>","bounds":[left,top,right,bottom],"name":"tongue","prompt":"生成说明","replacePart":null,"fit":false,"spriteBounds":null}`。返回预检 ID、版本、前后图 URL 和像素报告；文件名由服务端固定，不接受浏览器文件路径。
- 新来源契约用 `"origin":{"kind":"manual或external","description":"作者/制作或来源说明"}` 替代 prompt；AI 使用 `{"kind":"ai","description":"来源说明","prompt":"提示词"}`。非 AI 来源拒绝 prompt 字段。离线 `import-generated` 可通过 `--origin-file <AssetOrigin JSON>` 使用同一契约；未提供时仍须 `--prompt-file`，按原 AI 流程处理。
- `studio-import-commit --workspace <目录>`：stdin 为 `{"id":"<预检 ID>","revision":"<预检版本>"}`，返回更新后快照。重复确认或旧版本候选均拒绝。
- `studio-rebuild --workspace <目录>`
- `studio-qa --workspace <目录> --port 5173`：须有正在运行的 Studio dev server，负责本地资源路径。

默认无 Overlay，界面明确显示“未载入”。可同时设置 `STUDIO_OVERLAY` 与 `STUDIO_OVERLAY_BASELINE`，在新工作区归档既有 Overlay 及其原始 native-base.json。重建调用 `native-replay` 比较完整原生签名，`needs-review`/`broken` 明确失败并保留旧模型，绝不自动忽略 Overlay 或批准其应用。只有成功构建匹配当前 IR、Overlay 和 baseline 文件哈希时，快照才显示原生应用后的 `ok`；否则使用保守预检或对应的失败报告。失败原因在刷新后保留，QA 入口关闭；编辑后恢复数值相等的原 IR，可重新对应原成功模型/QA，JSON 的整数与等值浮点写法不会单独造成失效。旧的附带 Overlay 构建报告没有输入哈希时，须重新 Rebuild 一次。Studio 中尚无手工解决 Overlay 冲突的界面。

存在 `psd2live/build/libs/psd2live-0.7.1.jar` 时，使用该源码应用 JAR 和原便携 JVM/依赖；否则用便携版。Overlay baseline 必须来自相同运行时。UI 已实测源码 JAR 的无 Overlay 闭环，以及附带 ArtMesh geometry/opacity Overlay 的成功应用、IR 轮廓变化拒绝、目标缺失拒绝、刷新保留与恢复；固定镜位像素对照确认指定 X+30 姿态生效，并运行 16 姿态 QA。其他 Overlay owner/channel、journal、physics 组合尚未在 Studio 逐项视觉验收。

仅监听 127.0.0.1:5173，固定端口；API 检查 Host/Origin，每个工程写入串行化，Python 工作区也有排他锁，子进程不经 shell。仅服务工作区内白名单 PNG/JSON/moc3、指定下载归档与既有 viewer/vendor 资源，不暴露整个仓库。若异常退出留下 `.studio.lock`，先确认该工作区没有运行中的命令，再移除这个锁文件；保留 `.project-transaction.json`，下一次 CLI 打开会继续未完成的恢复事务。

`npm run build` 进行 TypeScript 检查和前端打包；`dist` 不是可以独立执行 CLI 的发布包，操作功能需要 dev server。当前没有产品发布、打包安装器、Agent 自动生成几何、ImageGen 按钮、物理实时预览或 Cubism Editor 美术验收。默认 QA 是静态姿态检查。

E5 将打开/保存/导入/原生任务编排放在 `src/workspace/useWorkspaceActions.ts`，画布、图层、点属性和差异在同目录。`bridge/transport.ts`、`runner.ts`、`resources.ts` 分别负责 HTTP、Python CLI 和资源白名单；Vite 配置只组合它们。交互、命令和单工作区排他请求语义保持，尚无后台任务队列。

保存关键点注记后，不再将已有 PSD/模型/Pose QA 标记为待更新；关键点仍不驱动绑定。轮廓、显示、素材或绑定输入变化仍需更新。模型和 QA 保留原始生成 revision，以版本化模型输入签名核对；旧/未知报告不能证明对应关系时仍要求重建/检查。手动 Rebuild 仍执行重建。

## 项目构建设置

右侧“项目构建设置”提供贴图尺寸（1024/2048/4096）、网格内部间距（12–80 px）和头部转向强度（0–2）。默认 2048/40/1 保持既有预览行为。内部间距越小网格越密，原生按部件规则调整；它对应 `meshInteriorDensity`，不改变用于组件拆分的 `meshSpacing`。转向强度 0 关闭头部转向位移，具体模型效果仍需预览检查。

先保存或放弃美术草稿，再“保存设置”或“保存并重建”。设置未保存时模型仍使用磁盘设置；已保存但未重建时旧模型保留并标明待更新，QA 关闭。面板显示上次构建实际采用值。重新读取设置会替换面板输入，放弃设置修改只恢复本页设置输入；构建设置不进入美术撤销栈。未保存设置在正常离开页面时提示，尚无自动设置草稿备份。

设置保存在工作区独立 `build-settings.json`，不进入美术 IR；旧工作区缺该文件时读取默认值且不自动写入。CLI `studio-build-settings --workspace <目录>` 从 stdin 接收 `{ "schemaVersion":1, "revision":"<IR revision>", "settingsRevision":"<快照 buildSettings.revision>", "settings":{ "schemaVersion":1, "atlasSize":2048, "meshInteriorDensity":40, "headTurnStrength":1 } }`。IR 或设置版本冲突拒绝写入；`SETTINGS_CONFLICT` 对应 HTTP 409，界面保留本页输入，用户明确重新读取后再提交。

构建、失败和 QA 报告同时记录模型输入与设置签名，构建目录保存设置副本。设置变更使模型/QA 失效，美术 PSD/PNG 不变；旧无设置签名报告仅能对应原默认值。改变设置不会把另一组设置下的原生失败结论误认成当前结果，但目标不存在等自身非法 Overlay 仍拒绝。物理及交付文件选项随后续迭代开放。

## 工程保存、修订与归档

项目页直接上传 PSD 或 `.studio-project.zip`，上限 128 MiB。PSD 的分组、蒙版、非普通混合、效果、clipping 和缺失像素会统一列出位置和原因；受限文件不创建工程，不做隐式栅格化。原文件完整复制为 source.psd。工程名独立于导入的图层/美术名称。最近工程列表读取本机持久目录，重新启动仍可打开。

“保存 IR”提交美术修改；右侧“保存项目修订”会先保存当前美术草稿，再捕获已保存美术、构建设置、Overlay/原始基线和构建/检查引用，生成不可变修订。未保存的设置输入须先保存或放弃。修订含 parent，可恢复旧分支点后继续保存；不是复制浏览器撤销栈。保存核对 IR、设置及保存修订 head，外部变化会返回 BASE_CONFLICT / SETTINGS_CONFLICT / PROJECT_CONFLICT，保留输入供明确重新读取。

恢复只开放给无美术/设置草稿的状态，先保存当前状态为“恢复前自动保存”，再恢复选中修订。原始素材、其他修订和成功产物都保留。恢复事务有持久记录；正常失败释放锁后下一次 CLI 会继续完成。强制进程结束仍可能留下原排他锁，按上述说明确认进程结束后释放锁再打开，不能删除恢复事务。

“下载 Studio 工程”归档当前已保存内容、源 PSD/原图、素材/导入来源、全部修订及已有构建/QA，不包含未保存草稿、锁或其他下载包。归档带版本 1 类型及逐文件 SHA-256/长度清单；打开时逐项核对并验证所有修订/资源，成功后才注册为新工程，原工程不覆盖。新副本有独立 workspaceId，避免复用旧页草稿身份。只接受白名单相对路径，拒绝重复/大小写冲突、外部链接、清单或哈希不符、未知格式/版本；最多 10000 个资源、展开 1 GiB、单项 256 MiB。Studio 工程与桌面 `.psd2live` 不兼容，不能改扩展名互换。

CLI `studio-catalog --workspace <目录>` 从 stdin 接收 `{ "schemaVersion":1, "operation":"list" }`，或 `{ "schemaVersion":1, "operation":"create", "input":{ "schemaVersion":1, "kind":"psd或archive", "name":"工程名", "data":"base64文件" } }`；返回工程列表或完整受限报告/创建结果。`studio-project-revisions` 读取修订；`studio-project-save` 接收 `{ "schemaVersion":1, "revision":"IR版本", "settingsRevision":"设置版本", "head":"保存修订ID", "message":"说明" }`；`studio-project-restore` 同时核对这三种版本，省略 message 并增加目标 `id`。两者可传 `overlayRevision`，当前界面总是核对 Overlay/基线版本。`studio-project-archive` 返回下载 URL/文件名/资源数量。后三类命令的 workspace 须是项目页建立的工程目录；原开发工作区保持原美术流程。

## 模型交付

先保存美术及构建设置，展开“导出模型”，选择 cmo3 工程或可播放模型包，以及是否包含动作示例、生成默认物理。显式 Overlay 物理规则仍保留。“生成交付包”使用已保存输入独立生成，完成后列出实际文件与全部原生警告；失败保留此前成功的交付、预览和 QA。页面刷新仍可下载最近交付；输入变化后显示历史交付标识。

可播放包包含 model3、moc3、纹理和实际引用的配置/动作/物理文件；关闭动作时同时移除 model3 引用及动作文件。cmo3 包另含重建 PSD 和 cmo3。cmo3 的可编辑纹理图层由纹理页重建，原 PSD 的编辑链不在 cmo3 中保留；原始 PSD 保存在 Studio 工程，交付包里的 artwork.psd 对应当前保存美术。每包附来源、设置、引擎身份和文件长度/SHA-256 报告。原生回读和静态模型加载不能代替 Cubism Editor 窗口验收或实时物理播放。

首次导出同时准备 cmo3 和动作，随后只切换目标或动作文件选择时复用同一验证模型。缓存键包含像素/绑定输入、构建设置、Overlay/基线、实际 JAR/JVM 身份和默认物理选择；注记变化可以复用，模型输入或设置变化须重新生成。复用前核对完整原生产物哈希，缺失或损坏会创建新产物，保留旧证据。首次准备两个格式的开销仍存在，不声称实现常驻建模服务。完整 Studio 工程归档现包含导出缓存、交付报告和模型 ZIP，仍受上述归档容量限制。

`studio-model-export --workspace <目录>` 的 stdin 为 `{ "schemaVersion":1, "revision":"IR版本", "settingsRevision":"设置版本", "overlayRevision":"Overlay版本", "target":"playable或editor", "exportMotions":true, "generatePhysics":false }`。从 snapshot 获取三种版本，旧请求返回 `BASE_CONFLICT`，原生拒绝交付返回 `EXPORT_FAILED`；不修改 IR。返回下载 URL、逐文件长度/哈希、警告、缓存身份、模型哈希、实际动作数量及物理是否存在。

## 参数与保存姿态

模型就绪后，参数按头部、眼睛、嘴部、身体、头发及其他分组；数值输入与滑块遵循当前模型的真实范围，单项重置使用原生默认值。常用预设先恢复其他参数默认值，再应用指定参数。展开“姿态预设与保存”，命名后保存当前姿态；可读取、应用或删除已有姿态。姿态只改变预览数值，不修改美术、持久模型绑定或已有 QA。

保存前须提交美术和构建设置，并完成当前模型重建。旧模型报告没有参数范围时，重建后才可保存。项目内 poses.json 独立记录最多 100 份姿态；项目修订与完整工程归档包含姿态库，旧修订按空库恢复。多窗口保存冲突会保留名称输入，点击“读取姿态库”后可再保存。当前模型缺少某参数或范围不兼容时，应用整体拒绝，保留当前全部参数并说明原因。

`studio-poses --workspace <目录>` 从 stdin 接收 v1 JSON：保存为 `{ "schemaVersion":1, "operation":"save", "revision":"IR版本", "settingsRevision":"设置版本", "overlayRevision":"Overlay版本", "buildId":"builds/<32位ID>", "posesRevision":"姿态库版本", "name":"姿态名称", "values":{ "ParamAngleX":20 } }`，删除为 `{ "schemaVersion":1, "operation":"delete", "posesRevision":"姿态库版本", "id":"姿态ID" }`。版本来自 snapshot；未知参数、越界或非有限值拒绝写入。项目保存/恢复还可传 posesRevision，当前界面总是核对。此入口不提供关键形编辑。
