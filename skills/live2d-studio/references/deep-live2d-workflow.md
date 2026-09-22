
# Live2D PSD 模型修复与验证（PSD2Live）

管这一类任务：用户报告某个 Live2D 模型不对（部件不跟参数、眼睛/头发/嘴形态错、贴图溢出、层次错、破面），需要在 `work/<char>-native/source` 改图层 → 重建 PSD → PSD2Live 重导出 moc3 → 发布 → 用真实渲染证明改对了。本仓库每个角色一套：`work/<char>-native/{source,export}` + 该角色脚本 + `public/models/<char>-native`。

## 工具链（先确认，不要猜路径）

- 项目 python：`work/tools/python/Scripts/python.exe`（3.10，含 psd-tools / jpype1 / numpy / scipy / Pillow / playwright）。**Hermes 沙箱解释器没有 psd_tools / scipy**：凡涉及 PSD 读写、连通域/填洞/内插的脚本，一律用 `terminal` 调这个 python 跑，不要用 `execute_code` 直接 import。
- 便携 PSD2Live：`work/tools/portable/PSD2Live`（jpype 起 JVM，classpath 取 `app/*`），由该角色的 `export_*.py` 驱动。
- **先在磁盘上确认工具链落在哪个 checkout**：同一台机常有多份工程副本，`work/tools/python`、`work/tools/portable/PSD2Live`、`work/tools/psd2live` 可能只存在于其中一份（另一个项目目录里只有产物、没有工具）。既有脚本里写死的绝对路径就是最可靠线索：先 `grep -rn "tools/portable\|tools/python" <项目>/ --include=*.py` 读出它们实际用的解释器与 PSD2Live 路径再照抄，不要按本技能里的占位路径硬拼。项目布局也不保证是 `work/<char>-native/`：可能是一套角色一套 `work/<cluster>/<id>/{source,export,raw}` + 发布到 `extracted/<...>/<id>/`，`raw/` 里放 PSD 素材、`source/` 里放 psd。
- 规范先读：`work/tools/psd2live/docs/zh/spec/PSD_LAYER_SPEC.md`（层语义与眼/嘴/发规则）、`DEFORMER_AND_PARAMETER_SPEC.md`；实现源码 `work/tools/psd2live/src/main/kotlin/io/github/psd2live/core/{LayerClassifier,ComponentSplitter,RigBuilder}.kt`。
- 渲染 harness：`work/tools/live2d-viewer/`（见 deep-live2d-render-check-harness.md）。仓库原有的整机截图脚本只能给界面截图，不能按参数出图，别拿它当验证手段。

## 标准流程

1. **只读调查**：核对 `source-manifest.json` 的层名/bounds 与 PSD 实际层是否一致；核对 `export/*.psd2live.json` 的生成时间晚于 PSD 修改时间——psd2live.json 落后于 PSD 时，你读到的是上一次的标签。接力只读项目内 `docs/HANDOFF.md` 或用户直接提供的结论；不得读取其他 Agent 的私有会话、记忆或状态目录。交接中“修复完成”的结论仍要用真实模型渲染复核：若改动只落在预览页/渲染器而不在模型里，模型本身仍然是坏的。
2. **先复现，再动手**：把 `export/` 整份拷到 `_backup_pre_<step>/`，这样改前模型仍可作为对照被渲染。改动前先把用户看到的现象用参数化渲染复现出来。
3. **判根因类别**（决定后面所有工作，别跳）：
   - *部件不跟参数 / 跟着别的部件走 / 该摆动却随头平移* → 先查**语义标签**，不要先改美术或层序（deep-live2d-psd2live-semantics.md）。一次像素差渲染就能证伪或证实。
   - *形状与美术不符*（眼白溢出、虹膜非圆/过小、多余色块、腮红过重）→ 回原始美术重切该层（deep-live2d-eye-hair-recipes.md）。
   - *嘴部出现多余线条 / 上下两条线 / “像小胡子” / 开合幅度或形状与原版不符* → 先查双图层交叉淡入与 PSD2Live 的 0.48 汇聚线，不要先重画美术（deep-live2d-psd2live-mouth-pipeline.md）。
   - *层次穿透*（长发压在胸前、被身体挡住却显示）→ 才轮到 z 序与前后发归属。
   - *脸/头发/发饰的大小位置与原版美术不一致* → **先把原版参考图配准到画布坐标系，用画布像素量化差异**，再决定移动/缩放/重贴（deep-live2d-reference-alignment.md）。凭肉眼反复微调会来回摆动、且无法与用户对齐口径。用户选定方案后按该文件的「落地与复测」节执行：整组刚性平移优先，其次才是区间纵向重映射，改完必须用同一套指标把差量复测到个位数像素。模型本身是好的、只在本软件里显示错（整块空白或碎片错位）则相反：一行模型文件都别动，走 deep-live2d-runtime-render-check.md 先自证分流、再判矩阵还是纹理 V。
4. **改 source 素材**：新写一个步骤脚本（`work/<char>-native/<动作>.py`），不要就地改已有脚本；同步 `source-manifest.json` 的层名/bounds/顺序。
5. **重建 PSD**：按 manifest 顺序逐层 `psd.create_pixel_layer(...)` 后 `save`——manifest 顺序即自下而上的 z 序（第 0 项是画布最底层）。
6. **重导出 + 校验标签**：跑该角色 `export_*.py`，**再读一遍新 psd2live.json** 确认每层的 `tag/side/parameter` 是你期望的，然后才 `publish.py`。
7. **验证（可以在 publish 之前做）**：把渲染 spec 的 `model` 指向 `work/<char>-native/export/*.model3.json`（harness 服务根目录即可访问），先看渲染是否达标，**再** `publish.py`——避免把未验收的资源先写进 `public/models` 和 `dist/models`；**试换**类请求（用户说"换成这个试试看"）到此为止——先出并排对比图（左右分别为改前/改后，各渲染同一组镜位）等用户给结论，不 publish、不 commit，并把 manifest 的 `artRevision` 改成能区分这一版的标签。随后出参数化 before/after 并排图 + `npm test`（moc3 在 export/public/dist 三处 md5 必须一致）；结论按项目惯例**追加**到 `docs/HANDOFF.md` 末尾的编号小节，不新建 md 文件。

## 硬性规则

- **图层名必须命中 PSD2Live 别名表**，否则 tag 落到按包围盒兜底，部件会静默失去自己的变形器与参数绑定（表现为"跟着头壳硬平移"）。改名要同时改 PNG 文件名、manifest 层名、PSD 层名三处，并避开已存在的素材名。
- **改 PSD/素材前必备份**到 `_backup_pre_*` 目录（source 图层、manifest、psd、export 各一份），否则无法做对照渲染，也无法回滚。备份 `export/` 要**整目录**拷，不要只挑 `*.moc3`/`*.json`：贴图集是 `pecorine-practice.2048/` 这样的**目录**，漏掉它这一份备份就渲染不出来，改前的对照图直接没了。
- **manifest 必须与 PSD 实际层严格一致**：重建脚本按 manifest 生成全部层，manifest 落后会静默丢层，超前会多出空层。
- **眼睛必须按规范分三层**：`eyewhite`（干净完整眼眶，作裁剪蒙版）→ `irides`（**完整圆形**，被眼白自动裁剪）→ `eyelash`（**只含上睑/睫毛**）。睫毛图混入下眼线或下眼眶线，在闭眼（按逐列 alpha 质心弯曲）时会撕裂出毛刺。
- **嘴部双图层必须落在同一条线上**：PSD2Live 给 `mouth_close` 生成 `1 - ParamMouthOpenY` 的线性淡出，**却完全不给 `mouth_open` 生成透明度网格**（`RigBuilder.buildChannels` 只对 MOUTH_CLOSE / TOOTH / TONGUE 出网格），所以闭嘴时两层都在画；而 `mouth_open` 的闭嘴压缩汇聚线是 `seamY = bounds.top + 0.48 * bounds.height`（`RigBuilder.mouthWholePoint`）。摆放 `mouth_close` 时必须让它的**垂直中心 == 该 seam**，否则压扁后的张嘴层与唇线落在两条平行线上＝“小胡子”。实测差 4.9px 就足以在 1024 画布上出现明显双线（闭嘴态嘴部并集高 9px，正常应为 4~5px）。**终极方案是用 `layerOverrides` 做交叉淡入（tag=UNKNOWN，不是 MOUTH_OPEN）**，详见 deep-live2d-psd2live-mouth-pipeline.md。
- **张嘴图层必须取“原版模型渲染出的最大张口”本身**：同名的贴图分量不一定是这张嘴（共用图集里常有更扁的小嘴/别的表情变体），换错会同时毁掉两件事——张嘴比例变扁、seam 跑到唇线之外。落位前必报两个数：素材实际宽高比（原版近圆 1.08:1，错件 2.10:1）、以及 `top + 0.48*h` 相对唇线中心的偏差；两个都对不上就不用它，回原版模型重新渲染提取。
- **素材落位必须在同一取景下取用**：把原版模型按别的 scale/position 重渲染出来的图层，坐标与既有画布差一个整体平移（实测差 (+33,+31)），不能直接搬进来；要么用与其余图层同一套捕获脚本/取景重取，要么先用一个可识别地标（闭嘴唇线）解出平移量再搬，并复算 seam 验证。
- **修模型，不要修渲染器**：在 `preview.html` 或任何 viewer 里 monkey-patch `getDrawableOpacity` 做交叉淡入，只是把缺陷藏起来——Cubism Editor、lip sync、宿主 App 照旧露出。诊断一律读**模型自身**的原始实现（`Object.getPrototypeOf(model).getDrawableOpacity`，对照页面里被替换过的那份），改完把 viewer 补丁删掉，让“所见即模型”。要在模型层面消除双线，用 `PipelineConfig.layerOverrides[<层id>] = LayerClassificationOverride(type=TOGGLE, tag=MOUTH_OPEN, parameter="ParamMouthOpenY", …)`：tag 决定网格（仍是嘴部压缩网格），type 决定不透明度来源（跟随 `ParamMouthOpenY` 线性出现），两层才真正交叉淡入。落地后必须读回 psd2live.json 确认该层 type/parameter 已变、tag 仍是 `mouth_open`。
- **头发 z 序**：后发在最底、`body/face/eyes` 夹在中间、前发（刘海）在最上。前发层只放**脸前的刘海**，垂到下巴以下的长发/辫子归后发；两段在下巴线处重叠约 10px，避免物理摆动时开缝露空。
- **比例问题先查素材出处，不要先调坐标**：模型往往是"素材按 1:1 贴入 + 另一套高分辨率素材按 N 倍缩小"拼起来的（同一角色部件来自不同来源尺度），这时误差是系统性的，逐层挪坐标只会把结构越挪越乱。先量出每层素材的相对尺度关系，再统一换算。
- **参考图必须选未被二次处理的版本**：用户随手给的截图/裁剪图常被重新缩放或截边（截边会让"最宽处"之类的极值指标偏小），会得出错误的差量。优先用最高分辨率的原版立绘，并让配准结果自己暴露结构关系（配准出的缩放若等于某个整齐分数，说明画布就是原图按该比例缩放而来——用它当基准，不要再叠加第二个自由缩放）。
- **裁切过的参考图（bust 头像）不要用轮廓 IoU 配准**：它只是父图的一块，轮廓里没有可分辨的竖直信息，同一张图对两个只差头发的复合图会给出两个解（实测同一份数据出现 0.632 与 0.715 两个 scale，无法判断哪个对）。改用地标配定：取两个可识别特征（瞳孔色块）在两张图里的中心与**面积**，面积与间距都相等 ⇒ 它就是父图的 1:1 裁切（不是缩放图）；用两个地标各解一次裁切原点，两次必须落在同一点（残差 0px），再经父图已定的硬锚点映射到画布。这样得到的变换可以与父图推出的画布坐标逐点对上，也才能拿它量五官。
- **测量结论必须交叉验证**：同一特征至少用两个互相独立**且可复现**的指标（例：虹膜色块质心 vs 上睑最暗像素行）落在同一差量上，再用放大叠加图目视复核，才允许写进结论。多模态读图**不能当几何证据**：它对放大图报的坐标误差可达 ±5px，会把深色阴影区当成嘴、甚至认错角色；凡“几个像素”级别的结论一律回到脚本里的掩膜/连通域/行分布去量，读图只用来发现“哪里可能有问题”。色彩掩膜极易误判：发丝高光会被判成皮肤、蓝灰衣饰会被判成虹膜青、头发暗红阴影会被判成丝带红。用"包含脸颊探针点的肤色连通域"当脸部锚点并限制搜索窗口，可一次性排除这些假阳性。取景贴不贴边同理：读图会把贴到上沿的头顶报成"上方有 10~15% 空隙"，三档构图验收只认 readPixels 的 bbox 数字。
- **跨版本比较只能用与遮挡无关的量**："可见脸宽/下巴/眼到下巴"这类指标取自肤色连通域的极值，头发覆盖量一变它就跟着变——同一份 `face.png` 在两个只差头发的构建里量出下巴 215 与 249（34px 的纯假差量）。跨构建一律用图层框、虹膜质心/直径、发际线这类与遮挡无关的量；非要用遮挡相关的指标，就必须两版用同一套掩膜并同时目视核对叠加图。
- **验证只报真做过的**：给出可核对数字（像素变化量、参数化对比图）。Cubism Editor 人工复核、原生 EXE 实窗验收没做就写"未做"。全套里孤零零 1 项失败，先单跑该文件、再复跑全套，然后才归因——计时/端口/终端生命周期类用例在并发占用下会偶发超时，把它当回归会推翻已用像素级证据验证过的改动。
- **构建脚本可能直接覆盖已发布产物**：`build_all_natural_mouth_models.py` 等流水线脚本会把 export 直接拷到 `extracted/live2d_models_cubism5/`，不走独立 publish 步骤。跑之前必须先备份已发布目录，否则"修复前"状态丢失且无法对照。
- **嘴部美术风格以用户参考图为准，不要盲搬贴图分量**：贴图里的嘴部组件（直线唇线、宽扁椭圆口）可能是写实/像素风格，不符合日系动漫嘴形（弧线唇 + 小圆口/椭圆口）。落位前把素材放大 6 倍与用户参考图并排比，形状不对就按参考图重制美术，详见 deep-live2d-psd2live-mouth-pipeline.md §5。
- **PIL 仿射旋转方向极易搞反**：`Image.transform(AFFINE)` 是逆映射，传入矩阵是期望变换的逆——旋转角必须取反（`θ_pil = -θ_mouth`）。每次旋转后用端点 y 均值差验证方向，与眼轴符号比对。详见 deep-live2d-psd2live-mouth-pipeline.md §6。
- 用户对美术效果有最终决定权；结构性问题（层序、归属、去留）改动前给证据 + 选项 + 推荐。用户明确授权"你决定"时才自行选方案，并说明为什么选它。
- **推荐 ≠ 修改**：用户让你"看看 / 推荐有没有这种技能"时，只做推荐与说明，不就地改被推荐技能；要改进先取得明确同意。若已修改后又被要求回滚，先在 Hermes scratch 保存可恢复副本，再精确回滚并执行 `py_compile`、`--help` 与一次真数据冒烟。
- **用户目视定位 + 试改请求**（"X 偏低/歪了，拉高试试"这类）：测量只用来定位移幅度和副作用，**不用来重新裁决用户的目视结论**；先按他指的口径出证据图（剥离干扰层的中性合成 + 带坐标标签网格，deep-live2d-reference-alignment.md §4），再做刚性试改，改前/改后同格式并排图直接发进对话，附逐列残差表、副作用、选项与推荐；试改不 publish、不 commit，等用户定夺。

## 支持文件（含 deep-live2d-runtime-render-check.md：本软件显示错的运行时诊断）

- `deep-live2d-psd2live-semantics.md` —— 标签判定规则、头发/眼睛等价别名、tag→变形器绑定表、"绑定是否生效"的像素差探针。
- `deep-live2d-eye-hair-recipes.md` —— 眼三层重切算法（阈值、补洞、睫毛色相过滤、内插、预乘缩放）、前后发切分做法，以及**把新画的素材换进画布**的落位配方（锚点选择、落位后必报的三个数）。
- `deep-live2d-layer-decomposition-tools.md` —— 单张立绘 → 分层 PSD 的拆层工具（See-through）：三个模型的职责、为什么普通二次元底模不能替换它、低显存开关、以及"先用本地底模出图/补绘、再用它拆层"的正确串联方式。
- `deep-live2d-render-check-harness.md` —— 参数化渲染 harness 的坐标换算、spec 格式、调用命令与 before/after 对比套路。
- `deep-live2d-reference-alignment.md` —— 把原版参考图配准到画布并量化脸/发/饰差异：IoU 轮廓配准脚本、指标表、放大网格对比图、各类掩膜误判的避坑做法，以及用户选定方案后的**落地与复测配方**（整组刚性平移 → 区间纵向重映射 → 同一套指标复测）。
- `scripts/check_psd2live_tags.py` —— 读一个 export 的 psd2live.json，列出每层 tag/side 并高亮 `unknown` 与缺失的物理绑定（每次导完先跑它）。
- `deep-live2d-psd2live-mouth-pipeline.md` —— 嘴部双图层机制：`mouth_close`/`mouth_open` 的透明度网格与 0.48 汇聚线公式、闭嘴双线与“小胡子”的量化诊断、张嘴素材保真判据、`layerOverrides` 交叉淡入配方、验收指标。
- `deep-live2d-original-21-render-harness.md` —— 用 Cubism 2.1 原版模型当基准的确定性渲染 harness：脚本加载顺序、必须 `Live2D.init()` 与 `autoStart/autoUpdate: true`、冻结动作/物理的手法、`toDataURL` 取像素、参数隔离与取景平移的坑。
- `scripts/register_art.py` —— 把任意参考图按轮廓 IoU 配准到模型画布，输出 `canvas = k*art + (ox,oy)` 与半透明叠图；量脸/发/饰差异前先跑它。
- `scripts/hairline_probe.py` —— 皮肤锚定发际线 + 前发 alpha 发梢的同口径逐列探针（模型合成 vs 配准参考，`--drop` 剥离干扰层，`--fronthair-bounds` 用当前素材+旧 bounds 重建 before 对照）；量"刘海高低/发际线"先跑它。
