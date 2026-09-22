# 嘴部双图层：机制、量化诊断与修复配方（PSD2Live）

## 1. 机制（源码位置，先读这几处）

- `core/RigBuilder.kt`
  - `buildChannels()`：决定每个 drawable 的不透明度网格。PRESET 类型下只有 `MOUTH_CLOSE -> scalarGrid(MOUTH_OPEN, [0,1]) { 1 - it }`、`TOOTH_T/B`/`TONGUE -> [0, 0.15, 1]` 的快速淡入；**`MOUTH` / `MOUTH_OPEN` 落到 `else -> null`，即永远不透明，没有渐显**。
  - `mouthWholePoint()`：张嘴形变。`seamY = aperture.top + aperture.height * 0.48`；闭嘴时 `verticalScale = (1.25px / aperture.height)`，水平只收缩到 `0.92`。`aperture` 来自 `mouthApertureFor(layer)`＝`mouth`/`mouth_open` 层的 alpha 包围盒。
  - `mouthAxes()`：嘴部密集关键形轴（MouthForm 9 档 × MouthOpen 33 档）。
- 规范：`work/tools/psd2live/docs/zh/spec/PSD_LAYER_SPEC.md` §2（嘴与口腔系统）。
- 语义别名：`mouth` / `mouth_open` / `open mouth` / `张嘴`… → MOUTH_OPEN；`mouth_close` / `闭嘴` / `口閉じ` → MOUTH_CLOSE。

### 由机制直接推出的两条结论

1. **闭嘴态不是“隐藏张嘴层”，而是“把张嘴层压成 1.25px 的线”**。所以只要还有一条独立的闭嘴唇线图层，闭嘴时就会出现“唇线 + 压扁残带”两条线。
2. **压扁的汇聚点是 48% 处，而不是美术里唇线所在的位置**。放唇线图层时必须按 `top + 0.48*h` 对齐，否则双线／“小胡子”。

## 2. 量化诊断（先复现，再改）

1. 读**模型自身**的关键形：绕开 viewer 补丁，`Object.getPrototypeOf(model).getDrawableOpacity` 与页面里那份分别取值，逐 `ParamMouthOpenY` 打印两张嘴图层的 raw / patched 不透明度。健康值应当是互补的（`mouth_open`：0→1 快速上升；`mouth_close`：1→0）。若看到 `mouth_open` 恒为 1，双线的根因就已确认。
2. 隔离渲染：把除两张嘴图层以外的 drawable 不透明度置 0，逐档截图，量“嘴部并集”的 bbox 高宽。判据：闭嘴态并集高应≈单条唇线（4~5px@1024），实测 9px 即含残带。
3. 对齐核算（不用开浏览器就能算）：
   ```
   seam = mouth_open_bounds.top + 0.48 * mouth_open_bounds.height
   偏差 = seam - mouth_close_center_y     # |偏差| 应 <= 1~2px
   ```
   两个 bounds 都取 **alpha 包围盒**（可见像素），不是 PSD 图层框。
4. 素材保真：量原版全张素材的宽高比与张嘴形变随参数的走向（原版近圆 1.08:1；若手里的是 2:1 的扁件，说明拿错了同名贴图分量）。
5. `export/*.psd2live.json` 的 `warnings` 值得读：`ArtMeshMouthClose 默认姿态与 PSD 有明显偏差：期望 Bounds(...) 实际 Bounds(...)` 通常只是闭嘴水平 0.92 收缩造成的，**不是** bug；不要为了消掉它去改对齐。

## 3. 修复配方（按代价从低到高）

### A. 对齐（最小改动，先做这个）
把 `mouth_close` 唇线的垂直中心摆到 `mouth_open` 包围盒的 48% 处（或整体平移张嘴素材使其 seam 落到唇线中心）。改哪个看代价：用户平时看到的是**闭嘴态**，所以优先保闭嘴态的原始落位。
- **限制**：张嘴素材压扁后宽度≈素材宽 ×0.92。若原版张嘴比闭口线宽得多（例 57 vs 35），压扁残带会横向伸出唇线两侧几像素——对齐能消掉“上下两条线”，消不掉这条细横带。要彻底消掉必须做 B/C。

### B. 换回真正的最大张口素材
用原版模型渲染出来的那张卡（不是图集里同名的其它变体），落位后再复算 seam。素材保真度决定“开合角度/幅度”是否与原版一致。

### C. 在模型里做交叉淡入（推荐终态）
```
PipelineConfig.layerOverrides["<嘴部张嘴层的 layer id>"] = LayerClassificationOverride(
    type      = LayerType.TOGGLE,       # 不透明度来源 → 参数值本身（线性恒等映射 scalarGrid(param,[0,1]){it}，非硬开关）
    tag       = SemanticTag.UNKNOWN,     # 关键：设 UNKNOWN 才能避开口腔压缩网格
    side      = Side.NONE,
    parameter = "ParamMouthOpenY",
    switchId  = 0)
```
- **`tag` 必须设 `UNKNOWN`，不能设 `MOUTH_OPEN`**：`MOUTH_OPEN` 会触发口腔压缩网格（mouthWholeGrid），导致 UV 包围盒缩到 23×16、张嘴渲染只剩 15×11（正常应 54×50 / 36×34）——张嘴变成小圆嘴。`UNKNOWN` 让该层不参与口腔形变，只做线性透明度交叉淡入，才是正确的"纯交叉淡入"。
- `override` 按 `layer.source.id.raw` 索引（`Analyzer.withOverride`）；key 对不上时导出结果毫无变化，所以**必须先读回 psd2live.json** 确认该层已变成 `type=toggle` 且 `tag=unknown`。
- 用 jpype 构造：`J('io.github.psd2live.core.LayerType').TOGGLE` 等枚举直接传参，map 用 `java.util.LinkedHashMap`；现有 `copy_config()` 反射重建配置，把新字段一并塞进去。
- 效果：闭嘴态张嘴层不透明度 0（干净单唇线，无残带）；张嘴过程两层互补淡入（线性，与原版 2.1 的纯交叉淡入机制一致）。

### 不要做的事
- 只在 `preview.html` 里 monkey-patch `getDrawableOpacity`：模型没变，换任何运行时都露馅。
- 为了“闭嘴干净”把 `mouth_close` 直接删掉、只留 `mouth_open`：压扁后是一条“素材宽 ×0.92”的粗线（原版闭口线往往窄得多），闭口形制不对，等于用另一个形状错误换掉双线问题。

## 4. 验收指标（写进结论的必须是这些数）

| 指标 | 取法 | 判据 |
| --- | --- | --- |
| 闭嘴态嘴部并集高 | 仅两张嘴层可见渲染，alpha bbox | 4~5px@1024，且无双层错位 |
| 闭嘴态层错位 | 唇线中心 vs 压扁张嘴层中心 | ≤1~2px |
| 张嘴幅面 | `ParamMouthOpenY=1` 的 bbox 宽/高 | 与原版渲染同尺度一致（比例、以及相对脸宽） |
| `mouth_open` 不透明度曲线 | `Object.getPrototypeOf(model).getDrawableOpacity` 逐档取值 | 0→1 单调，闭嘴态为 0 |
| 模型自身标签 | 重导后的 psd2live.json | tag 未变、override 生效 |

出图：同一取景、同一组参数档（0 / 0.25 / 0.5 / 0.75 / 1.0）的隔离嘴部放大条图 + 全脸（遮住其它部件）对照图。

## 5. 嘴部美术风格判据（日系动漫）

用户给的参考图/原游戏美术风格 ≠ 贴图分量素材。贴图里的 comp4（37×6 直线）和 comp8（60×31 宽扁）是**写实/复古像素风格**，不符合日系动漫嘴形。日系动漫嘴形特征：
- **闭嘴**：柔和弧线（嘴角微扬，微笑弧），不是直线
- **张嘴**：小圆口/椭圆口（旋转前画宽>高的椭圆，长轴沿面部横轴，旋转后长轴跟脸倾斜；直径约 20~25px@1024），不是宽扁椭圆（2:1+）
- **颜色**：细线深棕/深灰，口腔暗红，外圈浅粉，不用粗重黑线

**落位前必看用户给的参考图**：如果参考图是弧线+圆口，就按该风格重制美术（用 PIL 贝塞尔曲线画弧线、ellipse 画圆口），不要直接搬贴图分量。判断方法：把素材放大 6 倍与参考图并排比，形状差异一目了然。

## 6. 面部倾斜与嘴部定位（多源计算）

嘴部不应水平放置——脸往往有轻微倾斜。用多源特征点计算嘴部倾斜角：
1. **眉心重心 E**：`eyebrow_all.png` 的 alpha 加权重心（α>30）
2. **下巴中心 C**：`face.png` 底部 8px 区域的 alpha 加权重心
3. **眼轴角 θ_eyes**：两眼白重心连线的倾斜角
4. **面部纵轴角 θ_face**：arctan2(C_y-E_y, C_x-E_x)
5. **加权**：`θ_mouth = (θ_face⊥ × 0.45 + θ_eyes × 0.40 + θ_blush × 0.15) / 1.0`
   - 腮红角权重最低（软涂渐变导致测量不稳定）
   - 面部纵轴⊥ = θ_face + 90°（归一化到 [-90,90]）
6. **嘴巴中心**：沿 E→C 轴，从 C 向 E 方向取固定距离 d（=当前嘴巴到下巴的距离）
7. **仿射旋转**：所有嘴部图层用同一旋转角和中心点，仿射矩阵 `[cos θ, -sin θ, new_x - cos θ·old_x + sin θ·old_y; sin θ, cos θ, new_y - sin θ·old_x - cos θ·old_y]`

所有嘴部状态（闭嘴线、张嘴口）共用同一旋转角和中心点，确保各状态间无跳变。

### PIL 仿射旋转：方向极易搞反（踩坑 3 次的教训）

`Image.transform(size, Image.AFFINE, (a,b,c,d,e,f))` 是**逆映射**：矩阵把**输出**坐标映射到**输入**坐标（`x_in = a*x_out + b*y_out + c`）。所以传入的矩阵是期望变换的**逆**——对旋转而言就是**取反角**：

```python
θ_pil = math.radians(-θ_mouth)   # 关键：取反！
cos_t, sin_t = math.cos(θ_pil), math.sin(θ_pil)
a, b = cos_t, -sin_t
d_mat, e = sin_t, cos_t
```

**验证方法（每次旋转后必跑）**：取旋转后素材的最左列和最右列的 alpha 像素 y 均值，比较 `y_right - y_left` 的符号。正值 = 右端低 = 正角度（图像坐标 y 向下时）。把预期方向写成断言，方向不对立即翻转 `θ_pil` 的符号重跑。

### 张嘴口形状：椭圆长轴沿面部横轴，不是正圆

"小圆口"在旋转前应画成**宽 > 高的椭圆**（如 32×22，长轴沿面部横轴 x），旋转后面部横轴倾斜多少，椭圆长轴就跟着倾斜多少。若旋转前画正圆，旋转后仍是正圆（圆旋转不变形），看不出"轴向跟着脸走"的效果。闭嘴弧线和张嘴椭圆都要验证 `y_right - y_left` 符号与眼轴一致。

### 倾斜方向验证（发布前必做）

渲染成品模型，用**眼轴**（两眼白深色像素重心连线）当基准，比较嘴部倾斜角的符号是否一致。实测参考：眼轴 +2.91°（右眼低），嘴部应为正（右端低）。若符号相反，先查 PIL 仿射方向，再查 θ_mouth 的正负定义（图像坐标 y 向下，正值 = 顺时针 = 右端低）。

**注意**：vision/多模态读图对倾斜方向的判断不可靠（实测读图报"唇线与下巴轮廓一致"但像素分析显示相反），必须用 `np.polyfit` 或端点 y 均值差来量化。
