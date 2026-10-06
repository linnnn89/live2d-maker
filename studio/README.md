# Live2D Studio（P5 / P6）

本地三栏编辑器：Parts 列表、原图上的 polygon/landmark 编辑、实际 Cubism 预览与参数滑块。编辑保存到隔离工作区的 IR；Rebuild 调用既有 Python → PSD → 原生 PSD2Live → moc3 链，Run Pose QA 调用 P1。Vite 中间件仅转发白名单 CLI，不承担模型业务逻辑。

工具开发以编辑、导入、重建和 QA 工作流为验收目标。现有 mouth_open、tongue、upper teeth 用于回归验证；无需为了完成软件开发逐类制作一套角色素材。

预览由独立 ViewerAdapter 管理加载、错误、取景及重绘。参数滑块和重置按动画帧合并重绘，不编码 PNG；需要截图时才调用截图接口。预览区标明当前已保存模型，或提示未保存/已保存但尚未更新的修改。独立 viewer 支持 `embed=1`，由自身控制嵌入布局。

前端检查：`npm run build`；预览适配器回归：`npm test`。适配器用例不依赖 Python、JVM、Edge 或 Windows。

## 启动

需要仓库已有 `python/Scripts/python.exe`、`requirements-tools.txt` 中的依赖、`portable/PSD2Live` 与已核对的 Cubism runtime。前端使用 Node `^20.19.0 || >=22.12.0`，本轮实测 Node 24.19.0。只安装项目内依赖：

```powershell
Set-Location I:/live2d-maker/studio
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173/`。默认第一次打开把 ds 示例 PSD 导入 `out/studio/`，保留 source.psd、原始 IR、完整 PNG 素材和原合成图。点击 Rebuild 生成预览；已有工作区再次启动会恢复保存的 IR 和上一份成功产物。

首次打开遇到 `409` 工作区忙时，间隔 1 秒、2 秒自动重试，最多尝试 3 次。仍失败或遇到其他错误时，显示“重新打开工作区”，可等待当前命令结束或修正错误后重试，无须刷新页面。工作区未加载时，底部显示 IR 未加载、各产物状态未知，不显示已保存/已更新。打开请求在页面卸载时取消；写操作不自动重试。

导入其他 IR 或 PSD 时，启动前指定环境变量，输出必须是独立的新目录：

```powershell
$env:STUDIO_IR = 'out/iteration-audit/p6-mouth/final-ir/authoring-rig.json'
$env:STUDIO_WORKSPACE = 'out/studio-mouth'
npm run dev
```

`STUDIO_PSD` 与 `STUDIO_IR` 二选一。相对路径均相对于仓库根。更换源模型要换新的 `STUDIO_WORKSPACE`；已有工作区不会被环境变量重新导入。输入 IR 的 PNG 会复制并用哈希文件名归档，源目录不写入。源 PSD 和源 IR 从不就地保存。

## 操作与几何语义

1. 选图层；搜索只过滤列表，眼睛按钮修改 visibility。
2. 在全图或“聚焦图层”视图拖蓝色 polygon 顶点，或选中顶点后编辑 X/Y（原画布像素）。鼠标拖动限定在当前栅格 bbox 内。
3. 保存 IR。未保存时显示待更新；保存采用 revision 校验，另一窗口的旧版本会明确失败。
4. 点击 Rebuild；有未保存修改时先保存。独立目录保存 PSD、原生模型、标签审计、警告和构建 IR。成功后替换预览 URL；失败继续显示上次成功模型，旧产物保留。
5. 参数滑块读取 `window.viewer.params()` 的实际范围，并通过 `setParams` + `snapshot` 更新画面；重置恢复原生默认值。
6. 模型与当前 IR 一致时可运行 Pose QA。默认 16 姿态覆盖 neutral、头 X/Y/Z ±30、身体 X ±10、嘴 0/0.5/1、闭眼、闭眼张嘴和可用的头发参数 ±1。头发参数由导出的 CDI 清单确定；其余必需参数缺失或范围不足仍失败，不静默删姿态。产物包含固定 spec、spec hash、实际参数/镜位、16 张完整 PNG、contact sheet 和 review.json；界面可查看联系表。每次尝试先取消旧的成功 gate，失败不会继续显示本次 QA 通过。

`polygon` 是当前 PNG 的 alpha 裁切边界，按原画布像素中心、even-odd 填充；外部 alpha 置零，内部 alpha/RGB、PNG 原文件、offset/bbox 不变。不提供补画、形变或拓扑编辑；收缩后再扩张可以从保留的原 PNG 恢复。默认导入 bbox 矩形与不提供 polygon 均保持原栅格。`landmarks` 可添加命名点和拖动，保存到 IR，暂不驱动 PSD2Live 绑定。画布背景展示原合成图或最近一次确认素材导入的合成图，拖点时不实时重新合成；右侧展示最近一次成功导出的 moc3。

本界面仅允许编辑 geometry/appearance，不开放 source hash、asset 路径/哈希、稳定 ID、语义、层名或 z 序写入。语义仍由 PSD2Live 的层名分类。默认取景由透明像素 bbox 测量，不使用 Agent 视觉估坐标，因此此流程不触发 P2。

“全图”按当前显示参照图的 alpha 范围取景，包含原人物范围之外的新素材。快照保留 `sourceBounds`（原始参照），新增 `artworkBounds`（当前显示参照图）及 `build.modelBounds`（上次成功构建对应 IR 的平面合成范围）。Cubism 自动取景使用成功模型自己的范围；确认新素材但尚未重建时，旧模型镜位保持不变。新构建报告保存模型范围；旧报告缺少该字段时从其 `build-ir.json` 和保留素材计算，无须修改原报告。范围由对应版本的平面 artwork 测量，不代表所有变形极值的动态包围盒。

画布上方明确标注“原始参照图”或“上次导入合成图”。参照背景不会随隐藏/裁切操作实时重新合成；当前效果请查看重建后的 Cubism 预览，避免将参照图误认作已保存 IR 的实时渲染。

## 导入生成素材

先保存 IR，再点击顶部“导入生成素材”。选择外部生成的 RGBA 透明 PNG 和与画布同尺寸的灰度二值 mask（0 保护、255 可编辑），每个 PNG 最大 16 MB。填写可识别的层名、素材生成说明及整数画布矩形。可新增顶层，或按现有图层 ID 替换；替换保留 ID、z 序和显示设置。隐藏图层不可在此流程替换。

默认要求素材尺寸等于放置范围；显式勾选适配后，按 alpha 内容裁透明边、保持比例缩放。可选源矩形裁切会记录被排除的可见像素。点击“检查导入”复用 `import-generated` 的完整验证，检查配准素材及前后完整合成图在保护区内的变化。局部前后图默认聚焦放置区域，可切换全图或打开原图；报告显示变化像素及保护区的可见像素、变化像素、最大差值。

预检和取消均不修改活动 IR、源文件或成功模型/QA。修改任何输入会使预检失效。“确认导入”再次核对工作区 revision、候选 IR 和素材哈希；其他编辑器修改后必须刷新并重新预检。确认后更新 IR/画布，旧模型和 QA 归档保留但标为待更新，须 Rebuild 后再运行 Pose QA。每次成功预检归档到 `imports/<id>/`，保留生成原图、mask、说明、前后图、报告及候选 IR；取消后保留审计档案，不自动清理。

主画布的自由编辑仍仅开放 geometry/appearance；素材、层名与语义变更通过严格的导入契约完成。此入口不调用生成 API，也不自动制作 mask 或从不透明图分离背景。

## CLI、Overlay 与运行边界

所有命令在仓库根执行 `python/Scripts/python.exe -m tools.authoring_rig`，stdout 为 JSON，失败非零：

- `studio-open --workspace <新目录> [--ir <ir.json> | --psd <source.psd>]`
- `studio-snapshot --workspace <目录>`
- `studio-save --workspace <目录>`：stdin 为 `{"revision":"...","ir":{...}}`。
- `studio-import-preview --workspace <目录>`：stdin 为 `{"revision":"...","generatedPng":"<base64 PNG>","maskPng":"<base64 PNG>","bounds":[left,top,right,bottom],"name":"tongue","prompt":"生成说明","replacePart":null,"fit":false,"spriteBounds":null}`。返回预检 ID、版本、前后图 URL 和像素报告；文件名由服务端固定，不接受浏览器文件路径。
- `studio-import-commit --workspace <目录>`：stdin 为 `{"id":"<预检 ID>","revision":"<预检版本>"}`，返回更新后快照。重复确认或旧版本候选均拒绝。
- `studio-rebuild --workspace <目录>`
- `studio-qa --workspace <目录> --port 5173`：须有正在运行的 Studio dev server，负责本地资源路径。

默认无 Overlay，界面明确显示“未载入”。可同时设置 `STUDIO_OVERLAY` 与 `STUDIO_OVERLAY_BASELINE`，在新工作区归档既有 Overlay 及其原始 native-base.json。重建调用 `native-replay` 比较完整原生签名，`needs-review`/`broken` 明确失败并保留旧模型，绝不自动忽略 Overlay 或批准其应用。只有成功构建匹配当前 IR、Overlay 和 baseline 文件哈希时，快照才显示原生应用后的 `ok`；否则使用保守预检或对应的失败报告。失败原因在刷新后保留，QA 入口关闭；编辑后恢复数值相等的原 IR，可重新对应原成功模型/QA，JSON 的整数与等值浮点写法不会单独造成失效。旧的附带 Overlay 构建报告没有输入哈希时，须重新 Rebuild 一次。Studio 中尚无手工解决 Overlay 冲突的界面。

存在 `psd2live/build/libs/psd2live-0.7.1.jar` 时，使用该源码应用 JAR 和原便携 JVM/依赖；否则用便携版。Overlay baseline 必须来自相同运行时。UI 已实测源码 JAR 的无 Overlay 闭环，以及附带 ArtMesh geometry/opacity Overlay 的成功应用、IR 轮廓变化拒绝、目标缺失拒绝、刷新保留与恢复；固定镜位像素对照确认指定 X+30 姿态生效，并运行 16 姿态 QA。其他 Overlay owner/channel、journal、physics 组合尚未在 Studio 逐项视觉验收。

仅监听 127.0.0.1:5173，固定端口；API 检查 Host/Origin，写入串行化，Python 工作区也有排他锁，子进程不经 shell。仅服务工作区内的 PNG/JSON/moc3 与既有 viewer/vendor 白名单资源，不暴露整个仓库。若异常退出留下 `.studio.lock`，先确认该工作区没有运行中的命令，再移除这个锁文件。

`npm run build` 进行 TypeScript 检查和前端打包；`dist` 不是可以独立执行 CLI 的发布包，操作功能需要 dev server。当前没有产品发布、打包安装器、Agent 自动生成几何、ImageGen 按钮、物理实时预览或 Cubism Editor 美术验收。默认 QA 是静态姿态检查。
