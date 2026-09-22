# 参数化渲染验证 harness（work/tools/live2d-viewer/）

## 为什么需要它

仓库原有的 UI 验证脚本只能整屏截图应用界面，**没法只改一个参数看一处像素**。要证明"这个层跟这个参数动/不动"、要做 before/after 对照，必须有一个能按参数组合渲染 moc3 的离屏入口。它加载的是**已发布**的 `public/models/<char>-native/<name>.model3.json`（即用户真正看到的那份），不是 mid-pipeline 文件。

## 文件与职责

| 文件 | 作用 |
| --- | --- |
| `index.html` | 复用 `public/vendor/cubism` 运行时加载任意本地 model3.json，暴露 `viewer.load/reset/setParams/focus/render/snapshot`；`snapshot` 返回 dataURL |
| `shot.py` | 起 headless 浏览器（playwright，`channel='msedge'` + `--use-angle=swiftshader`），按 spec 逐 shot 设参数、`focus` 取景、截图存 PNG |
| `sheet.py` | 把多张快照拼成带标签的对比图（before/after 并排） |
| `specs/*.json` | 参数组合与取景：`{"model":url,"canvaspx":[512,1024],"shots":[{"name","params","focus":[x0,y0,x1,y1],"canvas":[w,h]}]}` |

调用（静态服务与 `model3.json` 同源，避免 file:// 的 fetch 限制）：

```bash
# 后台起服务（目录取仓库根，路径按 URL /public/models/... 访问）
python -m http.server 8899 --bind 127.0.0.1 --directory <repo>
work/tools/python/Scripts/python.exe work/tools/live2d-viewer/shot.py --spec <spec.json> --outdir <out>
work/tools/python/Scripts/python.exe work/tools/live2d-viewer/sheet.py <out.png> labelA=<a.png> labelB=<b.png>
```

## 坐标换算（关键，错了会全部取错景）

- Cubism 把模型归一化到**画布高度 = 1 个 clip 单位**，所以画布像素 → 模型单位：`unit = canvasH_units / PX_h`（本仓库画布 512×1024、模型高 1.86）。
- fit 因子按窗口宽高比分档（横屏用 `1.86/1`，窄屏用宽高比公式）。
- 取景缩放：clip 空间是 `[-1,1]`（宽 2 单位），要让一个矩形正好填满视口：`zoom = 2 / (fit * max(W_units/aspect, H_units))`，再乘 0.94 留边。**只写 `1/max(...)` 会得到一半的放大倍率**——早期版本就是这样，出图看起来"没放大"。
- canvas 上下文必须带 `preserveDrawingBuffer: true`，否则 `toDataURL` 取到空图。

## before/after 对照的套路

1. 改素材前把 `export/` 整份拷成 `_backup_pre_<step>/`；改完发布后，把备份里的 `model3.json` 当作"改前模型"、`public/models/...` 当作"改后模型"，**用同一份 spec** 渲两遍。
2. 用 `sheet.py` 出并排图（左=改前、右=改后），逐张看，不要只看一张就宣布通过。
3. 数值证据优先于"看起来对"：绑定探针数变化的像素（见 deep-live2d-psd2live-semantics.md）。
4. 姿态扫描至少包含：中立、`ParamAngleX±30`、`ParamAngleY±30`、`ParamAngleZ`、`ParamBodyAngleX`、闭眼+张嘴、目标部件自己的参数（如 `ParamHairBack/ParamHairFront` 极值）。发现异常时**先在改前模型上重现**，确认是不是本次改动引入的——`ParamAngleY` 极端俯仰压扁眼睛这类就是原有行为，不要当成新 bug 去改。

## 如果 harness 不在仓库里

按上面三张表的职责重建；也可以先用 `psd-tools` 直接读 PSD 层做静态核对（bbox/像素分布），但**绑定与形态问题必须靠真实渲染下结论**。
