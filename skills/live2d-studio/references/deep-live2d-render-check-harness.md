# 参数化渲染验证 harness（live2d-viewer/）

## 为什么需要它

仓库原有的 UI 验证脚本只能整屏截图应用界面，**没法只改一个参数看一处像素**。要证明"这个层跟这个参数动/不动"、要做 before/after 对照，必须有一个能按参数组合渲染 moc3 的离屏入口。它加载的是**已发布**的 `public/models/<char>-native/<name>.model3.json`（即用户真正看到的那份），不是 mid-pipeline 文件。

## 文件与职责

| 文件 | 作用 |
| --- | --- |
| `index.html` | 用 `public/vendor/cubism/` 运行时加载**一个**本地 model3.json（由 URL query 指定，一页一模型，没有 `load()`），挂 `window.viewer` |
| `shot.py` | 起 headless 浏览器（playwright，`channel='msedge'` + `--use-angle=swiftshader`），每个 shot 重新打开页面，`reset` → `setParams` → `focus` → `snapshot` 存 PNG |
| `qa.py` | Pose QA runner：单命令执行 QA 姿态扫描，输出 `review/{full,eye-crops,mouth-crops,hair-crops}/`、`contact-sheet.png`、`review.json`，stdout 输出 JSON |
| `sheet.py` | 把多张快照拼成带标签的对比图（before/after 并排） |
| `specs/*.json` | 参数组合与取景：`{"model":url,"vendor":url,"canvaspx":[w,h],"canvas":[w,h],"shots":[{"name","params","focus":[x0,y0,x1,y1],"canvas":[w,h],"exact":bool}]}`；冒烟样例 `specs/smoke-fixture.json`；QA 姿态全量清单 `specs/qa-default.json` |
| `public/vendor/cubism/` | Cubism Core 5.3（native 6.0.1）+ Framework 5-r.5 打包（全局名 `Live2DChatCubismFramework`）+ shaders，来源见其 README |
| `public/models/yelan/` | 冒烟测试模型 |

`index.html` 的 URL query：`model=`（默认页面旁的 `public/models/yelan/yelan.model3.json`）、`vendor=`（默认页面旁的 `public/vendor/cubism/`）、`w=`/`h=`（渲染面像素，默认 512×1024）、`canvaspx=w,h`（模型画布像素，默认 `512,1024`，用于像素↔模型单位换算）。fixture 的原生画布是 4000×6000，两份 spec 均显式固定该值。

`window.viewer` 实际 API（以 `index.html` 为准）：

| 成员 | 说明 |
| --- | --- |
| `ready` / `errors` | 加载完成标志 / 错误字符串数组 |
| `coreVersion` / `mocVersion` | Core 与 moc 版本 |
| `params()` | `[{id, value, min, max, default}]` |
| `setParams({Id: value})` | 设参数（clamp），返回已应用的 id |
| `reset()` | 恢复默认姿态 |
| `drawables()` | `[{id, bbox, opacity…}]`，模型画布像素，y 向下 |
| `focus([x0,y0,x1,y1])` | 取景到画布像素矩形 |
| `exact()` | 1:1 取景（渲染面尺寸需等于 `canvaspx`） |
| `view({zoom,cx,cy})` / `currentView()` / `pxPerCanvas(zoom)` | 显式视图 / 当前视图 / 每画布像素对应渲染像素 |
| `render()` / `snapshot(crop, scale)` | 画一帧 / 返回 PNG dataURL |

调用（静态服务从**仓库根**起，所以 spec 里的 URL 要带 `/live2d-viewer/` 前缀）：

```bash
python/Scripts/python.exe -m http.server 8899 --bind 127.0.0.1   # 在仓库根后台运行
python/Scripts/python.exe live2d-viewer/shot.py --spec live2d-viewer/specs/smoke-fixture.json --outdir live2d-viewer/out/smoke
python/Scripts/python.exe live2d-viewer/qa.py --spec live2d-viewer/specs/qa-default.json --outdir live2d-viewer/review
python/Scripts/python.exe live2d-viewer/sheet.py <out.png> labelA=<a.png> labelB=<b.png>
```

`qa.py` 可以单独运行：没有服务时临时启动仅监听 127.0.0.1 的仓库静态服务，完成后关闭；已有服务时复用。`shot.py` 仍需先启动服务。运行前可用 `live2d-viewer/check_runtime.py` 核验固定 Core 哈希和 16 个必要文件。

QA 与 shot 共用姿态应用逻辑，支持每个 shot 的 `canvas`、`focus`、`exact`（focus 与 exact 互斥）。未知参数、越界参数、空渲染均失败；QA 的 stdout 为 JSON，失败退出码 1，失败报告覆盖旧 `review.json`。`crops` 使用**渲染面像素**矩形，必须落在每个 shot 的画布内；默认裁剪仅适用于 yelan fixture，其他模型必须实测调整。报告存档完整 spec、spec SHA-256、实际参数值、镜位与像素比例。`status: ok` 仅表示出图成功，美术验收仍需查看 contact sheet。

## 坐标换算（关键，错了会全部取错景）

- Cubism 模型单位由原生 canvas 与 pixels-per-unit 决定，不能假设高度为 1。画布像素 → 模型单位：`unit = canvasH_units / PX_h`；yelan 的模型尺寸为 1×1.5，原生画布 4000×6000。
- `fit = min(1.86 / canvasH_units, 1.86 * aspect / canvasW_units)`；有效比例为 `fit * zoom * unit * renderH / 2`，其中 `unit` 不可省略。
- 取景缩放：clip 空间是 `[-1,1]`（宽 2 单位），要让一个矩形正好填满视口：`zoom = 2 / (fit * max(W_units/aspect, H_units))`，再乘 0.94 留边。**只写 `1/max(...)` 会得到一半的放大倍率**——早期版本就是这样，出图看起来"没放大"。
- canvas 上下文必须带 `preserveDrawingBuffer: true`，否则 `toDataURL` 取到空图。
- `exact()` 要求渲染面等于 `canvaspx`，使用 `zoom = 2 / (fit * unit * renderH)`。不能用所有 drawable 的网格 bbox 与可见 alpha bbox 比值校准：遮罩与隐藏几何使两者不等价。回归中通过实际 alpha 边界的缩放比例另行验证 1:1 换算。

## before/after 对照的套路

1. 改素材前把 `export/` 整份拷成 `_backup_pre_<step>/`；改完发布后，把备份里的 `model3.json` 当作"改前模型"、`public/models/...` 当作"改后模型"，**用同一份 spec** 渲两遍。
2. 用 `sheet.py` 出并排图（左=改前、右=改后），逐张看，不要只看一张就宣布通过。
3. 数值证据优先于"看起来对"：绑定探针数变化的像素（见 deep-live2d-psd2live-semantics.md）。
4. 姿态扫描至少包含：中立、`ParamAngleX±30`、`ParamAngleY±30`、`ParamAngleZ`、`ParamBodyAngleX`、闭眼+张嘴、目标部件自己的参数（如 `ParamHairBack/ParamHairFront` 极值）。发现异常时**先在改前模型上重现**，确认是不是本次改动引入的——`ParamAngleY` 极端俯仰压扁眼睛这类就是原有行为，不要当成新 bug 去改。

## 如果 harness 不在仓库里

按上面三张表的职责重建；也可以先用 `psd-tools` 直接读 PSD 层做静态核对（bbox/像素分布），但**绑定与形态问题必须靠真实渲染下结论**。
