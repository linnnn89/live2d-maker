# PLAN：借鉴 Mesh Avatar Studio 的改进路线

> 状态：2026-10-05。开发目标是本软件工具的可用工作流。P0/P1 已修复并复验；P3 PSD/平面 PNG manifest 通过；P4 核心原生重放/渲染链路通过，未逐项验收组合见下文。P5 本地 Studio 编辑/保存/重建/Core/QA 及基本 Overlay 路径通过；P6 严格透明素材导入已接入 Studio，预检/确认/重建/QA 闭环通过。已有 mouth_open、tongue、upper teeth 是验证样本，其他角色素材制作与最终美术验收不作为软件计划的必做项。P2 仅在 Agent 视觉估坐标时触发。参考：https://github.com/shinshin86/mesh-avatar-studio
> 实施各阶段前，先读 MAS 对应源码（如 `src/editor/stale.ts`、`vision-check.py`、`render-poses.mjs`）确认细节，不凭记忆实现。

## 0. 架构定位

```
source.png → See-through → [authoring-rig.json] → PSD → PSD2Live(LayerClassifier→RigBuilder)
           → [RigEditOverlay / RigAuthoringJournal] → moc3 → Pose QA
```

| 层 | 真源 | 负责内容 |
|---|---|---|
| Pre-PSD IR | `authoring-rig.json`（新增） | 语义、几何、栅格素材、z 序、来源 |
| Post-rig 编辑 | `RigEditOverlay` / `RigAuthoringJournal`（已有） | parameter、deformer、keyform、physics |
| 最终渲染 | Cubism Core（`live2d-viewer` 的 `window.viewer`） | 唯一的视觉证据 |

### 红线
- IR **禁止**包含 parameter / deformer / keyform / physics 字段，schema 层面 `additionalProperties: false` 强制。
- 不搬 MAS 的 mesh 和变形引擎，也不翻译它的 rig 参数（ellipse、spring、jaw 等）。
- 不降低现有 QA 标准：before/after 对比、相同 spec、像素测量、label audit 仍是判定依据。

## 1. 分阶段

建议顺序：**P0** → P1 → P3 → P4 → P6 → P5（P2 与 P5 同期，或在首个需要 Agent 读坐标的任务出现时再做）。

### P0 地基修复（P1 的前置条件）✅ 独立复验通过 2026-10-05
已核实的问题：
- `live2d-viewer/index.html` 默认读取 `/public/vendor/cubism/` 和 `/public/models/...`，但仓库里没有 `public/`，也没有 Cubism runtime；`specs/*.json` 指向的模型路径都不存在。
- 仓库里只有 `psd2live/examples/{ds,tml}/moc3-cmo3-output/*.moc3` 两个 moc3。
- `skills/live2d-studio/references/` 中有 5 个文件共 12 处硬编码 `work/tools/...`（render-check-harness、workflow、mouth-pipeline、reference-alignment、eye-hair-recipes）。
- harness 文档描述的 viewer API（`load` 等）与 `index.html` 不符：模型由 URL query 的 `model=` / `vendor=` 指定，一个页面只加载一个模型。现有 API 包括 `params`、`view`、`currentView`、`pxPerCanvas` 等。

任务：
1. **Runtime 获取**：官网下载页无法下载（用户实测）。本机已有完全匹配的 runtime：`I:\LIVE2DCHAT\public\vendor\cubism\`，里面有 `live2dcubismcore.min.js`（Core 5.3 / native 6.0.1，SHA-256 `8741f739…ef47`）、`framework.js`（CubismWebFramework 5-r.5 打包，全局名 `Live2DChatCubismFramework`，与 `index.html` 一致）、`shaders/`、README 和 LICENSE。
   - 已复制到 `live2d-viewer/public/vendor/cubism/`，按用户决定纳入仓库。
   - 加一个 check 脚本：校验 Core 的 SHA-256，缺失时提示从 LIVE2DCHAT 复制，或按其 README 中的 `scripts/build-cubism-framework.mjs` 复现。
2. **Fixture 模型**：用用户提供的「夜兰夏日皮肤」（源路径：`I:\live2d模型存放\夜兰 原神【Live2d模型】\夜兰`，约 14.7 MB，moc3、model3、physics3、cdi3、3 张 4096 贴图、exp3、motion3 齐全）。
   - 复制到 `live2d-viewer/public/models/yelan/`，和 viewer 默认的 `/public/models/<pkg>/` 约定一致；文件名改成 ASCII，避免 URL 编码问题，并同步修改 `model3.json` 里的引用。
   - 按用户决定纳入仓库。注意根 `.gitignore` 的 `*.moc3` / `*.model3.json` / `*.physics3.json` / `*.motion3.json` 规则会拦截，需要加 `!live2d-viewer/public/models/**` 例外。
   - 新增 `specs/smoke-fixture.json` 指向它。`psd2live/examples/{ds,tml}/` 亦为完整可渲染模型，按用户决定同样视为可自由使用，可作备选 fixture。
3. **旧 specs**：✅ 已删除 19 个指向不存在 pecorine 模型的 spec（`git rm`，可从历史恢复）；spec 格式见 render-check-harness 文档。
4. **文档路径**：把 `work/tools/...` 全部改为实际路径（`live2d-viewer/`、`psd2live/`、`python/`）。
5. **API 文档**：以 `index.html` 的实际 `window.viewer` 为准重写 harness 文档的 API 段；不为迎合文档去加 `load()`，一模型一页面的方式保持不变。
- 验收：本地放好 runtime 后，`shot.py` 加 `smoke-fixture.json` 能渲染出非空截图；references 中 `work/tools` 出现 0 次。✅ 实测：neutral / AngleX+30 两张出图正常，Core 6.0.1、moc v5、82 params、552 drawables；`work/tools` 0 处；`check_routing.py` 0 失败 / 0 警告。独立复核已证实哈希差异仅为 CRLF/LF：原始哈希 `0ceb9793…9412` 与来源目录相同，规范化 LF 后精确匹配 README 的 `8741f739…ef47`。新增 `check_runtime.py` 校验哈希与 16 个必要文件；修复默认入口的旧模型/vendor URL，以及 `pxPerCanvas`/`exact` 漏乘 unit 的错误，真实浏览器校验默认入口无 404、1:1 与 0.93 倍截图的 alpha 边界缩放一致。

### 独立轨道：发布 gate（不阻塞本计划）
历史 HANDOFF 的发布待办不作为本地开发阻塞。当前根 LICENSE 已存在（GPL-3.0）；vendor-manifest 的 TODO、`--release` 与行为评测在正式发布前单独核对。mouth 样本已有量测，阈值只适用于该 fixture，不能推广为所有角色的美术标准。本计划不修改发布 gate。

### P1 Pose QA Pack（依赖 P0）✅ 独立复验通过 2026-10-05
- 新增 `live2d-viewer/specs/qa-default.json`：neutral、AngleX/Y/Z ±30、BodyAngleX ±、eye close、mouth open、eye close + mouth open、hair extrema。
- 复用 `live2d-viewer/shot.py`、`sheet.py`、`grid.py`，新增 `live2d-viewer/qa.py`，输出 `review/{full,eye-crops,mouth-crops,hair-crops}/`、`contact-sheet.png`、`review.json`。遵循决策约定 stdout 输出 JSON。
- 独立复核修复：QA 与 shot 共用姿态逻辑，支持每个 shot 的 canvas/focus/exact，逐姿态恢复镜位；未知/越界参数或空渲染失败；失败更新 review.json，不保留旧成功报告；无服务时仅在本次运行临时监听 127.0.0.1。默认 spec 固定原生画布 4000×6000，并实测修正局部裁剪；报告存档 spec/哈希、实际参数和镜位。
- 验收：一条命令 `python/Scripts/python.exe live2d-viewer/qa.py` 产出 14 张全身图与对应局部裁剪图、4 张 contact-sheet 与结构化 `review.json`；覆盖 `skills/live2d-studio/references/deep-live2d-render-check-harness.md` 的最低清单；`check_routing.py` 0 失败 / 0 警告。

### P2 Vision 校准关卡（按需触发；推迟到 P5 同期）
- 推迟原因：需要 Agent 给出几何初稿的入口要到 P5 才有；`vision-check.py` 需要新写（MAS 的实现要先读原仓库确认）。
- 只在任务需要“视觉读坐标”时触发（例如由 Agent 给出多边形或关键点初稿）；纯脚本测量的任务跳过。
- `skills/live2d-studio/scripts/vision-check.py make|score`（新建），记录 **MAE / P95 / max error**，写入 `calibration.json`。
- 门槛（以 MAE 和 P95 中较差的一项为准，max 只记录并用于告警）：
  - ≤2 px：允许自动生成几何初稿
  - 2–5 px：只允许粗定位，最终几何必须由算法测量
  - \>5 px：禁止 Agent 自动修改几何
- 证据链：Vision 给初稿 → CV 测量作为几何证据 → Cubism 渲染作为最终证据。
- SKILL.md 补充上述触发条件和门槛。

### P3 `authoring-rig.json` schema v0（Python）✅ PSD 与平面 PNG manifest 路径复验通过
- 仓库级独立目录：`schemas/authoring-rig/`（JSON Schema + 说明文档），以及 `tools/authoring_rig/`（Python 实现）。Skill 只调用，PSD2Live 暂不依赖。
- 每个 part 必填：
  - `id`：稳定 ID，重建或改名都不变
  - `asset`：栅格引用（相对路径）+ `sha256` + 尺寸 + offset
  - `geometry`：bbox、多边形、关键点（虹膜中心、嘴角等）
  - `z`：z-order
  - `semantic`：语义标签（对应 `LayerClassifier` 的分类）
  - `provenance`：来源（see-through / manual / vision / imagegen）、工具版本、时间、上游 hash
- 顶层：`schemaVersion`、画布尺寸、source image 的 hash。
- 工具：`export --psd|--manifest`（PSD 或平面 PNG manifest → IR）、`build-psd`（IR → PSD）、`validate`。manifest 的明确输入契约见 `schemas/authoring-rig/README.md`，不是任意 JSON/See-through 统计文件；缺 PNG、bounds/尺寸不符、目录穿越、重复 ID、非法字段写入前拒绝。独立复核补齐固定 jsonschema 依赖（用户已授权仅安装到项目 Python）；缺依赖/Schema 明确失败，素材同时核对相对路径、SHA-256、实际 PNG 尺寸与 bbox。
- 独立复核修复：ID 不再依赖名称/z，原生 layer ID + XMP 映射保证重建、改名、重排后的 IR 身份稳定；无原生 ID 的首次导入生成 UUID。保留 opacity/visible；v0 无法无损表达的 group/mask/effects/clipping/非 normal blend 在写入前拒绝。几何描述尚不驱动栅格重切，semantic 尚不接入 PSD2Live，后续闭环见 P5。
- 验收：现有 PSD → IR → PSD 的 round-trip **像素 diff = 0**（已在 ds.psd 24 层与 tml.psd 22 层全部验证，图层顺序、名称、offset、bbox 一致，新增独立复核重新计算的合成图 diff = 0）；非法字段（parameter/deformer/keyform/physics）由严格 Schema 与递归红线检查拦截。
- manifest 补验：ds 24 层先生成真实 PNG/清单，再经 manifest → IR → PSD，全部图层 RGBA、名称、bbox、层序/appearance 与重新计算合成图 `max_diff=0`。显式 ID 在 manifest 改名、重排后稳定；geometry/landmarks 可保留。旧 Pecorine 清单实测已缺 `back_hair.png`，导入返回 1 且未创建输出，不把陈旧清单当成功样本。

### P4 stale + Overlay 兼容性🟡 核心链路已复验，全组合与美术验收未完成
- `tools/authoring_rig/stale.py`：对 IR 字段分组计算签名，并映射到 DAG：
  `source → segmentation → IR → PSD → PSD2Live base rig → Overlay apply → moc3 → review`。
  - 改多边形或素材：PSD 及其下游 stale
  - 改 z 序：PSD 及其下游 stale
  - 只改 semantic：PSD2Live 及其下游 stale，PSD 不 stale
  - 改视图状态：不 stale
- 新增状态 **`overlay: ok | needs-review | broken`**：base rig 重建后，检查 Overlay 的每个 `RigTargetRef` 是否仍能解析、几何是否兼容（点数、拓扑）。不通过的标为 needs-review 或 broken，**不静默应用**。独立复核发现原实现只匹配 IR 的 id/name，且漏掉原生 keyformDeletes/keyformCopies/journal 与 deformer/glue；已修复为使用可选的完整 rig_get_object 快照进行引用/点数预检。无快照、几何拓扑/静态形状证据不足、结构/物理/journal 编辑均 needs-review，点数不匹配或缺失目标 broken；两者 CLI 均返回 1。
- 检查逻辑对照 `RigEditOverlay.kt`、`RigIntegrityValidator.kt` 的现有校验实现。CLI 支持 `stale` 与 `check-overlay` 子命令，stdout 输出标准 JSON。
- 已验收：改多边形 / 改 semantic / 改视图元数据 / source hash / z / appearance / asset 的失效推导；原生 Overlay 字段名、缺失目标、warp/rotation/glue/journal 引用与点数变化拦截；Python 模块入口失败返回非零。
- 新增 `native-base` / `native-replay`：使用项目便携版 PSD2Live 和已有 JPype，从真实 PSD 建立基线，再重建并核对完整 PuppetModel 字段签名（有序顶点/UV/三角、静态形状、父子变形器、parameter 与 keyforms）及 runtime 哈希；同点数但 rest geometry 变化仍 needs-review，不自动应用。缺失目标或点数不符 broken。原有 keyform/parameter 编辑默认使用便携版；`--native-jar` 可显式选用当前源码构建的应用 JAR，接入 warps/physics/structure/authoringJournal，仍使用原便携 JVM 与固定依赖。调用原生 applyTo、neutral/head-angle/directional-warp 校验及含 MOC3 回读的导出链。新增警告需复核，原基线警告公开保留；native ok 与视觉验收分开。
- 真渲染补验：ds 基线 29 ArtMesh，Face 162 顶点。opacity=0.45 或局部坐标 x delta=0.02 的两个独立探针，在 AngleX=+30 分别改变 **2781 / 2573** 像素；neutral、AngleX=-30、AngleY=±30 均 diff=0，导出 moc3 哈希改变。既有 15 条原生警告未新增；不是零警告的模型美术验收。回归已能捕获漏接不可变 setKeyform 返回值导致“成功导出但编辑没生效”。
- 继续补验：新增/修改/删除 parameter 与 keyformCopies/keyformDeletes 的原生映射；快照补齐 warp/rotation/part/glue，set 几何按 target kind 校验。持久化 delete 用原生编辑列表构造，避免交互式 deleteKeyform 提前删除 copy 的源 set。新参数 ParamAuditVisibility 在 0/0.5/1 时分别保持基线、改变 2709/2752 像素（最大差 0/53/107）。set +30 → copy -30 → delete +30 的最终 -30 改变 2753 像素，neutral/+30 diff=0；Warp controlPoints 编辑 +30 改变 2313 像素，neutral/-30 diff=0。删除 ParamBreath 后真实 Cubism 参数列表中不再存在该 ID，neutral/±30 均 diff=0。相关原生集成回归通过（66.429 秒），本轮未新增测试方法。
- 源码运行时补验：用户授权后在 `portable/build-tools/` 安装 Temurin JDK **21.0.12.1+1**、Gradle **9.6.1** 与项目内缓存，官方 SHA-256 校验通过，不改系统 PATH。完整构建发现 `CubismSdkPreviewSession.kt` 缺失且被 `*CubismSdk*` 误排除；依用户要求检索 LIVE2DCHAT、Open-LLM-VTuber 与 I 盘后，从上游匹配的 v0.7.1 恢复 Kotlin 适配源码，补当前调用方的 sampleMotion，并仅对此源码添加 Git 例外。完整构建、CLI 启动通过；Kotlin 全套 **201 tests / 0 failures / 1 skipped**（未配置的 nunif 真模型测试），Python 工具全套 **10/10**。现有便携版 **91** 项 JAR/JVM 哈希均未改变。
- 新路径实证：new/fit_local Warp 与 structure create→rename（含去重重放）导出通过；ordered journal warp→structure→set(+30)→copy(-30)→delete(+30) 与同结构基线比较，只有 -30 改变 **2744** 像素、max diff **95**，其他四个姿态 diff=0。physics3/model3 引用正确，Cubism Web Framework 在实际 viewer 模型上评估 **180 帧 / 60 FPS** 后，ParamHairFront **0→0.34906584**，变化 **8460** 像素、max diff **190**，记录到的浏览器错误 **0**。5 组固定 spec 共 **25** 姿态通过，标签审计均 **29 层 / 0 unknown**，既有 **15** 警告未新增。证据在 `out/iteration-audit/p4-source/`。
- 数值与边界：fit_local 的原生世界坐标最大差 **0.000061035 px**，MOC3 回读最大差 **0.004654 px**；640×640 渲染在 X+30 有 **19** 像素变化（max 13），Y-30 有 **4** 像素变化（max 1），其他三姿态零差异，不能称为完全逐像素不变。预检对 journal 中先创建再引用的对象保留 needs-review，真正缺失/引用顺序错误 broken；原生阶段逐步核对。已修复 ArtMesh flipX 被原生静默忽略却报告 ok 的问题，set/copy/delete 按原生 owner/channel 契约拒绝不适用通道。缺 mesh、错误布尔类型、缺物理参数、journal 缺 target/点数错误/未知参数、混用运行时均失败且不创建输出。其他对象/通道组合、assetLayers/calibrationLayerIds、原生桌面 SDK 预览与 Cubism Editor 美术交互未验收；不支持的非空 section 仍 needs-review。P4 保留上述验收边界；该阶段当时尚未推进 P5/P6，当前状态见后文。P2 仍按需触发。

### P6 局部 mask 素材导入 ✅ CLI / Studio 工具闭环已交付
- source/PSD + 局部 mask + prompt → ImageGen → 严格检查 mask 外 diff → 抽出透明图层 → 写入 IR（`provenance=imagegen`）→ PSD → PSD2Live。
- 可选验证样本：mouth_open、tongue、teeth、eye_closed_L/R、眉毛变体、blush。仅在发现具体分类/绑定问题时补相关样本，不以逐类生成素材作为完成条件。
- 对接 `deep-live2d-psd2live-mouth-pipeline.md`。
- 工具验收：新增/替换保持数据契约；mask 外像素无变化；预检/取消不写活动 IR；旧版本和候选篡改拒绝；确认后 stale/旧模型保护正确；UI 导入→原生重建→Core→Pose QA 通过。嘴部样本包含 `ParamMouthOpenY` 0 / 0.5 / 1；不要求生成完整角色。
- 已交付：`import-generated` 接收透明 RGBA sprite、画布大小二值 mask、显式落位矩形和 prompt；可新增或按稳定 ID 替换 Part，标 provenance=imagegen。生成原图、mask、prompt、配准/像素报告保留，输出到新目录；不裁掉 mask 外像素来伪造通过。ImageGen 由 Agent 调用，CLI 不内置 API/下载模型。`--fit` 显式按宽高比配准，`--sprite-bounds` 记录源裁取及排除 alpha。
- Studio 接入：顶部“导入生成素材”提供 PNG/mask 文件选择、新增或稳定 ID 替换、整数落位、显式适配/源裁切、生成说明；预检默认局部前后对照，可切换全图，显示保护区统计。复用现有 CLI 在工作区旁临时目录预检，成功候选归档到 `imports/<id>/`；预检/取消不写活动 IR，输入变更取消确认资格，确认校验 revision/候选 hash/素材 hash。旧成功模型和 QA 保留且 stale，原生 Rebuild 成功后再允许 QA。浏览器没有直接文件路径或自由命令输入，不新增依赖/API。
- 工具验证：真实临时 PSD/PNG 的新增、替换、保护区拒绝、并发版本冲突、候选篡改保护 2 个新增测试；Python 全套 **18/18，123.752 秒**。Edge/已有 Playwright 桌面 **1587×950** 与窄屏 **390×844** 实测上传/拒绝/预检/输入失效/取消/确认/刷新/重建/QA；复用旧 PNG，Part 24→25，原生层29→30，0 unknown、15既有警告不变，前后各16姿态。固定640×760/原画布1280×1280/相同像素测量镜位，闭嘴0变化、张嘴54像素变化。26源文件哈希一致，最终控制台error/warning、pageerror与资源失败0；一条故意越界预检400按预期处理。TypeScript/Vite构建通过，详见HANDOFF第15节。
- 实测 ds 隔离缺嘴样本：23 层→新增 mouth_open→24 层 PSD→原生导出→真实 Edge/Core 6.0.1。原有 23 Part/PSD 图层未变，重算 PSD 合成图 mask 外 `changed_pixels=0/max_diff=0`；新增口型的 IR 合成图改变 625 像素。生成 PNG 的 105 个远处 alpha=1 散点经显式源裁取记录，主体配准为 35×22，放入 [612,330,647,357]。mask 验收针对配准后素材和完整合成图，不声称原始生成图逐像素未变。
- QA：改前/改后各 9 姿态（嘴 0/0.25/0.5/0.75/1 + 头 X/Y±30 张嘴），标签 0 unknown，缺嘴警告消失；口型经原生关键形驱动。闭嘴为单条弧线，隔离渲染逐列最大线厚约 2.094 原画布像素，5 档 alpha 总高度 113/125/155/200/221 render px（固定 640×640、focus=[600,320,660,370]），开口单调变化。当前独立唇线机制与旧配方不同，未把 bbox 总高度误当线厚；阈值仅针对本 fixture。工具全套 13/13，通过 110.129 秒；本轮新增测试方法 3。
- 补验 tongue/upper teeth：使用 built-in ImageGen 分别生成真实透明素材，经显式源裁取/保持比例配准导入现有 mouth_open 副本。PSD 24→26层，原24 Part/PSD层属性与RGBA不变，完整合成图mask内变化232像素、mask外0/max0；生成远处alpha=1散点22/125个分别记录，原图保留。原生导出31画元/0 unknown，91项运行时哈希及15条既有警告与基线相同。MOC3 两个新增画元均以 ArtMeshMouthOpen 为唯一遮罩；MouthOpen=0/0.075/0.15 的实际 opacity=0/0.5/1，闭嘴无像素贡献；微张口时虽opacity已升高，仍可被收缩的mouth mask完全遮住。相同640×640/原画布1280×1280/focus=[488,128,744,384]下，嘴0/0.075/0.15零差、嘴0.5/1变化539/1193像素，头X/Y±30张嘴变化1034/1007/938/1047像素。前后各20姿态覆盖嘴7档、头XYZ、身体X、闭眼张嘴、头发极值及全身neutral；真实Core量测与嘴0/0.5/1、头XY对照图已核对，浏览器错误0。38文件备份哈希核对，备份实际渲染成功。证据在 `out/iteration-audit/p6-mouth-internals/`，详见HANDOFF第14节。
- 边界：真实验收了 mouth_open、tongue、upper teeth 新增路径；通用替换/边界拒绝由临时 PSD 集成测试覆盖，lower teeth、eye_closed_L/R、眉毛变体、blush 尚未各自生成或视觉验收。未支持全画布不透明 inpainting 自动背景分离；mask 由调用方提供。已对照 MAS variant-requests/build-sprites 源码，格式和容差差异见 schema README，不搬其引擎。本次复用现有代码和原生绑定，没有为样本新增模型逻辑/依赖，未重跑未改动的完整测试。原mouth_open纹理的亮部保留，上牙为新增独立层，整体美术仍由用户终裁。未覆盖原模型、同步安装技能或发布；P2未触发。

### P5 独立 Studio 前端 ✅ 本地编辑闭环已验收 2026-10-05
- 新目录 `studio/`：Vite + TypeScript + React。**不改** `live2d-viewer/index.html` 的定位。
- `live2d-viewer` 及其 `window.viewer` API 保持不变，继续作为稳定的 headless QA renderer；Studio 通过 iframe 或模块嵌入的方式调用它。
- 三栏布局：左边 Parts（来自 IR）| 中间原图叠加可拖拽的多边形和关键点 | 右边 Cubism 实时预览 + 参数滑块。
- 编辑只写 IR；显示 P4 的 stale 和 Overlay 状态；按钮包括“Rebuild”和“Run Pose QA”（调用 P1）。
- 验收：拖动一个点 → IR 更新 → stale 正确 → 重建 → 右侧 moc3 刷新 → Pose QA 产出新的 contact sheet。
- 已交付 `studio/`（React 19.2.4 / Vite 8.3.2 / TypeScript 5.9.3，锁文件固定）和 `studio-open/snapshot/save/rebuild/qa` CLI。Vite 只转发白名单 CLI，监听 127.0.0.1:5173；Host/Origin 校验、shell=false、写入串行化、Python 排他锁、revision 冲突拒绝与资源目录白名单均已接入。源 PSD/IR/PNG 复制到隔离工作区，产物按版本保留；重建失败不替换成功模型，QA 失败取消旧成功 gate。配置和启动见 `studio/README.md`。
- 补齐前一轮发现的几何断链：polygon 按原画布像素中心、even-odd 填充裁切当前层 alpha；builder 与完整 IR/mask 合成共用同一实现，源 PNG 不写入，默认 bbox 矩形保持原像素。landmarks 可添加/拖动/保存，但只作为注记。旧非矩形 polygon 现在产生实际裁切，此行为变化在 schema README 明示。UI 仍展示原合成图叠加编辑点，右侧展示最近成功的 moc3。首次核对 MAS 固定提交的 EditorCanvas/stale 源码和 Vite 官方 configureServer 契约，未搬其 rig/mesh 引擎。
- 真浏览器验收（项目 Python Playwright / Edge，Browser 插件技能未列出）：1587×992 桌面与 390×844 窄屏。ds 的 front hair 顶点从 `[484,73]` 实际拖至 `[629,218]`，保存并刷新保留坐标；PSD/base/moc3 stale，Rebuild 后新模型 URL 与 moc3 SHA-256 均改变。固定 640×760、相同 source alpha bbox 取景下 neutral/X+30/X-30/mouth-open 改变 **15417/19252/19837/15419** 像素，max diff 均 255；用于证明裁切生效，故意削去刘海，不是美术修复成品。23 个非目标 PSD 层 RGBA/name/bbox 未变；24 个源 PNG 和原 ds.psd 哈希未变。标签由 29→28（目标部件拆分变化），最终 0 unknown，15 条既有原生警告保留。
- UI 的 Run Pose QA 产出 **16** 个姿态、固定 spec/哈希/参数/镜位、contact-sheet/review.json，并清除 review stale。首轮在 hair_minus 因 fixture 无 ParamHairSide 明确失败；已改为从导出的 CDI 读取可用头发参数，其他必需姿态仍严格检查。滑块确实改变原生画面，关键点添加与实际拖动通过；过期保存 400、跨域写入 403、路径逃逸 404；最终 pageerror/consoleerror/资源 HTTP 错误 0，窄屏无横向溢出。备份 39 文件归档，备份 export 的真实 neutral 渲染通过。证据在 `out/iteration-audit/p5-studio/`，本轮截图在当前聊天的 visualization 目录；未重读旧模型截图。
- 验证：TypeScript/Vite 打包通过；Python 工具全套 **15/15，107.952 秒**（本轮新增长期回归方法 2 个：真实 PSD polygon 裁切与工作区保存/版本冲突/输入保护；另有 1 个实际浏览器场景脚本，未扩大 Kotlin 测试或改运行时）。全套仍覆盖 P3 的 ds/tml 零差 round-trip、P4 原生重放与 P6 生成素材保护。桌面 UI 按已存在概念图核对三栏比例、白/蓝配色、文字/操作按钮、图层缩略图、棋盘背景、选中状态和参数区；原素材/层序与概念的示意内容不同，保留真实模型数据，并增加必要的关键点、警告与 QA 查看入口。
- 附带 Overlay 的 UI 补验：修复原生成功应用仍显示保守 `needs-review` 的状态错误；成功报告绑定 IR 与 Overlay/baseline 哈希，失败报告持久保存并关闭 QA，保留旧模型。修复浏览器将 `484.0` 写成 `484` 时等值完整 IR 的误失效。ds ArtMeshFace 的 X+30 关键形 positionDeltas/opacity 在实际 Cubism 生效：固定 640×640、原画布 1280×1280，X+30 改变 **2820** 像素/max160，neutral/X-30/Y±30 均零差；标签 29 层/0 unknown、既有 15 警告未新增，UI 16 姿态 QA 通过。真实拖点保存后原生完整签名拒绝重建为 needs-review，缺失目标为 broken；两者刷新保留、旧模型 URL/moc3/同姿态 PNG 不变、QA 禁用，恢复输入后已有成功模型/QA 可用。证据在 `out/iteration-audit/p5-overlay/`，详见 HANDOFF 第 13 节。
- 工具复审修复：首次打开遇到 busy409 最多自动尝试3次（两次重试间隔1s/2s），耗尽或其他错误提供“重新打开工作区”；未加载时IR/PSD/模型/QA状态为未加载/未知。画布全图使用当前显示参照图的alpha范围，成功模型使用自身构建IR的范围，新导入尚未重建不改变旧模型镜位；旧报告兼容读取，源参照与报告不改写。界面明确参照图不会随隐藏/裁切实时更新。新增1个版本/范围回归，焦点5/5，Python全套 **19/19，123.951s**；实际浏览器验证有限重试/手动恢复及原范围外标记导入→原生重建→16姿态QA。Part25→26、标签30→31、unknown0，标记实际可见1229渲染像素；223原工作区文件逐字节哈希不变。原生新增Objects标记有2条默认姿态偏差警告，原有15类警告保留，不把它们隐藏为通过。测试后恢复原25Part工作区。详见HANDOFF第16节。
- 边界：仅本地 dev server，dist 不是独立 CLI 应用/发布包；主画布自由编辑仅开放 geometry/appearance，素材/层名变更由 P6 的严格导入入口处理，semantic 仍以 PSD 层名分类。无 Overlay 及 ArtMesh geometry/opacity Overlay 的成功/拒绝/恢复 UI 流程实测通过；其他 owner/channel、journal、physics 组合尚未在 Studio 逐项视觉验收，无冲突解决界面。QA 是静态姿态，不验证 physics 实时播放或 Cubism Editor。默认取景与初始 polygon 由 PNG/PSD 像素算法产生，未让 Agent 从图估坐标，P2 校准条件未触发；其他素材属于可选样本，未逐类美术验收。未同步安装技能、提交、推送或发布。

## 2. 已定决策
- **P5 调用方式**：CLI 是唯一的调用契约。浏览器本身不能执行命令，所以由 Vite dev server 中间件（`studio/vite.config.ts` 中的插件）接收请求，再 spawn `tools/authoring_rig` 等 CLI。
  - 中间件只做转发，不放业务逻辑；不新建独立的后端服务。
  - CLI 统一约定：输出 JSON 到 stdout、非 0 退出码表示失败，供 Studio、Skill/Agent、手工调用共用。
  - 只监听 127.0.0.1，命令走白名单，参数不拼接成 shell 字符串。
