# 交接记录

更新于 2026-10-05。本文件保留已完成工作的主要证据和验收边界，当前阶段状态见 [PLAN.md](PLAN.md)。早期记录中的待做项已按后续结果归并，不再当作当前任务。详细调试过程可查[整理前的完整记录](https://github.com/linnnn89/live2d-maker/blob/749a74b/docs/HANDOFF.md)。

应用测试的最近一次记录为第 18 节。`out/iteration-audit/` 下的模型、图片、日志和工作区是本地证据，被 Git 忽略；其他克隆不会自动得到这些文件。需要复验时使用同一输入、参数、镜位与运行时，不能只凭历史数字宣称当前通过。

后续行为变更可追加 `## N. 主题（日期）`，记录改动、实际验证和未覆盖部分。安装命令放在 [environment.md](environment.md)，使用步骤放在组件文档，不在每条记录中重复。

## 1. 技能包初建（2026-09-22）

建立 `skills/live2d-studio/`、路由校验器及操作参考。结构检查与独立发布检查分开；当前发布限制见 PLAN 和 vendor 台账。

## 2. 原版技能对照与校验加固（2026-09-22）

补齐模型修复/参考对齐资料、发际线脚本、外部技能缺失分支和路由用例。3 个回归测试通过，结构检查 0 失败、0 警告；错误内容变异被拦截。根许可证现已补齐，不再保留“LICENSE 缺失”的旧待办。

## 3. 技能合并安装与旧技能移除（2026-09-22）

将两个旧领域技能迁入本包；当时核对迁移脚本、来源树与安装副本哈希。来源哈希和当前许可状态集中在 [vendor-manifest.md](../skills/live2d-studio/references/vendor-manifest.md)。历史安装操作不代表新的会话已加载该版本。

## 4. P1 Pose QA Pack 落地（2026-10-05）

新增 `qa.py` 和默认 spec。该 fixture 实际产出 14 张全身图、42 张眼/嘴/发局部图、4 张联系表及 JSON 报告。失败报告、参数和镜位检查在第 7 节补强；Studio 的 16 姿态使用另一份 spec。

## 5. P3 authoring-rig.json schema v0 落地（2026-10-05）

新增 IR schema、PSD 导入、校验与重建。ds 24 层、tml 22 层共 46 层的名称、顺序、位置、bbox 与 RGBA 零差；篡改 PNG 哈希和非法绑定字段被拒绝。PNG 清单补验见第 8 节，当前裁切行为见 IR 文档。

## 6. P4 stale 与 Overlay 兼容性检查落地（2026-10-05）

建立失效传播和 `ok / needs-review / broken` 状态。多边形、semantic、视图元数据与删除目标的基本用例通过。此时仅是 Python 预检，不能证明完整原生拓扑兼容；原生验证在第 8—10 节完成。

## 7. P0 起逐阶段独立复核与必要修复（2026-10-05）

修复 viewer 默认 URL 和取景单位、QA 参数/空图/失败报告、严格 schema/PNG 检查、PSD ID/XMP 保留与 Overlay 目标预检。ds/tml 46 层和重新计算的合成图零差。真实 Edge 默认入口无 404，0.93 与 1:1 取景缩放通过。

Core 原始字节与 LF 规范化哈希的差异已核实，校验方式见 [Web runtime 来源说明](../live2d-viewer/public/vendor/cubism/README.md)。QA 最终产生 14 张全身、42 张局部图；13 个非中立姿态均有变化。证据：`out/iteration-audit/p1-final/`。

## 8. 继续复核：manifest 导入与受限原生 Overlay 重放（2026-10-05）

PNG 清单 → IR → PSD 的 ds 24 层属性、RGBA 和合成图零差，显式 ID 在改名/重排后稳定。旧缺文件清单明确失败，无输出。

原生基线包含完整模型和运行时签名：Face 平移 1 px 后仍有 162 顶点，但签名改变，重放被拒绝。640×640 固定 spec 下，X+30 的 opacity=0.45 / positionDeltas x=0.02 探针分别改变 2781 / 2573 像素；neutral、X-30、Y±30 均零差。修复了忽略不可变 setKeyform 返回值导致编辑无效的问题。29 ArtMesh、0 unknown，既有 15 条警告未新增。

证据：`out/iteration-audit/p4-native/`。当前桥接能力已扩展，不再沿用本阶段“只支持 ArtMesh set”的限制。

## 9. P4 继续：parameter、copy/delete 与 Warp keyform（2026-10-05）

接入参数新增/修改/删除、关键形 copy/delete、Warp/Rotation 几何与通道校验。持久化删除改用原生编辑列表，避免提前删除 copy 源 set。

640×640 探针：新参数 0/0.5/1 时变化 0/2709/2752 像素；set(+30)→copy(-30)→delete(+30) 最终只在 -30 改变 2753 像素；Warp +30 改变 2313 像素，neutral/-30 零差。删除 ParamBreath 后真实参数列表中 ID 消失。证据：`out/iteration-audit/p4-remaining/`。

## 10. 授权后续验：源码构建与 P4 journal / structure / fit_local / physics（2026-10-05）

配置项目内 JDK/Gradle，恢复被忽略规则排除的 `CubismSdkPreviewSession.kt`，适配 sampleMotion。接入 warps、physics、structure 和有序 authoringJournal；逐步检查创建后引用、目标、参数与通道。ArtMesh flipX 等原生不适用通道明确拒绝。

5 组 640×640 spec 共 25 姿态通过。Journal 相对同结构基线只在 X-30 改变 2744 像素，max95。实际 CubismPhysics 评估 180 帧/60 FPS，ParamHairFront 从 0 到 0.34906584，图像改变 8460 像素，max190。

`fit_local` 世界坐标最大差 0.000061035 px，MOC3 回读最大差 0.004654 px；X+30 有 19 像素变化/max13，Y-30 有 4/max1，不能称为逐像素不变。非法 mesh、类型、物理参数、Journal 引用及混用运行时均失败且无输出。证据：`out/iteration-audit/p4-source/`。

sampleMotion 的真实 DLL 调用、全部 owner/channel 组合及 Cubism Editor 美术交互未验收。原生加载/渲染缺口随后在第 18 节补齐。

## 11. P6 第一用例：透明 ImageGen mouth_open 与严格局部 mask（2026-10-05）

新增 `import-generated`，检查透明 PNG、二值 mask、放置、替换和完整合成图；原图、mask、prompt 与配准报告保留。

ds 隔离样本 23→24 层，原 23 层属性/像素不变，mask 外 changedPixels=0、maxDifference=0。固定 640×640 头部取景，嘴 0/0.5/1 相对缺嘴基线改变 748/2100/3604 像素；原生关键形实际生效。落入保护区的生成像素被拒绝，无输出。证据：`out/iteration-audit/p6-mouth/`。

这是素材导入测试，不代表完成角色美术或实现不透明 inpainting 的背景分离。

## 12. P5 Studio：实际拖点、保存、重建、Cubism 与 Pose QA（2026-10-05）

新增三栏 Studio 和工作区 CLI。polygon 按像素中心裁 alpha，landmarks 为可保存注记；保存检查 revision，重建和 QA 保留历史产物。浏览器拖点、刷新、原生重建、参数滑块和 16 姿态 QA 通过。

固定 640×760、1280×1280 原画布，对刘海的裁切探针在 neutral/X+30/X-30/mouth-open 改变 15417/19252/19837/15419 像素；23 非目标层、24 源 PNG 与源 PSD 不变。桌面和 390 px 窄屏无横溢，最终控制台、页面和资源错误为 0。证据：`out/iteration-audit/p5-studio/`。该探针不是美术修复成品。

## 13. P4/P5 Overlay：成功应用、拒绝重建与旧模型保留（2026-10-05）

成功报告绑定 IR、Overlay 和 baseline 哈希；失败报告持久保存并关闭 QA，旧成功模型保留。等值整数/浮点写法不再误判产物失效。

实际 ArtMeshFace X+30 geometry/opacity Overlay 在 640×640 固定取景下改变 2820 像素/max160，其他四个姿态零差，16 姿态 QA 通过。修改源轮廓时为 needs-review，缺目标时为 broken；两者刷新后保留，旧模型 URL、moc3 和同姿态图不变。恢复原输入后原成功产物有效。过期保存也会保留草稿，不启动构建。

证据：`out/iteration-audit/p5-overlay/`。其他 owner/channel、Journal 和 physics 组合未逐项 Studio 验收。

## 14. P6 tongue / upper teeth：真实透明生成、mask 保护与原生 mouth 裁剪（2026-10-05）

隔离样本新增 tongue/upper teeth，24→26 层；原 24 层记录、PNG 和 PSD 属性/像素不变，mask 外零差。真实 MOC3 中两层均由 ArtMeshMouthOpen 裁剪；嘴参数 0/0.075/0.15 的 opacity 为 0/0.5/1。

改前/改后各 20 姿态。固定 640×640 嘴部取景，张嘴时 tongue/upper teeth 的独立贡献为 13329/8046 像素，闭嘴贡献均为 0。证据：`out/iteration-audit/p6-mouth-internals/`。mouth_open、tongue、upper teeth 后来确定为回归样本，不再要求逐类制作其他角色素材。

## 15. 工具开发范围校正与 Studio 素材导入（2026-10-05）

完成 Studio 上传、预检、前后对照、保护区统计、取消和确认入口。输入改变使预检失效；确认检查 revision 和候选/素材哈希；成功后旧模型/QA 保留且待更新。

实际上传→拒绝越界→预检→输入失效→取消→确认→刷新→重建→16姿态QA通过。mask 保护、版本冲突和候选篡改有真实资源测试；26 源文件哈希一致。固定 640×760 取景，闭嘴零差、张嘴变化54像素。证据：`out/iteration-audit/p6-studio-import/`。没有生成 API、mask 绘制或自动背景分离。

## 16. Studio 首次打开恢复、版本对应取景与参照图标识（2026-10-05）

busy409 最多尝试三次，耗尽或其他错误提供手动重开；未加载时不显示“已保存”。分别保存 sourceBounds、artworkBounds 与成功模型的 modelBounds，未重建的导入不改变旧模型镜位。参照图明确标为静态背景。

实际验证两次409后成功、重试耗尽后手动成功、500不自动重试；原范围外测试标记导入→重建→16姿态QA通过。223 个原工作区文件哈希不变，390 px 窄屏无横溢。标记有1229个可见渲染像素，同时保留两条新增默认姿态偏差警告，没有隐藏警告。证据：`out/iteration-audit/p6-studio-recovery/`。

## 17. 随仓依赖、基础安装与文档归并（2026-10-05）

完整 Native SDK、PSD2Live portable/应用 JAR、JDK 和 Gradle 随仓保存；安装器校验 SHA-256，解压到固定目录。根环境说明统一到 `docs/environment.md`。

四类归档在带空格的隔离目录解压通过；基础 setup、Python/npm 安装、Studio 构建、15 个原生对象的 moc3 导出和本地 Gradle/JDK 调用通过。篡改应用 JAR 在解压前拒绝。Windows PowerShell 显式加载当前宿主 Utility 模块，解决继承 PS7 模块路径后的哈希命令问题。

[PR #2](https://github.com/linnnn89/live2d-maker/pull/2) 已合并，提交 `e060c72a`。SDK ZIP 本身不包含桥接 DLL，但第 18 节已单独补齐。Python/npm 与首次 Maven 解析仍需网络，可选 See-through 推理未验证。

## 18. 原生预览 DLL 与自动接入（2026-10-05）

从上游历史版本取回未修改的 Windows x64 DLL，连同22个官方着色器与许可直接入仓。资源 JAR 接入 portable classpath、Python CLI 和源码构建。安装器首次修改配置前备份，重复执行保持一致，损坏 DLL 在安装前拒绝。

实际原生会话加载生成模型，320×320 渲染 +20° / −20° 并正确读回参数；原 portable 启动器完整 classpath 也成功加载/渲染。CLI 随仓应用通过 JNA 初始化 GPU。Python 19/19；Kotlin 202 项、0 失败、0 错误、1 跳过（未配置真实 nunif 模型）。全部26个运行时文件的远端内容与清单一致。

[PR #3](https://github.com/linnnn89/live2d-maker/pull/3) 已合并，提交 `6fd0e7bd`。DLL 来源与源码缺失限制见 [THIRD_PARTY.md](THIRD_PARTY.md)。未做桌面窗口逐项点击、sampleMotion 真实 DLL 调用或可复现 DLL 编译。

## 19. README 重写（2026-10-05）

根 README 改为功能、安装、使用、目录与许可，去掉技能内部层级和重复介绍。只修改 README；核对16处本地链接与启动入口，确认远端内容一致，提交 `749a74b` 已推送。应用代码和运行时未变，未重新执行应用测试。

## 20. Studio R1a：预览适配器和模型来源（2026-10-06）

提取 `ViewerAdapter` 与 `useModelPreview`，统一加载/失败状态、取景、参数和重置。参数更新按动画帧合并调用 `render()`，PNG 编码仅用于明确截图；替换 iframe 时清理加载轮询和待绘制帧。viewer 新增可选 `embed=1`，移除 Studio 对 iframe 的样式注入。界面标明当前已保存模型，或上次模型对应的未保存/待重建修改。

Linux Node 24.19.0：`npm run build` 通过，`npm test` 7/7。用例覆盖 ready/取景、实际参数限值、合并绘制、显式截图、加载等待、错误/超时、旧模型释放。

Chromium 151.0.7922.34 / Playwright：1440×1000 与 390×844，真实加载仓库 yelan moc3 和 Cubism Web；滑块实际改变渲染像素，重置恢复参数，三种模型来源提示、iframe 替换及刷新恢复通过。预览交互未编码 PNG，页面无相关 console error/warning、无框架错误覆盖层；窄屏无横向溢出。Browser 插件不可用，使用独立 Playwright。

浏览器检查的 open/save/rebuild 使用固定 API 响应，未调用 Python/JVM；它证明前端行为，不代表原生构建完成。临时脚本、截图和结果位于 `/tmp/live2d-r1a-browser-check.py`、`/tmp/live2d-r1a-evidence/`，不提交 Git。

本轮保留 Windows 专属工作：portable/JVM 桥接、原生配置/导出/Overlay、DLL/OpenGL、桌面项目/界面及安装包。计划下一步为 R1b 的纯前端草稿命令与撤销/重做，原生接入待用户 PC 迭代。

## 21. Studio R1b：人 / Agent 共享草稿命令（2026-10-06）

用户确认将 R1b 调整为对 LLM Agent 可调用的命令与草稿事务。本轮提取 `studio/src/editor/{contracts,commands,DraftSession,DraftController}.ts`：按图层 ID 修改 visibility/opacity/polygon/landmark、严格命令字段检查、整批原子应用、draftId/revision 乐观并发、差异、撤销/重做及保存锁。UI 通过同一层编辑，拖拽提交一个历史步骤，取消恢复原状态。

新增顶部撤销/重做/放弃和画布差异面板。`window.studioDraft.execute` 提供 inspect/diff/apply/undo/redo/discard/commit；commit 复用现有 save API，成功更新界面和保存基线，失败保留草稿。导入、构建和 QA 操作期间拒绝并发命令写入。历史仅限标签页当前草稿，保存或导入新版本清空。

`studio/scripts/draft-cli.mjs` 从 stdin JSON 使用同一命令引擎输出候选 IR 与差异，不接触素材、保存服务或原生工具。它服务于没有浏览器连接的 Agent，但不是现有 Kotlin MCP 的新增工具，也不自动保存。详细 schema 和例子见 [STUDIO_DRAFT_COMMANDS.md](STUDIO_DRAFT_COMMANDS.md)。

验证：Node 24.19.0 下 `npm run build` 和 `npm test` 通过，共 19 项（12 项草稿/CLI + 7 项 viewer）。草稿回归覆盖失败批次回滚、字段保留、版本冲突、手势合并/取消、保存并发冻结/失败保留/新基线、相同基线刷新和离线 JSON。

Chromium 151.0.7922.34（Linux，1440×1000 / 390×844）使用固定工作区 API 响应及仓库 yelan 模型验证 UI/Agent 共用历史、差异、无效批次、过期版本、真实拖拽及取消、模拟失败/成功保存、模型来源与替换、参数实际像素变化、无预览 PNG 编码、响应式布局和重新加载。除刻意模拟失败保存产生的 HTTP 400 外，无控制台错误/警告。本轮浏览器检查未执行 Python/JVM 原生流程。

本次只改 Studio TypeScript/Node/CSS、测试与文档。Python、Kotlin、portable JVM、DLL/OpenGL、Overlay 和 Windows 安装路径均未修改。R1a PR #5 尚未合并，R1b PR 以其分支为基线，需按顺序合并。实时图层合成、草稿跨刷新持久化及原生 Agent 工作区联动留待后续切片/PC 验证。


## 22. Studio R1c：即时合成与版本化图像读取（2026-10-06）

R1a #5、R1b #6 已按用户指令合并到 main（`5006207`）。本轮在其上实施 R1c：`studio/src/artwork/` 分离像素领域层、PNG 编解码、素材缓存、Worker 及 React 画布。新增纯 JavaScript `fast-png@8.0.0`（含 fflate/iobuffer），像素解码不通过 Canvas，避免未预乘颜色被舍入；Worker 内执行像素中心 even-odd 裁切、透明度与 Pillow 兼容普通 alpha 合成。

画布切换当前草稿、已保存美术和原始参照；保存更新美术对照基线。普通编辑按帧提交显示任务，排队的旧显示任务可被替换，日常重绘不编码 PNG。显式 `window.studioDraft.capture` 与 UI 导出共用像素渲染器，输出完整画布 PNG、alpha bounds、草稿/基线版本，渲染期间编辑或保存会拒绝旧结果。详情见 [STUDIO_DRAFT_COMMANDS.md](STUDIO_DRAFT_COMMANDS.md)。

验证：`npm run build` 与 `npm test` 通过，37 项（新增 18 项图片/渲染/捕获回归）。`tests/fixtures/generate-artwork-fixtures.py` 提取现有 `composite_ir` 函数，结合原 `raster.py` 与 Pillow 12.3.0 生成固定对照，覆盖分数边界、自交、层序、负位置、透明度、隐藏以及 RGB/RGBA/灰度/调色板解码；日常 Node 测试不需要 Python。

Browser plugin 不可用，使用已有 Python Playwright / Chromium 151，在 1440×1000 与 390×844 验证实际画面、隐藏/撤销/重做、裁切透明度导出与 Python 逐字节一致、对照、PNG 下载、拖动/取消、版本冲突及渲染并发、失败/成功保存、素材哈希错误与重新加载恢复、viewer 参数和布局。工作区 API 为固定响应，浏览器没有调用 Python/JVM；Python 仅作为图片对照 oracle。除刻意模拟失败保存的 HTTP 400 外，无控制台错误或警告。截图和临时脚本保留在执行环境 /tmp，未加入仓库。

边界：仅 2D 平面普通合成；16 位 PNG 暂不支持，单素材/画布最多 16777216 像素。解码缓存与当前裁切层缓存各有 128 MiB 限额，但尚不是整个 Worker 的总峰值内存预算；全图重合成和加载并发仍有优化空间。用户追加要求的工程审阅已写入 [ENGINEERING_REVIEW_R1.md](ENGINEERING_REVIEW_R1.md)，优先处理草稿全量复制、二次复杂度差异查询和历史增长，再扩展恢复与原生联动。

本轮未修改 Python 生产代码、Kotlin、portable JVM、DLL/OpenGL、Overlay 或 Windows 进程路径；这些集成继续留待用户 PC 验证。新增 Python 文件仅生成图片测试样本。

## 23. Studio E1a：索引、内部 token 和快照缓存（2026-10-07）

先在 Windows 验收 R1c：Node 24.19.0 构建和 37 项回归通过；Edge 154.0.4258.53 使用真实 Python API 完成 ds 24 层工作区打开、隐藏/撤销/重做、Agent 裁切/透明度、保存/刷新与 PNG 下载，完整 RGBA 对照现有 Python 合成器一致。PR #7 已合并，合并提交 `d1fdf003566c81ac1d0b03be53053891a9a1fbff`。

随后按 [工程审阅](ENGINEERING_REVIEW_R1.md) 完成 E1a。commands/session 以 ID Map 保持固定图层顺序，diff 改为线性匹配；内部 token/phase/dirty 读取不复制完整 IR，差异按 IR 身份缓存。每个版本只生成一次冻结的订阅快照；相同基线和等值编辑不发布新快照。公开 inspect/execute 返回隔离副本，Agent 修改响应不会影响当前草稿或后续历史。版本冲突、批次原子性、保存失败保留、手势取消和新基线规则保持兼容。

验证：Windows `npm run build` 与 `npm test` 通过，39 项；只新增 2 项测试，覆盖快照隔离/稳定性/阶段变化，以及 1000 图层、特殊 ID、非 z 排序、失败批次和历史往返。实际 Edge/Python 流程再验通过，桌面/窄屏截图、导出 PNG、测量脚本和 JSON 保存在 `out/e1a-evidence/`（忽略，不推送）。本机虚拟环境补齐 requirements 已声明的 `jsonschema==4.26.0` 及依赖，无全局安装。

同一 Windows/Node 环境每组 100 个样本：100/500/1000 图层编辑中位耗时分别由 2.167/12.009/27.774 ms 降至 1.570/7.910/15.620 ms；1000 图层 P95 由 32.220 ms 降至 20.300 ms。样本为合成小 IR，不含渲染或 UI 订阅成本；完整方法、尾部耗时和范围见工程审阅。

边界：E1a 仍复制整份候选 IR，撤销历史仍未设预算；E1b/E2 和其余迭代未实施。未修改或重新验收原生建模、Overlay、DLL、安装器或模型 QA。本轮验证的真实流程覆盖美术编辑/保存/图像导出。

## 24. Studio E1b：受影响图层历史与预算（2026-10-07）

按工程规划接续已合并 E1a（`main@fc1858c`）。内部命令批次只复制目标图层/字段，在私有候选上验证后原子发布；历史保留目标图层前后状态，撤销/重做用同一记录，不再保存每步完整 IR。公开响应和独立命令函数仍完整隔离，源素材、稳定 ID、层序及原生契约不变。

默认撤销+重做合计 100 步，历史 JSON UTF-8 负载上限 16 MiB，超额淘汰最早步骤并提供 UI/Agent 统计。单步超限保留当前修改、清空之前历史并不可撤销，避免跨过未记录步骤；仍可放弃到保存基线。一次拖拽仅一个预算步骤；取消或净零变更不淘汰历史，保持重做。保存失败保留历史；放弃或新基线重置统计。字节定义是每步受影响图层 before/after JSON 大小，保守计入共享字段，不是整个 JS 堆上限。

Windows Node 24.19.0：构建和 42 项回归通过，新增 3 项针对批次隔离/精确恢复、数量与字节预算/屏障，以及长拖拽/重做边界。Edge 154.0.4258.53 使用实际 Studio/Python API 打开 ds 24 层，完成 105 次编辑、100 次撤销/重做、实际拖点和 UI 历史限制提示；保存/刷新和 PNG 输出与 Python 合成器逐字节一致。桌面 1440×1000、窄屏 390×844 无溢出或页面/控制台错误。

同样本编辑中位耗时：100/500/1000 图层由 1.565/8.089/15.986 ms 降至 0.871/4.523/8.950 ms。1000 图层/100 次编辑、同样 100 个历史步骤，历史序列化负载由 25,163,860 B 降至 59,749 B；150 次编辑时新实现只保留 100 步。测量不含 UI 订阅或渲染。方法、P95 和范围见工程审阅；脚本、JSON、实际截图和 PNG 保存在忽略目录 `out/e1b-evidence/`。

本轮只改 Studio 命令/历史、状态统计、提示及文档，不改 Python/Kotlin、模型重建/Overlay/DLL/安装器。渲染失效与总内存预算属于 E2；跨刷新恢复和剩余架构迭代尚未实施。

## 25. Studio E2：像素身份、调度与共享预算（2026-10-07）

接续 E1b（`main@3298d53`），像素缓存身份排除注记、选中和编辑锁，保留画布/层序/素材/几何/透明度依赖；UI 不再因这些非像素状态请求渲染。最多缓存两幅完整成图，保存/草稿共用像素结果；capture 仍在异步前后核对草稿 token。素材逐个加载解码，裁切和叠加按行协作让出，取消旧显示任务，显式截图保持顺序。

384 MiB 管线预算由 48 MiB 有界请求预留和 336 MiB 共享 LRU 池组成，后者计入素材/裁切/完整帧/活动缓冲/编解码保守工作量及待确认结果。活动缓存固定，先淘汰闲置缓存，分配不足返回错误；这不是全浏览器/GPU/RSS 上限，已完成且由调用者持有的截图在边界之外。IR JSON 2 MiB、输入 PNG 16 MiB，最多一个执行任务、一个排队显示和四个显式截图。预算/队列超限不会更改草稿或返回缩小图。

将已存在的 MIT `fflate@0.8.3` 声明为直接依赖，版本和传递依赖未变；解码前用有界增量解压校验 IDAT 扫描线长度，检查尺寸并去除非像素辅助块，避免像素解码器先无界解压后才检验尺寸。同步 codec 只在调用前后检查取消，逐像素工作使用 Worker 内定时任务让出。

Windows Node 24.19.0：构建及 45 项回归通过，仅新增三项测试覆盖像素缓存/取消、共享预算/PNG 解压长度、显示替换/截图队列。Edge 154.0.4258.53 使用实际 Python ds 24 层工作区验证注记无渲染请求、旧显示 ABORTED、四截图成功/第五 QUEUE_FULL、4096² 编码 MEMORY_BUDGET 后恢复；记录共享池峰值 169,158,976 B（上限 352,321,536 B）。完整 PNG 与 Python RGBA 一致；105 步编辑/100 撤销重做、实际拖点、保存重载/下载、桌面/窄屏无溢出且无页面/控制台错误。证据保存在忽略目录 `out/e2-evidence/`。

本切片未修改 Python/Kotlin、原生重建/Overlay/DLL 或安装器，未宣称整个计划完成。接续 E3 协议统一，再按规划推进恢复、用例和原生/项目交付。
