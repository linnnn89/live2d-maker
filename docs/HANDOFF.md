# 交接记录（HANDOFF）

> 本仓约定（pb-publish-and-handoff 引用）：结论**追加**编号小节到本文件末尾，不新建 md。
> 校验范围：只查链接/锚点，不设预算（状态文件会增长）。

## 格式

每节：`## N. <主题>（YYYY-MM-DD）`，含三段：**改动摘要** / **验证数字**（可核对的像素量、哈希、命令输出）/ **未做项**（如实列写，如"Cubism Editor 人工复核未做"）。

## 1. 技能包初建（2026-09-22）

- **改动摘要**：skills/live2d-studio/ 四层路由包落地（L0 + 6 route + 6 pb + L3 索引 + stub + vendor 台账），check_routing.py 结构校验，README/docs 对齐（M1–M3）。
- **验证数字**：`python scripts/check_routing.py` 结果见会话记录；--release 因 vendor TODO 保持失败（设计如此）。
- **未做项**：嘴部 fixture 阈值 `TODO(实测)`；vendor 许可审计；行为评测（G5）。

## 2. 原版技能对照与校验加固（2026-09-22）

- **改动摘要**：对照 Hermes `live2d-psd-model-repair` 与本机 `.agents/skills` 原版技能；修正为 8 refs + 3 scripts，补回 `hairline_probe.py`，把 `source-part-segmentation` 接入拆层失败分支并为 Blender 技能补 Cubism 禁用边界；拆分外部技能竞争/缺失语料，新增语义标签、发际线试改、拆层粘连用例；校验器新增 L1/L2 内容契约、非空 license/tags、生命周期转移、语料真实可达和 G5 行为记录检查。
- **验证数字**：3 个回归测试通过；结构校验 `0 失败 / 0 警告`；三类 scratch 负向变异均被正确拦截；`--release` 明确报告 5 项未就绪。
- **未做项**：未定稿仓库根 LICENSE；vendor manifest 许可/哈希/复核日期仍有 TODO；真实 Agent 行为评测状态为 `not_run`；嘴部 fixture 阈值仍待实测。

## 3. 技能合并安装与旧技能移除（2026-09-22）

- **改动摘要**：将原 Hermes `live2d-psd-model-repair`（主文档+8 refs+3 scripts）和 `reference-art-alignment`（主文档+2 refs+1 script）完整迁入 `live2d-studio` 的 `deep-*` 参考与 `scripts/`；移除私有 Agent 状态目录读取指令；安装到 `~/.agents/skills/live2d-studio` 与当前 `$HERMES_HOME/skills/live2d-studio`；删除两个旧 Hermes 技能。保留通用 `hermes-skill-pack-design`，仅移除其旧关联；`.agents` 的跨界增强技能未被完整吞并，保留。
- **验证数字**：旧来源树哈希分别为 `1b264f0a1a00246fdacd102a63e1351b57c5ce4c29517c130b004ba1767839fd`（12 文件）与 `c55525c95a61b55421d5526cc2d35a1a33ea2a7bb35d2121f82a0c07d971b4ae`（4 文件）；迁移包 4 个脚本编译/接口冒烟通过；安装后三份技能树哈希一致。
- **未做项**：迁入旧技能未声明再分发许可，故仅允许本机整合，`--release` 必须失败；新技能需新会话才会进入 Hermes 技能索引。

## 4. P1 Pose QA Pack 落地（2026-10-05）

- **改动摘要**：依 `docs/PLAN.md` 落地 P1 阶段。新增 `live2d-viewer/specs/qa-default.json` 覆盖标准全量姿态与眼/嘴/发局部裁剪框；新增 `live2d-viewer/qa.py`，复用 `sheet.py` 与 Playwright 渲染流，支持单命令运行、生成 `review/{full,eye-crops,mouth-crops,hair-crops}/`、4 个 contact-sheet 与结构化 `review.json`；遵循 Studio/CLI 契约由 stdout 输出 JSON；同步更新 harness 文档。
- **验证数字**：`python live2d-viewer/qa.py --spec live2d-viewer/specs/qa-default.json --outdir live2d-viewer/review` 产出 14 张全身姿态图、42 张局部裁剪图（eye 220×150、mouth 140×100、hair 420×520）、主 contact-sheet 2126152 字节、3 个子 contact-sheet 以及 5780 字节 `review.json`，退出码 0，耗时 ~5 秒；`python skills/live2d-studio/scripts/check_routing.py` 报告 0 失败 / 0 警告。
- **未做项**：发布 gate 独立轨道项（LICENSE/vendor manifest/release 评测）按设计保持未处理；P3 `authoring-rig.json` 待下一阶段推进。

## 5. P3 authoring-rig.json schema v0 落地（2026-10-05）

- **改动摘要**：依 `docs/PLAN.md` 落地 P3 阶段。新增 `schemas/authoring-rig/authoring-rig.schema.json` 与说明文档，红线禁用 parameter/deformer/keyform/physics；新增独立包 `tools/authoring_rig/`，包含 `classifier.py`（对齐 31 种语义与侧别）、`exporter.py`（PSD 导出为 IR 与切片资产）、`builder.py`（IR 重建分层 PSD）、`validator.py`（红线与哈希校验）与 `cli.py`（export/build-psd/validate 命令）。
- **验证数字**：在 `ds.psd`（24 层，1280×1280）与 `tml.psd`（22 层，2048×2048）上执行 PSD → IR → PSD 全链路 round-trip，重构后 PSD 图层顺序、图层名、offset、bbox 与原版 100% 一致，全部 46 个图层 RGBA 像素比对 `max_diff = 0`；负向测试成功拦截带 `parameters`、`deformer` 的非法 IR 以及篡改 SHA-256 的素材。
- **未做项**：P4 stale 与 Overlay 兼容性检查待下一阶段推进。

## 6. P4 stale 与 Overlay 兼容性检查落地（2026-10-05）

- **改动摘要**：依 `docs/PLAN.md` 落地 P4 阶段。新增 `tools/authoring_rig/stale.py` 实现基于字段签名与 DAG 的失效推导（`source → segmentation → IR → PSD → PSD2Live base rig → Overlay apply → moc3 → review`）；实现 `overlay: ok | needs-review | broken` 兼容性判定，严格拦截未解析目标与点数/拓扑不匹配；`cli.py` 新增 `stale` 与 `check-overlay` 命令，并新增自动化测试套件 `tools/authoring_rig/tests/test_stale.py`。
- **验证数字**：单元测试 5/5 全部通过：改多边形时 `psd` 及下游 100% stale；只改 semantic 时 `psd: false` 且 `base_rig` 及下游 100% stale；只改视图与元数据时 0% stale；删除 target 时 `status == "broken"`，CLI 退出码 1 并输出结构化原因。
- **未做项**：P6 局部 mask 素材生成与 P5 独立 Studio 前端待后续推进。

## 7. P0 起逐阶段独立复核与必要修复（2026-10-05）

- **改动摘要**：复核上述 P0/P1/P3/P4，保留既有工作区改动。P0 修复默认 viewer URL、pxPerCanvas/exact 的 unit 换算，并补 `check_runtime.py`；Core 的 CRLF/LF 哈希差异已实证。P1 共用 shot 姿态逻辑，恢复每次取景，支持逐 shot canvas/focus/exact，拒绝未知/越界参数和空渲染；单命令临时启动本地服务，错误报告覆盖旧成功报告；固定 fixture 原生画布 4000×6000，并实测修正眼/嘴/发裁剪。P3 补 jsonschema 固定依赖（用户授权安装到项目 Python），严格校验 schema、PNG 尺寸/哈希/路径/bbox；以原生 PSD ID + XMP 保留重建/改名/重排身份，保留 opacity/visible，无法无损表达的 PSD 结构明确拒绝；修正分类器误匹配与 Python 模块入口退出码。P4 补 source hash/appearance 的失效传播，使用原生 rig_get_object 快照核对 sets/deletes/copies/journal 及各类 target；证据不足返回 needs-review，和 broken 一样返回非零。
- **验证数字**：相关工具测试 **10/10** 通过（本轮只新增 **3** 个回归测试，其余为原有测试的运行或增强）；路由测试 **3/3** 通过，check_routing **0 失败 / 0 警告**。ds 24 层与 tml 22 层共 **46** 层的名称/位置/bbox/可见性/透明度与 RGBA 像素保留，重新计算的合成图 `max_diff = 0`。真实 Edge/WebGL2 默认入口无 404，0.93 与 1:1 的 alpha 边界比例独立验证通过。Core 原始 SHA-256 `0ceb97935bb296ac7666824ff13d8dfdc21802b7694152f637502093b88f9412`；LF 规范化后 `8741f739779b5d5210872bd3d7d99f0f1e56e6c87409e7d26d6bb4b80aa1ef47`。最终 QA 在 `out/iteration-audit/p1-final/`：**14** 全身图、**42** 局部图、**4** contact sheet、review.json（stdout 可解析 JSON）；浏览器错误/404 **0**，13 个非中立姿态都有像素变化，其中闭眼 **1178**、张嘴 **152**、组合 **1330** 像素。
- **未做项与更正**：第 6 节“严格拦截点数/拓扑不匹配”与“P4 完成”的结论过强。Python 预检不能单凭 IR 确认生成 rig 的 target，也不能仅凭原生快照的点数证明顶点顺序/三角拓扑；完整的原生 applyTo + RigIntegrityValidator + moc3 渲染重放尚未验收，PLAN 已标为部分完成。P3 只有 PSD 输入，manifest 导入未实现；几何/语义编辑尚未形成 P5 的实际重建闭环。无原生 ID 的 PSD 首次导入生成 UUID，原 IR 应作为真源保存；XMP 被外部软件移除时不保证任意 IR ID 的恢复。未改模型素材、未推进 P2/P5/P6、未处理发布 gate、未操作 Cubism Editor、未更新已安装技能、未提交或推送。

## 8. 继续复核：manifest 导入与受限原生 Overlay 重放（2026-10-05）

- **交付**：P3 新增 `export --manifest`，读取现有 source-manifest 的 canvas/layers/cropped PNG 契约，保存显式 ID、geometry/landmarks、semantic、appearance、provenance；缺图、尺寸不符、路径逃逸、重复 ID、绑定字段在写入前拒绝。旧 Pecorine manifest 实测缺少 back_hair.png，返回 1 且不创建输出。P4 新增 `native-base/native-replay`，使用已有 JPype 和便携版 PSD2Live，保存完整 PuppetModel 字段指纹及 runtime 哈希；缺目标/点数不符 broken，同点数但完整原生模型改变 needs-review，均不自动导出。匹配后走原生 Overlay applyTo、neutral/head-angle/directional-warp 校验和包含 MOC3 回读的导出链，之后以 Cubism 实际渲染复核。
- **实际修复**：before/after 曾发现桥接漏接不可变 setKeyform 返回值，导致 moc3/截图未变；已修正并增强同一个回归测试，要求 moc3 哈希改变、指定姿态发生像素变化、中立保持零差异。该问题不能由“出文件/原生校验通过”证明修复。
- **验证**：最终相关工具测试 **10/10 通过，114.350 秒**；本次新增测试方法 **0**，增强已有测试（含真实 native→moc3→浏览器工作流）。manifest→IR→PSD 的 ds **24** 层 RGBA、名称、位置、bbox、层序、appearance 与重算合成图 `max_diff=0`。原生基线 **29** ArtMesh，Face **162** 顶点；平移源 Face 1 px 后点数仍为 162，但模型签名改变，自动重放被拦截。三份最终导出 label audit 均 **0 unknown**，tag/side 一致。独立 opacity=0.45 / positionDeltas x=0.02 探针在 AngleX=+30 分别改变 **2781 / 2573** 像素，neutral、AngleX=-30、AngleY=±30 的 diff 均为 **0**；既有 **15** 条原生警告未新增。最终证据在 `out/iteration-audit/p4-native/{base-final,replay-opacity-final,replay-geometry-move,qa-before,qa-after-opacity-final,qa-after-geometry-move}/`；对比图 before-after-final.png、数值 final-render-diff.json、测试日志 p3-p4-final-tests.stderr.log。
- **边界**：当前桥接只支持 keyformSets 的 ArtMesh positionDeltas 与 opacity。便携版 `0.7.1-e64db76a…` 早于当前源码，缺 authoringJournal；其他非空编辑类型明确 needs-review，没有完整原生重放验收。P4 仍标为部分完成，P3 的限定 manifest 契约已通过。透明度/位移为功能验证探针，不是模型美术成品；基线既有警告公开保留，不声称零警告。原模型、已安装技能、系统环境未改；无依赖/运行时/模型下载，未提交或推送。P2/P5/P6 与发布 gate 未实施。

## 9. P4 继续：parameter、copy/delete 与 Warp keyform（2026-10-05）

- **交付**：native bridge 接入 parameters/deletedParameterIds、keyformCopies/keyformDeletes，以及原生 Warp/Rotation 几何与 channels 映射；对象快照补齐 warp/rotation/part/glue。set/copy/delete 的参数范围在原生 parameter 头部编辑之后检查，新增参数可驱动 keyforms；重复/冲突定义、删除不存在的参数、未知字段、错误几何类型、非法/空值明确失败。仍拒绝不支持的 warps/physics/structure/journal 非空 section。
- **实证修复**：持久化 Overlay 中 set → copy → delete 的加载不能调用交互式 deleteKeyform，该方法会提前丢弃 copy 的源 set；改为构造原生 delete 列表，保留 applyTo 的既有执行顺序。原生编辑数量写入报告，便于核对源列表没有丢失。
- **验证**：增强同一个原生集成回归，真实 native→moc3→Cubism 浏览器渲染通过，**66.429 秒**；本轮新增测试方法 **0**，未重复运行未变的 P0/P1/P3 全套。独立 640×640 探针：新增 ParamAuditVisibility 在 0/0.5/1 时变化 **0/2709/2752** 像素，最大差 **0/53/107**；set(+30)→copy(-30)→delete(+30) 的 -30 变化 **2753** 像素，neutral/+30 为 **0**；Warp controlPoints 的 +30 变化 **2313** 像素，neutral/-30 为 **0**。删除 ParamBreath 后真实 runtime 参数列表确认 ID 消失，neutral/±30 的 diff 均为 **0**。四份最终导出 label audit 均 **29 层 / 0 unknown**，tag/side 一致；四组 QA 无 404/记录到的 pageerror/consoleerror。证据：`out/iteration-audit/p4-remaining/{render-diff.json,label-audit.json,tests.stderr.log,contact-sheet.png}` 及各 replay/qa 目录。
- **边界与环境授权**：便携 JAR 确认没有 authoringJournal，RigWarpEdit 也没有源码新增 fitLocal；所有对象/通道组合未逐组合验收，完整 P4 仍部分完成。physics 固定关闭，尚未接入，不能以验证参数存在代替物理文件导出。当前源码要求 JDK 21 / Gradle 9.6.1，已检查现有旧 JRE、项目运行时、PATH 与默认缓存，未发现可用构建工具。官方 Gradle 分发 HEAD 返回 200、大小 **140682664 bytes**，Kotlin 2.4.10 compiler POM 返回 200；仅做只读版本核对，未下载。按用户环境规则，项目内下载 JDK/Gradle/构建依赖的授权问题已发出，尚待答复；不覆盖现有便携版，不修改系统 PATH。P2/P5/P6、原模型与发布保持未动，未提交/推送。

## 10. 授权后续验：源码构建与 P4 journal / structure / fit_local / physics（2026-10-05）

- **构建与缺失源码定位**：项目内下载 Temurin JDK 21.0.12.1+1（205073461 bytes，SHA-256 f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e）与 Gradle 9.6.1（140682664 bytes，SHA-256 9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14），均核对官方校验和，缓存也在 portable/build-tools。完整构建首先发现 CubismSdkFrame/Session 源码缺失。按用户要求查 LIVE2DCHAT、Open-LLM-VTuber、I 盘可读 Kotlin/Java 文件及 PSD2Live JAR；找到旧便携 JAR 的编译类，但未找到本地源码。GitHub 上游提供源码：采用匹配接口的 [v0.7.1 适配源码](https://github.com/tsunehimatoi/psd2live/blob/959d643bcf6c43440e13e231837d4c15d3dcde02/src/main/kotlin/io/github/psd2live/core/CubismSdkPreviewSession.kt)，为当前 sampleAgentMotion 调用适配上游 sampleMotion。只恢复 GPL Kotlin 适配层，修复 *CubismSdk* 的源码误排除，未下载专有 Core/SDK 二进制。完整 jar 构建与 MainKt --help 启动成功；临时核心编译方案已移除。
- **P4 交付与具体修复**：native-base/replay 增 --native-jar，可选新应用 JAR且固定原 JVM/依赖哈希，不覆盖便携版。接入原生 warps/physics/structure/authoringJournal；每步 journal 在上一实际模型上核对 target/拓扑/参数，并通过原生 applyTo 重放。JSON/Companion 经真正的 Kotlin 单例字段取得，避免 JPype 把内部类当实例。预检不把 journal 中先创建后引用的 Warp 判为永久缺失；错误顺序仍 broken。发现 ArtMesh flipX 请求 native ok 但 moc3 完全未变，按原生 staticValueOf 契约补 set/copy/delete 的 owner/channel 校验，修后导出前明确失败。新物理编辑导出 physics3 并链接 model3，默认物理规则不开启，不以“参数存在”代替实际物理验证。
- **实际验证**：重点 Kotlin 11/11 后，完整 Kotlin **201 tests / 0 failures / 1 skipped**（realNunifSmokeWhenConfigured，未下载权重）；Python 工具全套 **10/10，108.163 秒**。本轮新增自动化测试方法 **0**，增强现有 history journal 持久化与原生通道拒绝回归；最后的通道修复后，原生导出/渲染集成回归 **1/1 通过，54.842 秒**（test-channel-regression.log）。5 组固定 640×640 spec 共 25 个姿态出图，标签均 29 层 / 0 unknown / tag-side-parameter 一致；既有 15 原生警告未新增。journal 的 warp→structure→set→copy→delete 相对同 Warp/结构基线只改变 X-30 **2744** 像素（max 95），neutral/X+30/Y±30 为 0。物理探针在加载时捕获真实 viewer 模型，由 CubismPhysics 评估 180 帧/60 FPS，输出 ParamHairFront 0→0.34906584，实际 Core 图像 **8460** 像素变化（max 190），pageerror/HTTP错误 0；早期测试取得模型的方式造成了无效视觉对照，未修改产品渲染器来补偿，保留诊断日志。
- **误差与负向证据**：fit_local 原生世界坐标最大差 6.1035e-5 px；MOC3 回读最大差 0.004654 px。真实图 X+30 19 像素变化/max13、Y-30 4/max1，其余 3 姿态 0，不能声称逐像素完全一致。缺 mesh、字符串布尔、缺物理参数、journal 缺目标/短点数组/未知参数、混用旧基线与新应用全部非零退出且无输出；不适用通道同样无输出。原便携版 **91 项** JAR/JVM 哈希保持原基线一致。主要证据：out/iteration-audit/p4-source/{build-restored.log,tests-kotlin-full.log,tests-python-full.log,native-base/replay 报告所在各目录,render-diff.json,journal-vs-structure.json,warp-world-diff.json,physics-verification.json,label-audit.json,negative-checks.json}。
- **边界**：P4 核心链路已复验，其他 owner/channel 组合未逐项视觉验收；assetLayers/calibrationLayerIds 非空仍 needs-review。未验证原生桌面 SDK DLL 预览、sampleMotion 的真实 DLL 调用或 Cubism Editor 美术交互，不把 CLI 启动/单测称为桌面 UI 验收。P0/P1/P3 已通过的结论保持；P2/P5/P6 未实施。没有覆盖原模型、修改系统 PATH、同步已安装 Skill、提交或推送；构建 JAR 位于 psd2live/build/libs/psd2live-0.7.1.jar。

## 11. P6 第一用例：透明 ImageGen mouth_open 与严格局部 mask（2026-10-05）

- **改动摘要**：新增 tools/authoring_rig/generated.py 与 import-generated CLI，接入已有 artwork IR/PSD/原生导出链。输入透明 RGBA sprite、画布大小二值灰度 mask（0 保护/255 编辑）、明确 bounds/name/prompt；默认新增顶层，--replace-part 保留稳定 ID/z/appearance 替换素材。未知语义/尺寸/非二值 mask/空图/错误替换/输出复用在写入前拒绝；mask 外可见像素或完整 IR 合成图 RGBA 变化严格拒绝，不通过裁 mask 隐藏错误。--fit 为显式 alpha 裁边/保持比例配准，--sprite-bounds 记录源裁取；保留原始生成 PNG、mask、prompt、前后合成图、哈希/配准报告与 provenance=imagegen。CLI 不调用 API，也不增加绑定字段或依赖。真实 ImageGen 使用 face-reference + original-mouth 做风格参考，最终 prompt 存 generation-prompt.txt；输出已复制到项目。
- **验证数字**：现有 ds 副本移除 mouth 得 23 层，新 mouth_open 导入后 24 层。生成原 PNG 实际 1254×1254，远处 alpha=1 散点使默认 alpha bbox 过大；显式源框 [224,384,1064,944] 排除 105 个 alpha=1 像素并保留原图，主体配准 35×22、放入 [612,330,647,357]，不声称原始生成图逐像素未变。IR 合成图改变 625 像素；原有 23 Part/PSD 层属性和像素未变，重算 PSD 合成图 mask 外 changed_pixels=0/max_diff=0。原生导出经 MOC3 回读；最终 29 画元、0 unknown，新增 mouth_open 及上下唇描边，缺嘴警告消失，保留原来其他 15 条警告。改前/改后各 9 姿态（嘴 0/0.25/0.5/0.75/1 与头 X/Y±30 张嘴），在固定 640×640 头部取景下 mouth 0/0.5/1 相对无嘴基线变化 748/2100/3604 像素。独立嘴部原生关键形测量 alpha>16、focus=[600,320,660,370]：5 档总高度 113/125/155/200/221 render px 单调，闭嘴单条弧线、逐列最大厚约 2.094 原画布像素。当前源码独立唇线机制不同于旧配方，不能把弯曲 bbox 高度误当线厚；测量改用 canvas 原始 PNG，避免 DOM 截图的 CSS 背景污染 alpha。浏览器 pageerror/consoleerror/HTTP错误 0。实际 CLI 对一个落入保护区的生成像素返回 1/error，未创建输出。工具全套 **13/13，110.129 秒**；本次新增测试方法 **3**，覆盖临时真实 PSD 新增/替换、旧像素删除的 mask 外保护、输入拒绝与显式配准。备份 **33** 文件哈希核对，并从备份 export 实际渲染 neutral 成功；原 PSD 哈希未变。
- **证据与边界**：主要证据在 out/iteration-audit/p6-mouth/{final-ir/generation-report.json,workflow-verification.json,mouth-metrics.json,label-audit.json,render-diff.json,negative-cli.json,tests-full.stderr.log,mouth-0-half-1.png,qa-final/review.json}。收尾对照 MAS 98b14c2e 的 tools/variant-requests.py 与 build-sprites.py（只读源码，未执行）：MAS 是全尺寸编辑图/alpha mask/预乘 RGBA 默认容差 8，本次为透明 sprite/灰度 mask/完整合成图零容差，格式不同、不搬其引擎；此前实现先按仓内 IR 契约推进，参考源码在收尾核对，未声称预先完成该项。全尺寸不透明 inpainting 背景分离、自动生成 mask、其他 tongue/teeth/eye_closed/眉毛/blush 尚未实施或视觉验收。美术效果由用户终裁，单个 mouth_open 样本闭环通过不等于完整 P6 完成。未下载模型权重/新环境，未修改原模型或产品 renderer，未同步安装技能/提交/推送；P2/P5 未推进。

## 12. P5 Studio：实际拖点、保存、重建、Cubism 与 Pose QA（2026-10-05）

- **接替范围**：接替前一对话停在 P5 准备阶段的工作。初始仅读取最近进展与当前 Studio 概念图，没有回读旧模型截图；保留前轮未提交工作。参考固定 MAS 98b14c2e 的 EditorCanvas/stale 源码与 Vite 官方 configureServer，按 PLAN 的“CLI 唯一契约”实施。
- **交付**：新增 studio/（React 19.2.4、Vite 8.3.2、TypeScript 5.9.3，npm lock），三栏 Parts/原图叠加 polygon 和 landmarks/Cubism iframe 参数滑块；保存、Rebuild、Run Pose QA、stale/Overlay 状态、联系表与原生警告查看。tools/authoring_rig/studio.py 提供 open/snapshot/save/rebuild/qa；Vite 只做 CLI 白名单转发。127.0.0.1:5173、Host/Origin 检查、不经 shell、资源真实路径白名单、写操作串行与工作区锁、revision 校验。源模型/IR/素材复制到隔离目录；成功构建才更新预览指针，历史构建/QA 文件保留。
- **根因与行为**：原 builder 忽略 polygon，导致拖点仅显示 stale 而 PSD 不变；新增 raster.py 按像素中心 even-odd 裁 alpha，builder 与完整 IR 合成/mask 验收共用。原 PNG 与 bbox/offset 不变，矩形默认轮廓仍零差；旧非矩形 IR 从本次开始实际裁切，schema README 已明示。landmarks 是可保存注记，不驱动绑定。viewer 是单次绘制，因此 slider 使用现有 setParams + snapshot 更新原生图；父界面仅调整 iframe 内的 chrome/画布显示，未改产品 renderer 文件或模型参数补偿。
- **实际浏览器证据**：项目已有 Python Playwright + Edge（Browser 插件技能未列出），1587×992/390×844；front hair polygon 顶点 [484,73]→[629,218]，保存后重新加载保留，stale 正确，真实 UI Rebuild 切换新模型 URL 与 moc3 SHA。固定 640×760/相同 source alpha bbox 镜位，neutral/X+30/X-30/mouth-open 差量 15417/19252/19837/15419 像素，max255；这是故意削去刘海的功能探针，不是美术修复成品。23 非目标 PSD 层 RGBA/name/bbox 未变，24 源 PNG 与原 ds.psd 哈希未变。标签 29→28（目标素材拆分变化），最终 0 unknown，15 原生警告保留。参数滑块像素变化、关键点添加与实际拖动通过；窄屏无横溢，最终 pageerror/consoleerror/资源 HTTP 错误 0。
- **QA 修复与失败状态**：首轮 hair_minus 请求了不存在的 ParamHairSide，明确失败；核对 ds CDI 后改为仅加入实际可用头发参数，其余必需姿态仍严格拒绝缺失/越界。UI 最终产生 16 姿态和固定 spec/hash/实际参数/镜位、contact-sheet/review.json。另用错误 renderer 端口实测 CLI 失败退出1，latestQa 变 null、旧成功 UI 入口消失、成功模型保留；随后通过界面重新运行恢复 QA ok。不会用旧报告伪称本次通过。
- **验证**：TypeScript/Vite 构建通过；npm 初装审计0 vulnerabilities；Python 全套15/15，107.952秒（包含 ds/tml round-trip、P4原生与P6保护），本轮新增长期测试2方法，另1实际浏览器场景脚本；没有新增Kotlin测试或重跑全套。39文件备份归档，备份export真实neutral出图成功。主证据 out/iteration-audit/p5-studio/{workflow-verification.json,backup-hashes.json,backup-qa/review.json,tests-full.stderr.log,failed-gate.stdout.json}；工作区 builds/reviews 保留全部版本，本轮界面截图在当前聊天 visualization 目录。开发命令与导入配置见 studio/README.md。
- **验收边界**：P5 本地编辑闭环通过，dist 需要dev server才能调用CLI；无独立发布包、物理实时播放、绑定/语义编辑或Overlay冲突解决UI。无Overlay的浏览器流程实测；配置Overlay+原始native baseline走P4预检/native-replay拒绝needs-review/broken，Studio各Overlay组合未视觉验收。默认取景/初始轮廓来自像素测量，不需要Agent估坐标，P2未触发。P6其他素材/美术终裁及P4此前未验收组合保持原边界。未同步安装技能、覆盖原模型、改系统环境、提交、推送或发布。

## 13. P4/P5 Overlay：成功应用、拒绝重建与旧模型保留（2026-10-05）

- **范围与修复**：只补验 Studio 附带 Overlay 的真实流程。复现 native-replay 为 ok/applied=true、实际应用 1 项关键形，但 footer 仍显示 needs-review；原因是快照只返回原始 baseline 的保守几何预检。studio.py 将成功报告绑定 IR revision 与归档 Overlay/baseline SHA-256，显示对应的原生结果；重建失败保存 lastBuildAttempt/failed-report，页面刷新 snapshot 后显示失败并关闭 QA，latestBuild/latestQa 原文件保留。失败 context 对应当前 IR 数值和 Overlay 输入；修改输入不能继承旧成功。无输入哈希的旧 Overlay 报告需重建。实际恢复原坐标发现浏览器整数/浮点序列化差异，按完整 IR 值相等识别同一已构建输入；版本冲突校验仍使用原 revision，真实几何变化仍失效。
- **成功应用与渲染**：源为 P5 改图前的 ds IR 副本及同运行时的 native-base；ArtMeshFace 162 顶点，ParamAngleX=30，positionDeltas=[0.02,0]×162、opacity=0.45。真实浏览器点击 Rebuild 后 footer ok，原生报告 applied=true/native_keyform_sets=1，React 滑块 End 将 ParamAngleX=45 传到实际 Cubism。before/after 使用相同 640×640 渲染画布、1280×1280 原画布、5 姿态 spec；X+30 变化 2820 像素/max160，neutral/X-30/Y±30 全为0，确认只改指定关键形。最终标签29层/0 unknown，15条既有原生警告未新增。实际 UI Run Pose QA 生成16姿态，review ok，review stale 清除；pageerror/资源HTTP错误0。
- **失败与恢复**：真实拖 front hair 顶点至 [629,218]、保存，原生完整模型签名变化导致 needs-review/applied=false；fixture Overlay 换成 ArtMeshMissingFixture 则 broken/applied=false。两个状态均跨页面刷新保留，成功模型 URL/moc3 不变、同镜位 X+30 预览 PNG 完全相同，QA 按钮禁用；手动调用 QA API 也返回400。经界面恢复原坐标并恢复归档 Overlay 后，输入值与原始版本相同，原成功模型/16姿态QA继续有效，所有 stale=false；未留下故意损坏的测试工作区。
- **保护与证据**：40个文件完整备份并实际渲染neutral；38个非状态/IR归档文件与工作区逐文件哈希相同，24源Part素材哈希、源IR、原ds.psd均未变，原始baseline值保持一致，Overlay恢复为原字节。证据在 out/iteration-audit/p5-overlay/{ui-success.json,ui-failures.json,render-diff.json,source-preservation.json,backup-render/review.json,workspace/builds/*/failed-report.json}；当前必要截图在本聊天 visualization 目录。新增1个状态转换回归方法，覆盖成功绑定、IR变化、等值数值往返、失败关闭QA与旧指针、Overlay/baseline更换；浏览器场景脚本覆盖实际UI，不扩大测试矩阵。
- **回归结果**：TypeScript/Vite 构建通过；Python 工具全套 **16/16，115.308 秒**，仅跑一次全套，包含 P3 round-trip、P4 原生重放/渲染及 P6 mask 保护。日志为 tests-full.stdout.log/tests-full.stderr.log。另实测自动保存版本冲突：Rebuild 显示 another editor，保留未保存草稿，原生构建未启动；只有实际尝试原生/QA gate 后失败才刷新快照，避免保存失败吞掉草稿，证据 ui-save-conflict.json。工作区恢复为原始 IR 值/成功 Overlay/有效 QA。本轮不改 Kotlin/运行时，不重跑其完整测试矩阵。
- **边界**：本次通过的是 ArtMesh geometry/opacity 的 Studio 应用及拒绝/恢复路径，其他 owner/channel、journal、physics 组合未逐项UI验收；不推进 P6 其他素材、不触发 P2、不发布、不提交推送、不同步安装技能。原有未提交源码/文档/portable工作均保留。

## 14. P6 tongue / upper teeth：真实透明生成、mask 保护与原生 mouth 裁剪（2026-10-05）

- **选择与范围**：P5及Overlay基本路径通过后，按PLAN继续P6素材清单。选取现有mouth_open样本的tongue与upper teeth两层，复用import-generated/build-psd/native-base和原生PRESET绑定；没有修改应用代码、渲染器、Kotlin绑定或依赖。初始只读取必要的face参考和当前mouth sprite；所有输出在新的out/iteration-audit/p6-mouth-internals，原模型/上一轮Studio工作区不写入。
- **生成与落位**：built-in ImageGen分别生成tongue-original.png（1606×979）与teeth-original.png（1981×793），完整prompt在tongue-prompt.txt/teeth-prompt.txt。依据当前mouth IR坐标配准：tongue bounds=[620,342,640,353]、保持比例20×9；upper teeth bounds=[617,334,643,340]、保持比例26×5。主体边界由alpha>16连通域测量再留16px边距，显式sprite-bounds记录在generation-reports.json；排除远处alpha=1像素125/22个，生成原图未改写。不通过裁mask伪造验收，严格检查配准后素材和完整合成图。
- **数据保护**：24→26 Part/PSD层；原有24 Part记录、PNG哈希、PSD层名/bbox/RGBA逐项相同，IR与PSD层清单一致。重算PSD完整合成图仅mask内232像素变化，mask外changedPixels=0/maxDifference=0。38文件备份含完整IR/PNG、PSD、export贴图/模型目录，全部SHA-256复核，备份export真实neutral渲染成功；源P6文件与原ds.psd均未变。
- **原生证据**：同91项JAR/JVM哈希，31画元、0 unknown、15既有警告无新增；标签新鲜，upper teeth为tooth-t/NONE/preset、tongue为tongue/NONE/preset。标签parameter字符串为空符合PRESET格式，绑定由真实MOC3证明：ArtMeshToothT与ArtMeshTongue均唯一maskedBy ArtMeshMouthOpen，MouthOpen=0/0.075/0.15实测opacity=0/0.5/1。诊断页面捕获真实CubismModel，仅隐藏非嘴层或单个新增层做贡献量测，使用原opacity getter，未修改产品renderer或模型文件。嘴1时隐藏tongue/上牙分别改变13329/8046像素（固定640×640、focus=[600,320,660,370]，max66/168），闭嘴时两者贡献均0；嘴0.075/0.15虽opacity升高，mouth收缩仍将其遮住，是预期裁剪行为。
- **渲染验收**：before/after各20姿态，固定640×640/1280×1280与同镜位，嘴7档、头XYZ±30张嘴、身体X±10张嘴、闭眼/闭眼张嘴、可用头发极值、全身neutral。focus=[488,128,744,384]的mouth0/0.075/0.15、闭眼、头发极值、全身neutral均零差；mouth0.25/0.5/0.75/1变化148/539/1022/1193像素（max77/78/159/170）；头X-/X+/Y-/Y+张嘴变化1034/1007/938/1047像素。mouth-comparison.png与head-angle-comparison.png已目视核对；probe浏览器pageerror/consoleerror/资源HTTP错误0，QA报告前后均ok。没有代码修改，故不新增弱单测或重跑未改变的完整测试；本次真实资源/原生/Core场景就是验证依据。
- **产物与复查**：final-ir/authoring-rig.json、mouth-internals.psd、export-final/mouth-internals.model3.json及贴图/moc3为候选产物；generation-reports.json、label-audit.json、native-mouth-metrics.json、render-diff.json、workflow-verification.json、qa-before/qa-after/review.json为证据。步骤脚本import_internals.py/render_pairs.py/probe_native.py/verify_workflow.py保留，新输出目录不得复用。mask与prompt保留。原mouth_open纹理已有亮部，未去除或重画；新增上牙是独立原生层，不声称原纹理已完全分离。美术效果用户终裁。
- **剩余边界**：P6仍有lower teeth、eye_closed_L/R、眉毛变体、blush与完整inpainting背景分离未实施/验收。P2仅在Agent需要视觉估坐标时触发，本次alpha/IR坐标测量未触发。未替换上轮浏览器工作区、安装新环境、下载权重、同步安装技能、提交、推送或发布。

## 15. 工具开发范围校正与 Studio 素材导入（2026-10-05）

- **改动摘要**：依用户明确定位，PLAN 的 P6 完成标准改为软件能力，逐类制作角色素材改为可选回归样本。Studio 新增“导入生成素材”：上传透明 PNG/画布大小二值 mask，选择新增或稳定 ID 替换、整数放置、显式 alpha 适配/源裁切，记录说明。Python 新增 studio-import-preview/commit，复用原 import-generated；预检在工作区旁临时目录执行，成功归档 imports/<id>，活动 IR/模型/QA 保持原样。界面显示局部前后图/全图切换与保护区统计；任何输入改变使确认失效。确认检查当前/预检 revision、候选与素材哈希，替换保留 ID/z/appearance，新素材使用独立归档路径，源文件不覆盖；IR 与状态分别原子写入，状态写入异常时恢复原 IR。提交后旧模型/QA保留并标 stale，Rebuild 后再允许 QA。更新 studio/README，未新增依赖、生成 API、服务或模型下载。
- **验证数字**：新增 2 个真实临时资源集成测试，覆盖新增/替换/源文件保护、mask外拒绝、旧预检版本冲突、候选篡改与非法 ID。焦点测试4/4；Python工具全套仅一次 **18/18，123.752s**，既有Pillow弃用提示保留。TypeScript/Vite打包通过。Browser plugin not available，使用已有 **Playwright1.62.0/Edge**；桌面1587×950/窄屏390×844，实际上传→越界拒绝400→正确预检→修改输入失效→取消→再次预检→确认→刷新→原生Rebuild→16姿态QA通过。原24Part未变，Part24→25；原生标签29→30、unknown0，15既有警告逐条相同。导入前后各16姿态QA；同640×760、原画布1280×1280、由alpha bbox计算的镜位下，mouth0零差，mouth1变化54像素。复核源IR、24PNG及ds.psd共26文件哈希，源合成图/原IR归档不变；预检失败/取消也逐字节核对活动IR/状态/源图/原IR。最终控制台error/warning/pageerror/资源失败0。首次最终断言将Part数量误作原生层数，修正为相对基线+1；没有改产品绕过审计。HMR并发打开时一次收到既有busy409，等待命令结束重开后通过；未因此扩展并发架构。局部对照与全图切换另做实际UI复验。
- **未做项**：新工作区为out/iteration-audit/p6-studio-import/workspace（当前5173使用此隔离目录），旧P5/Overlay/P6素材目录均保留。当前工作区实际只新增tongue；upper teeth仅复用既有PNG检查新局部预览后取消，没有导入。临时浏览器脚本在系统TEMP，必要新截图在本聊天visualization目录；没有重读旧图片。生成API、mask绘制、不透明inpainting背景分离、物理实时播放和打包发布仍无新实现；其他角色素材不再列为必做任务。确认采用版本保护而非多人合并；取消后预检审计档案保留。没有改Kotlin或运行时，不重跑其未改动完整矩阵；没有提交、推送、发布或同步安装技能。此前dirty改动保留。

## 16. Studio 首次打开恢复、版本对应取景与参照图标识（2026-10-05）

- **改动摘要**：修复复审确认的两项缺陷。API错误保留HTTP状态，首次打开仅对busy409做有限重试（总3次，延时1s/2s），耗尽或其他错误提供“重新打开工作区”；未加载时不再显示已保存/已更新，预览状态为未加载工作区。卸载取消打开请求/重试计时器；写操作不自动重试。保留sourceBounds语义，新增artworkBounds按当前显示参照图alpha计算，build.modelBounds对应上次成功构建IR；新报告保存，旧报告只读计算。画布全图改用artworkBounds；模型只在其URL/加载状态变化时用自己的modelBounds取景，新导入但未重建时旧模型镜位不变。界面明确标注原始参照图/上次导入合成图，并提示当前隐藏/裁切效果需查看重建后的Cubism。文档同步，未扩展项目管理、导出、实时合成或打包功能。
- **验证数字**：先加1个真实临时PSD/PNG回归，缺artworkBounds红测；修复后焦点5/5、前端TypeScript/Vite构建通过。Python全套仅一次 **19/19，123.951s**，保留既有Pillow弃用提示。沿用已有Playwright1.62.0/Edge（Browser plugin not available）：模拟连续两次409后第三次成功、三次409耗尽后按钮重开成功、500不自动重试且按钮重开成功；对应总请求3/4/2，无页面异常，未加载期间底部状态未知。另一实际流程在新副本out/iteration-audit/p6-studio-recovery/workspace，导入80×60透明矩形测试标记objects（非角色素材），bounds=[80,80,160,140]；原范围[341,73,956,1196]、新alpha范围[85,73,956,1196]，全图包含标记。导入后旧模型URL/范围/currentView不变且QA关闭，Rebuild后模型范围更新、镜位中心cx520.5/cy634.5，实际Core渲染中标记1229像素；Part25→26、原生标签30→31、unknown0，16姿态QA通过。桌面1587×950/窄屏390×844无横向溢出，最终控制台error/warning、pageerror、资源失败0，223原工作区文件SHA-256核对不变。首次场景断言误要求新增分类后警告字串完全不变，实证17条：原15类警告保留（部分浮点末位变化），另2条为ArtMeshObjects生成模型/MOC3回读默认姿态偏差；调整临时验证的预期后继续剩余QA，不重复已通过导入/重建。
- **未做项**：不消除既有原生位置偏差，测试标记的约4.6px边界扩张警告保留；模型取景按平面IR范围，不新做变形极值自动适配。参照图仍为静态背景，未实现保存后实时合成；项目打开/切换/导出界面、安装器及物理实时播放未在本轮实现。必要新截图在本聊天visualization目录，临时浏览器脚本在系统TEMP，不重读旧图片。验证后5173恢复到原out/iteration-audit/p6-studio-import/workspace（25Part，无测试矩形，原模型/QA保留）。没有改Kotlin/运行时/依赖，没有提交、推送、发布或同步安装技能；原有dirty工作保留。

## 17. 随仓依赖、基础安装与文档归并（2026-10-05）

- **改动摘要**：依用户授权，将完整官方 Cubism Native 5-r.5 ZIP、PSD2Live 原始 portable 运行时、本仓当前源码 JAR、Temurin JDK 21.0.12.1+1、Gradle 9.6.1 纳入根 `dependencies/`。包和分卷使用 SHA-256 清单，48 MiB 分卷避免单文件限制；保留第三方声明与源码来源。安装器默认恢复固定目录，现有安装不覆盖；CLI 默认采用随仓当前 JAR，Studio 仍优先开发构建。setup 默认安装 Python 固定依赖与 Studio npm lockfile、构建前端；新增 dependencies/install.bat 和 build-psd2live.bat。完整 SDK 保留自己的许可，不改为 GPL；SDK ZIP 不含 PSD2Live 专用 renderer 桥接 DLL。根目录只保留 README.md，环境说明统一为 docs/environment.md；第三方说明、项目定位移到 docs，更新入口引用。
- **验证数字**：4 类归档在含空格的隔离目录实际校验并解压，完整基础 setup 成功安装 Python 依赖、npm 24 packages 与构建 Studio；独立进程使用解压 JVM 和随仓 JAR 原生导出成功（15 个原生对象，JAR SHA-256 与清单一致，输出 moc3）。篡改 JAR 在解压前拒绝；bat 实际调用本地 Gradle 9.6.1/JDK 21.0.12.1，重复安装保留目录。定位 Windows PowerShell 5.1 经 cmd/Python 继承 PS7 模块路径而错载 Utility，显式加载运行宿主的内置模块后同路径验证通过，不修改系统环境。上一轮已完成 Python 全套19/19、Kotlin 201 tests/0 failures/1 skipped、实际 Studio 导入/重建/16姿态QA；本次不重复未变测试。未新增自动化测试。
- **未做项**：本次不上传 Python venv、node_modules、Gradle 缓存、模型权重和个人验证输出；基础 Python/npm 及首次源码构建 Maven 下载仍需网络。未测试可选 See-through 推理环境或桌面 Native renderer DLL。当前任务按用户授权继续提交、PR 推送与合并，合并状态以远端 PR/SHA 实时核对。
