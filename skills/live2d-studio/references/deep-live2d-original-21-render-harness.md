# 用原版 Cubism 2.1 模型当基准的确定性渲染 harness

适用：要“修得跟原版一样”的时候。原版模型是 Cubism 2.1（`.moc` + `.model.json` + `mtn`/`exp`/`physics`），重建件是 moc3，两者不能互相加载。宿主 app 若只引入 `libs/live2d.min.js`，它渲染不了重建后的 moc3；所以**别指望宿主 app 的截图当对照**，另写一页 harness，两套模型各自渲染、同一套参数档、同一套像素指标。

## 1. 页面配方（顺序不能错）

```html
<script src="<app>/libs/live2d.min.js"></script>              <!-- 2.1 内核，先加载 -->
<script src="<...>/pixi.js/dist/pixi.min.js"></script>
<script src="<...>/pixi-live2d-display/dist/cubism2.min.js"></script>
```

```js
Live2D.init();                                   // 必须在建 PIXI app 之前
app = new PIXI.Application({
  view: document.getElementById('cv'),
  width: 1024, height: 1024, backgroundAlpha: 0,
  antialias: true, autoStart: true,               // 见下：必须为 true
  preserveDrawingBuffer: true
});
model = await PIXI.live2d.Live2DModel.from(url, { autoInteract: false, autoUpdate: true });
```

- **`autoStart` / `autoUpdate` 必须是 true**。设成 false 再手动 `internalModel.update()` 会抛 `loadShaders2 → Cannot read properties of undefined (reading 'createProgram')`：2.1 内核的 GL context 是在 pixi 的渲染循环里拿到的，没有循环就没有 GL。要冻结模型状态请用第 2 节那几个动作（停动作、断开物理/眨眼/呼吸、停 ticker），而不是把 `autoStart` 关掉。
- `preserveDrawingBuffer: true` 是后面 `toDataURL()` 取像素的前提。

## 2. 冻结与“一次调用出一帧”

```js
// 冻结（装载后立刻执行一次）
try { model.internalModel.motionManager.stopAllMotions(); } catch (e) {}
try { model.internalModel.motionManager.groups.idle = undefined; } catch (e) {}
try { model.internalModel.physics = undefined; } catch (e) {}
try { model.internalModel.eyeBlink = undefined; } catch (e) {}
try { model.internalModel.breath = undefined; } catch (e) {}
try { app.ticker.stop(); } catch (e) {}

// 设参数 + 更新 + 渲染 + 取像素，全在同一个 evaluate 里
window.__shotWith = (v) => {
  const c = model.internalModel.coreModel;
  c.setParamFloat('PARAM_MOUTH_OPEN_Y', v);
  c.setParamFloat('PARAM_MOUTH_FORM', 0);
  c.setParamFloat('PARAM_ANGLE_X', 0); c.setParamFloat('PARAM_ANGLE_Y', 0); c.setParamFloat('PARAM_ANGLE_Z', 0);
  c.setParamFloat('PARAM_BODY_ANGLE_X', 0);
  c.setParamFloat('PARAM_EYE_L_OPEN', 1); c.setParamFloat('PARAM_EYE_R_OPEN', 1);
  c.setParamFloat('PARAM_EYE_BALL_X', 0); c.setParamFloat('PARAM_EYE_BALL_Y', 0);
  c.setParamFloat('PARAM_BREATH', 0);
  model.internalModel.update(0);
  app.renderer.render(app.stage);
  return app.view.toDataURL('image/png');   // 每次调用都要重设全部参数
};
```

坑（全部实测踩过）：

- **跨 evaluate 的参数会被宿主自己的动画循环改写**：`setParamFloat(0.5)` 后下一次读取拿回 0.3169，`setParamFloat(1.0)` 拿回 0.1343。所以设参数到取像素必须在同一次调用内；两次采样之间不要 sleep 后直接取。
- **别把两帧塞进同一次调用**（render→toDataURL→改参数→render→toDataURL）：两帧会整幅不同（缓冲区没保住，`toDataURL` 拿到的是上一次合成/空帧），拿它做差分等于得到“全屏都变了”。正确做法是先按上面冷冻，再**一帧一次调用**。
- 取像素用 `canvas.toDataURL()` 再 base64 解码，**不要用 playwright 的 locator 截元素图**：元素图会把页面背景合成进来（alpha 包围盒直接变成整幅），且尺寸按 CSS 像素而不是画布像素解析。
- 截图/取图都放在同一套固定参数下；差分只能在你把动作、物理、眨眼、呼吸都冻住之后才有意义（没冻时“同一模型不同嘴参数”的差分 bbox 会盖住整个下半身，那是 idle 动作在动，不是嘴在动）。
- 静态服务器端口用 `socket.bind(('127.0.0.1', 0))` 拿空闲端口再起线程，不要写死：端口被别的进程占用时页面会以 `ERR_HTTP_RESPONSE_CODE_FAILURE` 失败，看起来像路径错，很难查。

## 3. Cubism 2.1 运行时 API（有哪些、没有什么）

- 有：`coreModel.setParamFloat('PARAM_X', v)`、`getParamFloat`、`getPartsDataIndex('PARTS_01_MOUTH_001')`、`setPartsOpacity(i, v)`。
- 没有：`getParamMaxValue`（拿不到参数上下限，所以想知道某个 PARAM 的真实满量程只能扫参：0 / 0.5 / 1 / 1.5 / 2 / 3 看形变是否还在增长）、`model.getDrawableCount()`、`model.getParameterValueByIndex()`（后者是 Cubism 4/5 的 API，别混用）。
- `Live2D.getID` 不一定存在，写 `Live2D.getID(...)` 会直接 TypeError；用 `(window.Live2D && Live2D.getID) ? Live2D.getID : (x) => x` 兜底。

## 4. 部件隔离不可靠

“把除嘴以外的部件不透明度置 0”**不能**用来隔离嘴部：2.1 一个 part 的贴图矩形往往覆盖到下颚/颈影，渲染出来的 alpha 包围盒会有 190×360 这种尺寸，看到的东西全是深蓝灰阴影，不是嘴。要定位嘴请用：

- 同一部件同一参数下的**帧差**（其余全冻结）；或
- 已知画布坐标的窗口内做掩膜（唇线＝深色低亮度；口腔＝暗红且 r 明显大于 g/b；肤色要单独排除）。

## 5. 取景平移：跨取景的素材不能混用

同一模型用不同 `scale/position` 渲染，画布坐标会整体平移（实测同一张嘴在两个取景间差 (+33,+31)），尺寸不变。后果：

- 从 A 取景提取的图层不能直接放进 B 取景的画布；要么用与其余图层同一套捕获脚本取，要么先用地标（例如闭嘴唇线）解出平移量再搬。
- 搬运/落位后的自检：复算 `top + 0.48*h` 是否仍落在目标唇线中心上（见 deep-live2d-psd2live-mouth-pipeline.md）。

## 6. 与 vision 读图的分工

读图只用来**发现问题**（“这里好像多了一条线”“哪一格看着不对”）；所有像素级结论（宽高、中心、错位多少 px）都必须回脚本用掩膜/连通域/行分布量出来再写结论。vision 对放大图报的坐标误差可达 ±5px，且会把阴影区认成嘴、认错角色。
