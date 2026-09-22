# 模型没坏、只有本软件显示错：运行时渲染路径诊断（Cubism 2.1 / 双内核分流）

判据：同一模型在 Cubism Editor 或其它查看器里正常，在本 app 里**整块空白 / 部件碎成错位碎片 / 贴图内容对不上几何** → 问题在 app 的渲染路径，模型文件一行都别动。与「修模型、不修渲染器」互为镜像：那条防你把模型缺陷藏进 viewer，这条防你去改一份本来正确的模型。项目是双内核分流：`.model3.json` 走 Cubism 4/5 新解码，`.model.json`（2.1 旧 `.moc`）走独立的 `src/avatar/cubism/cubism2Runtime.ts`。

## 1. 复现：探针页 + CDP 驱动

- 本机**没有 playwright**；用仓库自带 `scripts/app-screenshot.mjs` 当 CDP 驱动（`list` / `shot <file> [x,y,w,h] [scale]` / `eval <expr>` / `evalfile <js>` / `click x y` / `reload`，`--port` 默认 9333，内部 `awaitPromise: true`）。
- 起服务要隔离真实存档：`RP_DATA_DIR=<scratch>/probe-data npm run dev`。再起无头浏览器：
  `chrome.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<scratch>/chrome-probe --enable-unsafe-swiftshader --window-size=1400,800 <probe页url>`。
- 探针页放 `work/<char>-probe/{probe.html,probe.ts}`，由 vite 直接服务、直接 import app 源码，按 app 的**真实调用形状**装载：`CubismInstance.load(canvas, { modelUrl, expressions }, skin, signal)` + rAF 里 `instance.draw(dt, state)`（照抄 `CubismAvatarStage`）。旁边并排挂一个 5.3 模型当对照组，一次截图就能看出「谁坏谁好」。
- 把诊断句柄暴露到 `window.__probe`（实例、`stats()` 像素统计、`setFraming()`），后续 `evalfile` 脚本都走它；`stats()` 里一次 `draw` 后立刻 `gl.readPixels` 报 opaque 数 + bbox（GL 的 y 是左下原点，换算成屏幕坐标再比）。

## 2. 先证分流，再进渲染层

`canvas.dataset.coreVersion` / `instance.diagnostics.coreVersion`：2.1 路径是**硬编码 `'2.1.00'`**，4/5 路径来自 `csmGetVersion()`（如 `6.0.1`）。两个模型各自落在正确内核，路由就排除了，别去动分发逻辑。

## 3. 判根因：空白 vs 碎片

- **空白（opaque = 0）** → 抓 `uniformMatrix4fv` 收到的矩阵，和顶点值域对账。Cubism 2.1 顶点是**模型画布像素坐标**（0..W、0..H，**左上原点、y 向下**），4/5 是中心原点——拿中心原点的矩阵套像素坐标会把可视区推出画面外。覆写 `model.setMatrix` 做假设对照（先把原型方法 `bind` 存成 `orig`，再逐个替 `() => orig(matrix)`）：`左上像素+y翻转` / `中心像素` / `y不翻` 三种矩阵各跑一次 `stats()`，opaque + bbox 当场分辨。
- **碎片/内容错位** → 把数据层和渲染层分开裁决：
  1. 包 `drawElements`，**在 draw 当下**读 position / UV / index 三块缓冲（`getVertexAttrib(i, VERTEX_ATTRIB_ARRAY_BUFFER_BINDING)` + `getBufferSubData`），存 `window.__records`。逐件核对 `maxIndex == verts-1`、`elemBytes == count*2`，配套自洽就说明 GPU 收到的数据没问题。
  2. **页内 CPU 参考光栅化当裁判**：用同一份 pos/idx/uv 在 2D canvas 上逐三角填色，取色于原始贴图集的 centroid，出 `v 原样` / `v 翻转` 两版；再和 GPU 帧做全图平均像素差。
  3. 结论看**差值方向是否反转**：哪一版与 GPU 帧差得小，GPU 就在按哪一版采样；哪一版才是连贯人物，纹理上传就该按它配 `UNPACK_FLIP_Y_WEBGL`。CPU 参考若本来就不连贯，问题在数据层，别去动纹理标志。
- 属性布局别猜：`gl.getParameter(gl.CURRENT_PROGRAM)` → `ACTIVE_ATTRIBUTES` + `getAttribLocation` 自查（2.1 是 `a_position` / `a_texCoord`）。
- 顺带验内核兼容性：强制回退 WebGL1（临时覆写 `canvas.getContext` 让 `webgl2` 返回 null）再看现象是否不变——不变就排除 WebGL2 兼容性，别往驱动方向查。

## 4. 硬性规则（坑）

- **包装 `gl.*` 方法前先 `const orig = gl.f.bind(gl)`，包装体内只用 `orig`**：回调被包装的 `gl.f` 会自递归把页面主线程挂死，CDP 命令随之全部超时。
- **`evalfile` 的表达式若返回 promise，必须自带 `.catch` 并最终 settle**：`awaitPromise: true` 会让一个 rejected 或永不 settle 的 promise 把命令永久挂住，页面也卡死。
- **清理只杀自己的实例**：按 `--user-data-dir` 过滤杀（PowerShell `Get-CimInstance Win32_Process | Where CommandLine -like '*<probe-dir>*'`），不要 `taskkill /IM chrome.exe` 误杀用户自己的浏览器。
- **采样完立即卸载包装**：否则每帧往记录数组里堆，页面越跑越慢、数据越滚越大。
- **索引缓冲的大小必须在 `drawElements` 当下读**：核心可能 bind 之后再 `bufferData` 重设同一块缓冲，在 bind 时读到的是上一件的尺寸，会把正常数据误判为不配套。
- **构图三档（full/knee/bust）验收只认 `readPixels` 的 bbox 数字**（top/bottom/left/right + opaque），设计值可按人物站位的归一化高度反解出 `zoom / translateY`。
- 下结论前至少两条互相独立的指标（像素差方向 + CPU 参考目视），并保留改前对照图。

## 5. 收尾与验收

- **真实软件验收**：在 app 里切到该角色，查 `dataset.coreVersion / mocVersion / parameterCount`、`data-avatar-ready=true`、无 `.avatar-stage__notice` 报错，再目视连贯；三档构图各出一张图。
- `npm test` + `npm run typecheck`。**全套里孤零零 1 项失败，先单跑该文件、再复跑全套，然后才归因**——计时/端口/终端生命周期类用例在并发占用下会偶发超时，把它当回归会推翻已用像素证据验证过的改动。
- 用户要「能玩到」就必须 `npm run pack:play`，然后到 `dist/assets/*.js` 和 `app/win-unpacked/resources/app.asar` 里 grep **新旧两组常量**确认修复进了包（新常量命中、旧常量只剩别的路径用到的那处）。`npx asar list` 在 Windows 输出**反斜杠**路径，用正斜杠 grep 会得到 0 条——先用不带斜杠的词 `grep -c katou` 确认有内容再下结论。
- 工作记录按项目惯例**追加**到 `docs/HANDOFF.md` 末尾编号小节，不新建 md。