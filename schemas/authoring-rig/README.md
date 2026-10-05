# Pre-PSD Authoring Rig IR (`authoring-rig.json`)

## 1. 架构定位

```
source.png → See-through → [authoring-rig.json] → PSD → PSD2Live(LayerClassifier→RigBuilder)
           → [RigEditOverlay / RigAuthoringJournal] → moc3 → Pose QA
```

`authoring-rig.json` 作为 PSD 上游的 Pre-PSD 中间表示（IR），专门承载：
- 画布与各图层切片的空间几何关系（尺寸、位置、边界多边形、关键特征点）；
- 图层语义标签（直接对齐 `psd2live` 的 31 类语义体系）；
- 栅格资产的哈希与路径；
- 每个部件的产生来源与演化追踪（`provenance`）。

### 红线约束（强制）
- **禁止包含 Live2D 绑定概念**：严禁出现 `parameter`、`deformer`、`keyform`、`physics` 字段，Schema 层面通过 `additionalProperties: false` 强行限制。
- 不引入异构动画与形变引擎参数，保持纯粹的 2D 美术分层语义。

## 2. 字段规范

### 顶层字段
- `schemaVersion`：必须为 `"0.1.0"`。
- `canvas`：画布尺寸 `{ "width": int, "height": int }`。
- `sourceImageHash`：原图/合成图的 SHA-256 哈希。
- `parts`：图层画元数组。

### Part 必填字段
- `id`：稳定唯一 ID（图层改名或重排保持不变）。
- `name`：对应 PSD 图层名称。
- `z`：图层层级（从 0 开始自底向上）。
- `appearance`：可选的 `{ "visible": bool, "opacity": 0..255 }`；旧 IR 缺省为可见、完全不透明。
- `asset`：
  - `path`：PNG 栅格素材相对路径。
  - `sha256`：PNG 文件的 SHA-256 哈希值。
  - `size`：素材分辨率 `{ "width": int, "height": int }`。
  - `offset`：在原画布中的左上角偏移 `{ "left": int, "top": int }`。
- `geometry`：
  - `bbox`：`[left, top, right, bottom]`。
  - `polygon`：轮廓顶点数组 `[[x, y], ...]`。
  - `landmarks`：命名关键点（如虹膜中心、嘴角）。
- `semantic`：
  - `tag`：语义标签（如 `FRONT_HAIR`, `FACE`, `IRIDES` 等）。
  - `side`：侧别（`"none"`, `"left"`, `"right"`）。
  - `confidence`：分类置信度 `[0.0, 1.0]`。
- `provenance`：
  - `source`：生成来源（`"see-through"`, `"manual"`, `"vision"`, `"imagegen"`, `"psd-import"`）。
  - `toolVersion`：生成工具版本。
  - `timestamp`：ISO 时间戳。
  - `upstreamHash`：上游输入数据哈希。

## 3. 工具链接口契约

在仓库根使用 `python/Scripts/python.exe -m tools.authoring_rig <子命令>`。
stdout 为 JSON，失败返回非零；依赖由 `requirements-tools.txt` 固定，缺少 `jsonschema` 或 Schema 文件会明确失败。

标准化子命令：
- `export --psd <file.psd> --outdir <dir>`：从 PSD 提取图层切片与 IR。
- `export --manifest <source-manifest.json> --outdir <dir>`：从 cropped PNG 图层清单导入；`--psd` 与 `--manifest` 二选一。
- `build-psd --ir <dir/authoring-rig.json> --outpsd <file.psd>`：由 IR 与素材生成标准分层 PSD。
- `validate --ir <dir/authoring-rig.json>`：核验 Schema 与素材哈希完整性。
- `import-generated --ir <ir.json> --generated <rgba.png> --mask <mask.png> --bounds L T R B --name <layer-name> --prompt-file <prompt.txt> --outdir <new-dir> [--replace-part <id>] [--fit] [--sprite-bounds L T R B]`：将已生成的透明素材配准到局部 mask 内，校验后新增或替换美术图层。
- `stale --old <old.json> --new <new.json>`：核对两份 IR 并报告 source hash、素材、几何、层序或语义变化的下游失效。
- `check-overlay --ir <ir.json> --overlay <overlay.json> [--base-objects <objects.json>]`：Overlay 引用预检；仅 `ok` 返回 0，`needs-review` 与 `broken` 均返回 1。
- `native-base --psd <source.psd> --outdir <empty-dir> [--native-jar <built.jar>]`：导出原生基线与 `native-base.json`，缺省使用项目便携版。
- `native-replay --psd <rebuilt.psd> --overlay <overlay.json> --baseline <native-base.json> --outdir <empty-dir> [--native-jar <built.jar>]`：比较完整原生模型指纹，再应用受支持的编辑、原生校验与导出 moc3；之后仍须运行 Pose QA。JAR 必须与建立基线时一致。

## 4. v0 的验收范围与边界

PSD 输入只接受平面普通混合像素层；图层组、蒙版、效果、剪贴与其他混合模式会在写入前明确拒绝，避免静默丢图层。透明度、可见性保留。素材必须是 IR 目录内的 PNG，哈希、实际尺寸、offset 与 bbox 同时校验；不允许目录穿越。

manifest 输入采用已有 `source-manifest.json` 的平面 PNG 清单契约，不直接读取 See-through 的运行统计 `info.json`。`canvas` 为 `[width,height]`，`layers` 按自底向上顺序排列，示例：

```json
{"canvas":[512,1024],"layerCount":1,"layers":[
  {"id":"stable-face-id","name":"face","path":"face.png","bounds":[193,94,320,228]}
]}
```

每层 `bounds` 为整数 `[left,top,right,bottom]`，PNG 必须已经裁成对应尺寸；不猜测全画布素材的裁剪范围。`path` 缺省为 `<name>.png`，须在 manifest 目录内；缺图、尺寸不符、目录穿越、重复 ID、非法几何/绑定字段在创建输出前拒绝。可选 `geometry`（包括 landmarks）、`semantic`、`appearance`、`provenance` 按 IR 的同名契约保留并严格验证；其余图层字段拒绝。显式 `id` 可在改名、重排后保留；旧清单没有 ID 时首次导入生成 UUID，后续应以 IR 为真源。顶层兼容旧清单的 `character`（映射 metadata.name）、`artRevision`、`sourceArtwork` 描述文字与 `layerCount`；描述文字不作为文件路径或新 IR 字段，默认 provenance.upstreamHash 记录 manifest 原文 SHA-256，sourceImageHash 记录图层合成图 PNG 的 SHA-256。默认来源为 manual；See-through 来源须显式提供其 provenance。

导入优先采用 PSD 原生 layer ID，与名称/层序无关。没有原生 ID 的首次导入会生成 UUID；此时应保存 IR 作为真源，不能把再次导入无 ID 的原 PSD 当作身份不变的编辑。重建 PSD 使用原生 layer ID + 标准 XMP 映射保留任意 IR ID，后续改名、重排和再次导入保持这些 ID（需保留 XMP）。

P5 起，`build-psd` 对显式 polygon 按原画布像素中心、even-odd 填充裁切图层 alpha；多边形外 alpha 置零，内部 alpha/RGB、源 PNG、offset 与 bbox 不变。默认 bbox 矩形仍逐像素保留原层，缺省 polygon 不裁切。完整 IR 合成图和生成素材的 mask 校验共用同一裁切语义。非矩形 polygon 的旧 IR 现在会实际裁切，之前只作为描述；使用前应保留原 IR/PNG 并复核重建结果。landmarks 仍是注记，不驱动绑定；semantic 尚未直接接入 PSD2Live，分类仍以层名为准。交互、命令和工作区说明见 [Studio README](../../studio/README.md)。

`--base-objects` 是重建后**完整**的原生 `rig_get_object` 返回对象数组（保留 `target` 与 `topologyInfo`），不能使用只含一页的 `rig_list_objects` 摘要。支持裸 Overlay 或工程的 `rigEdits`，检查 sets/deletes/copies 的所有 target、warp/rotation/part/glue 与 journal 引用。IR 的 id/name 不是 RigBuilder 生成的 ArtMesh ID，单凭 IR 会返回 `needs-review`。

原生快照能核对目标和点数；`check-overlay` 即使点数相同，几何编辑仍返回 `needs-review`。结构/物理编辑和顺序 journal 也需原生复核。预检结果同时输出 `native_apply_required: true`。

`native-base` / `native-replay` 用已有 JPype 与 `portable/PSD2Live`，不使用系统 Java，不安装或下载运行时。基线保存所有 app JAR 与 JVM DLL 的哈希，并对原生 PuppetModel 的完整字段计算签名：有序顶点、UV、三角索引、rest geometry、变形器链、parameter、geometry/channel keyforms 等；不会仅以点数判定。重建后缺目标/点数不符为 broken，完整模型或运行时变化为 needs-review，均不导出。匹配后调用不可变 `RigEditOverlay.setKeyform`、`applyTo`、neutral/head-angle/directional-warp 原生校验与 PSD2Live 导出链（含 MOC3 回读）。新增警告需人工复核；原基线警告保留并公开。输出目录必须为空，避免把旧成功 moc3 当作本次结果。

桥接现已读取 `parameters`、`deletedParameterIds`、`keyformSets`、`keyformCopies`、`keyformDeletes`。parameter 使用原生 ID/name/min/max/default/kind/repeat/created 契约；重复、删除与更新冲突、删除不存在的参数均拒绝。先应用 parameter 头部编辑，再核对 set/copy/delete 引用的参数范围，允许新建参数驱动 keyforms。copy 的两组 coordinate 与 source/destination target 均核对；delete 的 parameterId/keyValue/channel 均核对。持久化列表按原生 set → copy → delete 顺序应用，加载 delete 列表不能调用会删除先前源 set 的交互式 `deleteKeyform()`。

完整对象摘要包括 mesh/warp/rotation/part/glue。set 几何字段按 target kind 限制：ArtMesh 为 positionDeltas，Warp 为 controlPoints，Rotation 为 originX/originY/angle/scale，part/glue 没有独立几何。channels 按原生字段构造并验证，未知字段、空值、非法数值/布尔类型失败。已在真实 Cubism 验证 ArtMesh opacity/positionDeltas、Warp controlPoints、新参数及参数删除、opacity copy/delete；其他对象/通道组合已接入映射但未逐组合渲染验收，不据此宣称完整 P4。

便携版 `0.7.1-e64db76a…` 早于当前 Kotlin 源码，没有 authoringJournal/fit_local；使用默认便携版时，`warps`、`physics`、`structure`、`authoringJournal` 非空仍返回 needs-review。使用 `--native-jar` 选定当前源码构建产物时，这四类编辑通过原生 parser/applyTo 加载。warps/physics 使用原生 snake_case JSON 契约；structure 用 action/kind/id；journal 只接受已物化的 set/copy/delete/warp/structure，不在 Python 重建 deform/seed 运算引擎。原生 replay 逐步验证 journal 的引用、点数和参数范围，允许引用前一步创建的 Warp。独立 `check-overlay` 对这种引用保留 needs-review，交由顺序原生验证，不能提前判为缺目标。

physics 编辑存在时仅开启显式自定义规则的 physics3 导出，关闭默认 frontHair/backHair/eyeJelly 规则，避免附带新增规则或重复驱动同一输出。检查引用与范围后，真实 Cubism Web Framework 动力学评估和 Core 渲染证明输出参数与图片均变化；标准静态 Pose QA 不自动评估物理。

原生通道按 owner 限制：ArtMesh/part 为 opacity、drawOrder、multiplyColor、screenColor；Warp 为 opacity 和两种 color；Rotation 另有 flipX/flipY；glue 仅 glueIntensity。set、显式 copy/delete 都在写入前拒绝不适用通道，防止原生 API 静默返回未改变模型。geometry/all-channel copy 要求相同 target kind；跨 kind 只允许显式选择双方都支持的通道。Rotation geometry 要求 originX/originY/angle 完整。其他对象/通道组合未逐组合渲染验收，assetLayers/calibrationLayerIds 等其他非空 section 仍 needs-review。

用户已授权项目内 JDK 21/Gradle 9.6.1 与构建依赖。工具和缓存位于 `portable/build-tools/`，不进入版本控制；归档来源与官方哈希在该目录的 verified-tools.json。仓库已恢复版本匹配的 CubismSdkPreviewSession Kotlin 适配源码，并修复误排除，未新增或下载专有 SDK 二进制。PowerShell 在仓库根构建（环境变量仅限当前进程）：

```powershell
$env:JAVA_HOME = (Resolve-Path 'portable/build-tools/jdk-21.0.12.1+1').Path
$env:GRADLE_USER_HOME = Join-Path (Get-Location) 'portable/build-tools/gradle-home'
& ./portable/build-tools/gradle-9.6.1/bin/gradle.bat -p psd2live --no-daemon --console=plain --max-workers=2 '-Dorg.gradle.java.installations.auto-download=false' jar
./python/Scripts/python.exe -m tools.authoring_rig native-base --psd psd2live/examples/ds/psd-input/ds.psd --native-jar psd2live/build/libs/psd2live-0.7.1.jar --outdir out/my-native-base
```

旧便携版保留。源码 JAR 只替换本次 JVM classpath 中的应用 JAR，仍使用固定的项目便携 JVM/依赖；不同应用版本不得混用 baseline。已验证 journal、structure、新建/fit_local Warp、physics 的核心路径，但 fit_local 有微小浮点/回读/像素差异（具体数值见 PLAN），原生桌面 SDK 预览与 Cubism Editor 美术交互未做。`native-replay` 的 ok 表示原生相对校验通过，视觉验收仍须 Pose QA 与检查。功能探针不是模型美术成品。

## 5. P6 透明生成素材与局部 mask

`import-generated` 不调用生成 API。由 Agent 使用 ImageGen 生成透明素材，再由此 CLI 接入已有 IR/PSD/原生导出链；不新增绑定字段、模型权重或服务。当前已用真实 ImageGen mouth_open、tongue、upper teeth 完成样本的导入/原生导出/渲染验收，其他目标图层仍需各自验收。tongue/upper teeth 的开口淡入和 mouth mask 来自既有 PSD2Live 原生 PRESET 规则；不向 artwork IR 写动画字段。样本与固定 spec/像素证据见 `out/iteration-audit/p6-mouth/` 和 `out/iteration-audit/p6-mouth-internals/`，验收边界见 `docs/PLAN.md`。

mask 必须为与 IR 画布同尺寸的二值灰度 PNG：0 保护，255 可编辑，二者同时存在。素材必须为 RGBA PNG，有透明背景和非空内容。默认素材尺寸必须等于 `--bounds`，不自动缩放或裁掉 mask 外像素。`--fit` 是显式 alpha 裁边、保持宽高比缩放并居中配准；实际 PNG 尺寸可能与 ImageGen prompt 不同。

若原始透明图有远处微弱 alpha 散点，可用 `--sprite-bounds` 明确选择源矩形。报告保存裁取范围、排除的非零 alpha 像素数及最大 alpha，原始 PNG 完整保留。本次实际排除 105 个 alpha=1 的远处散点，不称为“原始生成图逐像素未变”。严格 mask 验收作用于**配准后素材与完整 IR 合成图**，任意 mask 外可见像素或 RGBA 变化均拒绝。

默认新增顶层 Part；同名层拒绝。已有素材时使用 `--replace-part` 指定稳定 ID，保留 ID/z/appearance，替换名称、素材、几何、语义，并检查移除旧像素是否影响 mask 外区域。不要在已有 mouth 上重复添加第二张嘴。未知语义、空图、尺寸不符、非二值 mask、越界或无效替换，在创建输出前失败。输出必须为源 IR 目录之外的新目录，保留原输入及其他 Part。

成功输出：新 IR 与 assets、before/after 合成图、原始生成 PNG、mask、prompt 和 `generation-report.json`（哈希、配准、像素差）。新 Part 标 `provenance.source=imagegen`，upstreamHash 为原始生成 PNG SHA-256；sourceImageHash 保留原输入来源，Part asset 变更触发 stale。成功只表示美术导入通过，原生导出与 Pose QA 仍必需。

本机已验证命令（`missing-ir` 为隔离 ds 副本，去除原 mouth 后有 23 层）：

```powershell
python/Scripts/python.exe -m tools.authoring_rig import-generated `
  --ir out/iteration-audit/p6-mouth/missing-ir/authoring-rig.json `
  --generated out/iteration-audit/p6-mouth/generated-mouth.png `
  --mask out/iteration-audit/p6-mouth/mouth-mask.png --bounds 612 330 647 357 `
  --sprite-bounds 224 384 1064 944 --fit --name mouth_open `
  --prompt-file out/iteration-audit/p6-mouth/generation-prompt.txt --outdir out/p6-generated-ir
python/Scripts/python.exe -m tools.authoring_rig build-psd `
  --ir out/p6-generated-ir/authoring-rig.json --outpsd out/p6-generated.psd
python/Scripts/python.exe -m tools.authoring_rig native-base `
  --psd out/p6-generated.psd --native-jar psd2live/build/libs/psd2live-0.7.1.jar --outdir out/p6-native
# QA spec 的 model URL 必须指向本次导出，口型参数至少覆盖 0 / 0.5 / 1。
python/Scripts/python.exe live2d-viewer/qa.py --spec <mouth-qa-spec.json> --outdir out/p6-review
```

当前源码默认启用独立上下唇描边（`RigBuilder.mouthOutline`），闭嘴可以是弯曲单线。旧配方的总 bbox 高不能直接当此 fixture 的线厚阈值：固定 640×640、focus=[600,320,660,370]、alpha>16，实测闭嘴逐列最大厚度约 2.094 原画布像素，总 bbox 高约 11.270（包括弧线弯曲）。不据此设所有模型通用阈值。隔离测量只在测试浏览器隐藏无关画元，口型使用原模型关键形，未修改产品 renderer。

收尾对照 [MAS variant-requests.py](https://github.com/shinshin86/mesh-avatar-studio/blob/98b14c2e352c876508c0c4739f9c75e88ef67e5d/tools/variant-requests.py) 与 [build-sprites.py](https://github.com/shinshin86/mesh-avatar-studio/blob/98b14c2e352c876508c0c4739f9c75e88ef67e5d/tools/build-sprites.py)：MAS 接受全尺寸编辑图、alpha mask（0 可编辑），以默认容差 8 检查预乘 RGBA，再羽化抽 sprite。本次透明 sprite 导入采用灰度 mask（255 可编辑），完整合成图严格零容差；不直接使用 MAS 的 mask 格式或羽化/引擎。全尺寸不透明 inpainting 的自动背景分离尚未实现。
