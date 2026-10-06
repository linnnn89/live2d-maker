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

## 26. Studio E3：共享协议与结构化错误（2026-10-07）

接续已合并 E2 PR #10（`main@255f139`），新增 `schemas/studio/protocol.schema.json`；生成 TypeScript DTO 与运行时 schema，build 检查生成结果。命令、捕获、snapshot、保存/导入和错误在浏览器/Node/离线 CLI 使用共享解析器，Python 使用同一 schema 的既有 jsonschema。封装版本 1 与持久化 IR 0.1.0 独立，完整 IR/素材/编辑范围检查继续执行。

错误携带 code/stage/message/retryable 及可选 partId/field；HTTP/Python 保留旧 error 字符串并增加 detail，UI 按 code 判断冲突/忙，不依赖英文文案。旧字符串适配只留协议模块。默认 v1 完整状态保持；inspect/diff 可选 summary 或 parts/partIds，轻量 token 仍能命令编辑，返回对象与草稿隔离。保存失败保留草稿/历史，不自动重试写操作。保存/导入旧无 envelope 请求仍接受，未知显式版本拒绝。

项目内新增固定版本 MIT AJV 8.20.0 和开发用 json-schema-to-typescript 16.0.0，未全局安装或改变运行时。Windows Node 24.19.0 构建/48 项回归通过（只新增三项，含实际 Python CLI），既有 Python Studio 5 项通过。真实 Edge 154 / Python 工作区验证成功保存/下载与 PNG oracle、轻量读取、外部 CLI 基线改变后 Agent/UI BASE_CONFLICT 并保留草稿/撤销/磁盘、忙状态和非法字段、导入预检不写活动 IR/确认后 25 层/完整 PNG 对照一致、重载与窄屏布局。无页面异常，仅两个预期的主动保存冲突 HTTP 409 日志；证据在忽略目录 `out/e3-evidence/`。

CLI 响应先转为 JSON wire value 再校验，兼容 Pillow 返回的 tuple bounds；回归覆盖实际 snapshot 命令。没有修改 Kotlin、原生配置/Overlay/DLL/安装器，桥接 runner/resource 拆分留 E5。Vite 8.3.2 构建/启动通过，但其未来 native loader 扩展名规则仍有提示；未升级或切换 loader。接续 E4 恢复，不将本切片称为整个规划完成。

## 27. Studio E4：稳定身份与增量草稿恢复（2026-10-07）

接续 E3 PR #11（`main@fe7b161`），Python 的 studio-state.json 持久化 workspaceId；旧工作区首次快照在排他锁内补齐，源、IR、revision、构建/QA 不因迁移变化。共享 schema 增加 Snapshot.workspaceId 和 DraftCheckpoint，生成 DTO 同步。

原生 IndexedDB 保存字段 before/after 增量检查点，200 ms 合并 idle 编辑、写入串行，只有事务完成才显示已备份。单记录 8 MiB、单工作区 20 份/32 MiB；超限不淘汰旧草稿。各标签页独立 draftId，保存/放弃/撤销到无修改只清理本页成功写入的记录。广播及聚焦刷新只更新备份列表，不同步活动编辑 token。

打开时先显示磁盘 IR，用户明确选择恢复/重放；逐字段检查 before/after，兼容修改原子应用、一次撤销，冲突/缺失图层及旧记录保留并可导出。恢复后仍须保存 IR，旧撤销栈不恢复。删除旧记录需确认，并在事务内核对 revision/updatedAt，过期删除被拒绝。配额/权限/记录格式错误可见，当前编辑不清空，可重试备份。

Windows Node 24.19.0 构建、51 项回归通过（新增三项：恢复/冲突、写入合并/失败、真实旧工作区迁移），既有 Python Studio 5 项通过。实际 Edge 154 使用真实 Python 24 层工作区和持久浏览器配置，关闭重启后恢复/一次撤销、保存清理本页、确认删除旧记录、外部 CLI 修改后仅重放兼容 landmark/保留 opacity 冲突、JSON 导出保留原记录、三个独立标签页、过期删除 RECOVERY_CONFLICT、注入配额错误后内存/旧备份保持与重试成功均通过。恢复不写活动 IR，完整 PNG 对照 Python 逐像素一致；桌面/窄屏无溢出或页面/控制台错误。证据与浏览器配置在忽略目录 `out/e4-evidence/`。

浏览器清理/隐私模式可能删除备份；最近 200 ms、未完成手势、强制进程中断不保证恢复，pagehide 仅尽力提交。重要修改仍需保存/导出。未修改 Kotlin、原生建模/Overlay/DLL/安装器，接续 E5/E6 和剩余 R2–R8。

## 28. Studio E5：用例与桥接提取（2026-10-07）

基于 E4 PR #12，main@174547b。页面提取 ArtworkWorkspace、LayerList、PointInspector、DraftDiff；useWorkspaceActions 统一打开/重试、保存/重建/QA、导入与历史操作。WorkspaceProvider 持有唯一草稿控制器/像素客户端和 Agent bridge，组件直接读取工作区用例；画布手势/来源/聚焦/坐标编辑独立在 useArtworkEditing。切换图层或安装新草稿基线后清除旧点选择，避免编辑失效句柄。页面壳保留预览与状态布局，不声称已实现细粒度 React 订阅或减少所有重渲染。

Node 桥接拆成 transport、runner、resources；Vite 只组合配置/插件。runner 注入启动器并保留命令白名单、shell:false、windowsHide、固定工作区和 UTF-8；transport 注入 runner，保留方法/来源/schema/body 限制及排他门禁；资源仍核对 realpath 与类型白名单。保持同步请求协议，snapshot 在原生任务中仍返回 BACKEND_BUSY；本切片未创建后台队列/常驻服务或修改取消语义。

新增三个契约测试覆盖 HTTP 校验/并发与失败释放、真实文件和 junction 越界/HEAD、CLI 参数/响应失败及实际 Windows Python snapshot。构建与 54 项回归通过。真实 Edge 154 验证图层搜索/显示/撤销重做/放弃、真实拖点一次历史、坐标编辑/差异/显示来源锁、保存和 PNG 与 Python 逐像素一致、导入期间 Agent BUSY/取消解锁、预检不写 IR/确认增加至 25 层。实际 Kotlin 重建成功，导出审计 30 层、保留 17 条既有原生偏差等警告；Cubism 就绪后键盘调整 ParamAngleX，实际 Pose QA 16 姿态成功并展示结果。桌面/窄屏无溢出，结束验收无页面/控制台错误；证据在 out/e5-evidence/。首次参数验收脚本填充值不符合 range 步长，改用实际键盘操作，仅续验未完成流程。

未加依赖或改生产 Python/Kotlin。Vite 8.3.2 现有 loader 构建/启动正常，未来 native loader 扩展名提示仍保留；后续切换 loader 时按版本处理。E6/R2–R8 继续推进。

## 29. E6a：原生配置门面（2026-10-07）

基于 E5 PR #13，main@6945ee3。AuthoringPipelineFacade 是无 UI 依赖的 inspect/buildPreview/run 入口；AuthoringBuildConfig JSON DTO 版本 1 明确 atlasSize、meshSpacing、generatePhysics、exportCmo3、exportMotions。拒绝未知字段/版本和非正尺寸；当前 Python 仍传空配置采用固定预览默认值，不声称已有产品构建设置界面。Kotlin 通过命名参数构造 PipelineConfig，Python config_for 不再遍历 declared fields 或按字段顺序 copy。显式 physics Overlay 保持启用指定物理/禁用默认 hair/eye 规则。

随仓应用 JAR 和 dependencies/manifest.json 同步更新，安装器 DryRun 哈希校验通过。自选旧应用 JAR 缺少门面时，在启动 JVM 前明确拒绝并提示重建/使用当前包；旧 Overlay baseline 因 runtime hash 不同仍需重新核对，不自动放宽兼容判定。模型 getter/Overlay 转换的既有反射仍存在，本轮只移除配置顺序耦合。

本机缓存 JDK 21/Gradle 9.6.1 源码构建成功；离线首次测试缺固定测试依赖，随后正常解析仓库已声明依赖，未安装全局工具或新运行时。新增三个 Kotlin 配置/错误/物理规则契约测试。Kotlin 全套 205 项、0 失败/错误、1 跳过；额外启用 CubismNativeRuntimeTest，实际 DLL 在 AMD GPU 上加载并渲染 ±20 参数成功。

使用同一 ds PSD，对照旧包/旧配置与新门面：完整模型签名、66 个对象、warnings 一致，所有模型/纹理/分类导出文件逐字节一致。实际 Edge Cubism 中 neutral/X+30 像素一致，geometry/channels/physics Overlay 重放成功，指定 X+30 opacity 改动产生 3571 个变化像素；physics3 仅含一条指定规则，不声称已验收实时物理播放。Studio 实际 Rebuild/模型就绪通过。证据在 out/e6-evidence/；Python 全套 19 项通过，包含实际默认随仓 JAR 的 native-base/replay、拒绝非法 Overlay、Cubism 图像和临时 PSD 往返。

E6 仍有注记与构建签名分层、WorkspaceService 提取等内容，R2 的 ID/语义映射和后续产品迭代未完成。

## 30. E6b：注记与模型输入签名（2026-10-07）

基于 E6a PR #14，main@41df9b5。签名版本 2 将 landmark 注记与像素/绑定输入分开；PSD 签名保留画布、源/素材身份、图层名称/顺序、轮廓及显示设置，绑定签名仍保守包含 semantic。整数与等值浮点统一，避免浏览器 JSON 将 484.0 转为 484 时误判。完整 IR revision 仍随注记变化，保存并发、草稿恢复 token 和旧导入授权不放宽。

新增构建/失败报告记录 signatureVersion/modelInputSignature，QA 记录同一签名和 buildId。旧报告只在保存的 build IR 与原 revision 能核对时推导等价，不改写旧报告或原生 baseline；未知版本/不匹配签名关闭模型/QA 门禁。注记保存后保留成功模型及 QA 原始 revision，不伪造为新的完整 IR revision。Overlay 仍须匹配输入哈希，失败记录仍保留门禁；旧失败缺 captured IR 时，原有精确 revision 判定也保留。

新增三个 Python 回归覆盖签名/数字、旧与新构建/QA 记录、Overlay 成功/失败及旧失败缺 IR。全套 22 项通过；最后保留精确失败判定的兼容补充后，三个新回归和既有 Overlay gate 回归再次通过。实际 Edge/Python/Kotlin：旧成功构建运行 16 姿态 QA，只保存注记时 PSD/模型/QA 仍有效且构建/QA ID 和模型字节不变；裁切后门禁关闭，恢复轮廓后重新有效。实际 Overlay 重建/16 姿态 QA 生成版本 2 报告，注记保存仍保持应用证据；缺失目标原生重建失败后再保存注记，broken 门禁仍在，上次成功模型/QA 保留。验收脚本首次在错误提示出现、失败刷新仍进行时写命令，得到正确 BUSY，随后等待 idle 续验成功；未改操作门禁。证据在 out/e6-signature-evidence/。

Kotlin/JAR/素材及 IR 持久化格式未改，本轮未重跑未变的前端/Kotlin全套。手动 Rebuild 仍执行明确请求的重建；本轮消除注记造成的失效，不声称实现阶段产物缓存。尚未把产品构建设置纳入项目签名，当前原生预览配置仍固定。接续 E6 的 WorkspaceService 提取与 R2–R8。

## 31. E6c：工程归档 WorkspaceService（2026-10-07）

基于 E6b PR #15，main@1bd3cab。UI 无关 application/WorkspaceService 接收捕获的历史、任务、空间引用、原 PSD 和不解释的 presentation JSON，负责资源整理、日志图片外置、版本 1 归档读写；ProjectSession 保留 UI codec、互斥、提示与安装。桌面/现有 Agent 保存入口共用；不声称整个编辑事务已脱离 ViewModel。打开解压目录显式归属与移交，失败/调度返回取消清理；保存服务 finally 清理，沿用既有原子替换/哈希清单。

三个真实临时工程测试通过，覆盖删除原始外部资源后往返、原 PSD/栅格/历史/设置/任务/辅助 PNG/日志/空间引用完整、保存失败保留旧归档、非法图片引用拒绝及临时目录清理。Kotlin 全套 208 项，0 失败/错误、1 跳过。源码 JAR 与随仓 JAR/manifest 同步，安装器 DryRun 通过。真实 Windows 桌面启动和 PrintWindow 截图正常，日志无启动错误；Compose UIA 仅暴露容器，未完成桌面保存/打开的 UI 自动化。首次手工启动漏了已有便携 skiko.library.path，补齐参数后成功，未修改源代码。证据在 out/e6-workspace-evidence/。

E6 原生门面、签名分层和项目归档服务已落地，完整编辑用例服务化、RigBuilder 领域拆分/阶段复用继续随 R7 推进。下一批按规划推进 R2/R3 的 ID/分类映射、人工语义修正和实际构建设置。未重跑未变化的前端/Python全套。

## 32. R2/R3a：身份映射与语义修正（2026-10-07）

基于 E6c PR #16，main@51fa4b5。新增部件设置、set_semantic/reset_semantic，保留导入识别，semantic.override 为可选人工修正；命令/差异/历史/恢复共用，保存仅放宽覆盖字段。旧无覆盖 IR 继续接受，含新字段的文件需当前严格 schema。builder 标准 PSD layer ID/XMP 映射 → binding 配置 → Analyzer 实际组件来源 → rig 的 drawable 身份报告，修复重名按名称误映射；派生口唇来源也保留。实际自动/覆盖/采用结果随构建记录，旧报告需重建、不推测对应关系。

新增三个回归，前端 55 / Python 23 / Kotlin 209 全套通过（Kotlin 1 跳过）；JAR/manifest 更新、DryRun 校验通过。实际 Edge ds 24 层：nose psd_14→lyid:13→ArtMeshFaceDetailL，修正 FACE_DETAIL/LEFT，撤销/重做/保存/刷新/原生重建/Cubism/16 姿态 QA/恢复自动识别通过，复原模型哈希与起始一致。语义修改美术 PNG 不变，与 Python 逐像素一致，源 PSD 保留。窄屏滚动修复后实际结果可达，无页面/控制台错误。证据 out/r3-semantic-evidence/；验收脚本文案修正后只续验未完成部分。

后续 R3b 开放项目构建设置，R4 项目/导出、R5 素材、R6 参数/受限模型编辑、R7 核心模块及复用、R8 动态仍未全部完成。UNKNOWN 仍遵循既有未知分类审计门禁，不绕过原生警告或 Overlay/runtime 基线核对。

## 33. R3b：项目构建设置（2026-10-07）

基于 R3a PR #17，main@640cc944。Studio 增加独立 build-settings.json / v1 契约、贴图尺寸 1024/2048/4096、网格内部间距 12–80 px、头部转向强度 0–2，默认 2048/40/1 保持原行为；缺设置文件只读取默认，不自动迁移写入。实际采样字段 meshInteriorDensity 与组件拆分字段 meshSpacing 区分，原生配置报告返回实际采用值。

保存设置同时核对 IR 和设置 revision；SETTINGS_CONFLICT / BASE_CONFLICT 拒绝写入且保留界面输入。保存与保存并重建共用工作区排他门禁，美术草稿须先保存/放弃。设置不进入美术撤销栈，离开页面提示未保存输入；重新读取/放弃设置修改明确执行。模型、失败和 QA 记录设置签名及构建设置副本；旧报告仅对应固定默认设置。设置改变使模型/QA 待更新，不使美术 PSD/PNG 失效；失败结论按设置归属核对，非法 Overlay 自身的预检仍保留。

新增三个回归：HTTP schema/冲突契约、Kotlin 字段采用/边界、真实临时 PSD 的设置持久化/CAS/顶点变化/注记/失败归属。前端 56、Python 24、Kotlin 210 全套通过（Kotlin 1 跳过），生产构建成功；源 JAR 与随仓 JAR/manifest 同步、安装器 DryRun 通过。Python 回归首轮采用了始终非法的缺失目标，依据 preflight/原生参数检查路径改用有效目标和未知参数，第二轮通过；未放宽生产校验。

实际 Edge ds 24 层：保存/刷新、两个真实标签页设置冲突并保留输入、重新读取、1024/12/0 保存并重建、Cubism 就绪和 16 姿态 QA、默认设置复原模型哈希均通过。美术 PNG 与 Python 逐像素一致，源 PSD 未变；桌面及窄屏面板按钮可达、无横向溢出/页面异常，仅主动冲突的预期 409 控制台记录。证据 out/r3-settings-evidence/。物理/交付选项、项目入口与完整导出随 R4/R8 推进；R4–R8 未全部完成。

## 34. R4a：项目入口、修订与可移植工程（2026-10-07）

基于 R3b PR #18，main@5a4b770。默认页改为 PSD 导入/Studio 归档/最近工程，无需编辑环境变量；?legacy=1 保留示例及原开发工作区。工程在 out/studio-projects/<id>，工程名独立于美术名，API/缩略图/美术 Worker/模型/QA 资源都按项目 ID 路由，各页面和原工作区互不重定向。PSD 预检汇总分组、蒙版、混合、效果等全部受限项及路径；不创建半成工程，不自动栅格化。

保存项目先提交美术草稿，再保存美术/构建设置/Overlay 原基线/成功构建和 QA 引用的不可变修订；核对 IR、设置和 head。恢复前自动保存当前状态，恢复旧分支点后可继续保存；旧素材、修订和结果保留。多文件恢复有持久事务；正常异常释放锁后下一 CLI 继续完成，强制结束仍可能遗留原排他锁，须先确认进程结束后释放锁，不删除事务。不是桌面 WorkspaceHistoryTree 或浏览器撤销栈的复制。

下载 .studio-project.zip 保留当前已保存美术、源 PSD、原图、素材/导入来源、设置、Overlay、全部修订及已有构建/QA；逐文件版本清单/长度/SHA-256。打开校验全套资源后注册独立 workspaceId 的新工程；源工程不覆盖。上传 128 MiB、展开 1 GiB/10000 资源/单项 256 MiB，拒绝路径越界/链接/大小写重名/清单及哈希异常。与桌面 .psd2live 不直接兼容。未保存设置须先提交/放弃，不在工程或美术撤销栈自动备份。

新增三个回归（两个真实临时工程集成、一个 HTTP 项目路由契约），前端 57 / Python 26 全套通过，生产构建通过。覆盖删除外部源及原工程后的归档往返、设置和修订/CAS、恢复中断继续、全部 PSD 受限报告、非法归档和项目目录链接。未改 Kotlin/JAR，未重跑原生全套。真实 Edge ds：导入、隐藏脸后保存项目、恢复/重载、原生重建/Cubism/16 姿态 QA、17.2 MB 工程下载/打开副本、不同工程页隔离、PNG oracle、源 PSD 保留均通过，零页面/控制台异常。实际停止并重启 Vite 后最近工程/模型仍打开，开发入口保持。布局续验显示真实工程名，展开面板不再把预览压到过小；窄屏无横向溢出。证据 out/r4-project-evidence/。

验收脚本先误捕获初始化列表响应，随后在自动导航后读取已失效的响应 body；按实际 API 响应和导航证据修正脚本，生产实现无相关绕过。完整工程闭环已落地，明确的可播放模型/cmo3 交付面板、文件选择复用和独立导出继续 R4b；R5–R8 尚未全部完成。

## 35. R4b：独立模型交付与文件选择复用（2026-10-07）

基于 R4a PR #19，main@0372644。Studio 的导出模型入口明确区分 cmo3 工程和可播放包，动作示例与默认物理分别选择；显式 Overlay 物理仍保留。独立 export-builds/deliveries/downloads 不覆盖成功预览/QA，失败保留上次成功交付。输入 IR、设置、Overlay/基线三种版本 CAS；快照保留最近交付、输入有效性和重新定位的下载 URL，工程归档/修订保留缓存与模型 ZIP，打开副本仍可下载。

首次同时准备 cmo3 和动作；只换目标/动作文件选择直接重打包。缓存键含模型输入、设置、Overlay/基线、实际 JAR/JVM 身份及默认物理；复用前核对全部原生文件哈希，损坏则产生新构建并保留旧文件。注记不改变模型输入。关闭动作同时移除 model3 引用和资源；包内只包含实际引用及报告，cmo3 另附重建 PSD。文件长度/SHA-256、当前与实际构建美术版本、原生身份和全部警告可追溯。原 PSD 编辑链不在 cmo3 中保留，纹理图层由纹理页重建，原始 PSD 保存在 Studio 工程。

Overlay 原始完整指纹/runtime/模型检查未放宽；交付转换警告与相同导出配置的未编辑模型比较，避免仅启用 cmo3 导致普通转换提示被误当作编辑新增问题。新增三个回归：两个真实原生临时 PSD/Overlay/打包/缓存/工程往返集成，一个 HTTP 校验/错误释放契约。前端 58 项、Python 28 项完整回归和生产构建通过。Kotlin/JAR 无变化，未重跑原生全套。

实际 Edge ds：cmo3/无动作可播放包/含默认物理与 4 动作包下载、逐文件哈希和资源引用、同模型缓存身份复用、页面刷新下载、独立导出模型 Cubism 加载通过。默认物理交付一次记录 16.406 秒，未记录首次 cmo3 与缓存打包耗时，不提供速度比较。交付 MOC SHA 与原成功预览一致；原预览/16 姿态 QA 引用、美术 PNG oracle、源 PSD 保留。桌面及窄屏布局通过，最终续验无页面/控制台异常，证据 out/r4-delivery-evidence/。首次脚本在请求结束而 React 新下载链接尚未提交时下载了旧包，依据实际 href 完成信号修正；后续选择器脚本语法修正后续验成功，生产行为未绕过。

R4 项目与模型交付闭环完成；没有验收 Cubism Editor GUI 的 cmo3 打开或实时物理播放。首次准备两个格式仍有开销，未实现常驻原生模型服务；完整工程仍受 128 MiB 上传及既有展开限制。接续 R5 可视化素材、R6 受限模型编辑/问题、R7 服务与建模模块、R8 动态及可选智能辅助。

## 36. R5：可视化素材放置、局部 mask 与来源（2026-10-07）

基于 R4b PR #20，main@10a100e。导入素材四步流程：选透明 PNG、拖动/四角缩放、矩形/连续画笔/擦除或载入二值 mask、前后对比预检再确认。精确坐标/源裁切保留，替换目标高亮、实时放置示意移除原目标并显示新素材。缩放启用 alpha 等比适配；示意使用浏览器插值，精确像素以 Pillow 预检图为准，未完成坐标不会把 NaN 写入 SVG。

默认全图保护，只有显式绘制才开放局部，mask 必须同时含 0/255。连续画笔按像素中心胶囊采样，无抗锯齿灰度；原画布大小二值数据原样提交，示意长边最多 1024 像素。改变输入或开始手势即撤销预检授权，手势期间不能确认；取消指针恢复本次开始状态。关闭对话框放弃未提交放置/mask，不提供持久 mask 草稿或历史。保护区违规提示实际画布范围及调整路径，不裁掉违规像素；成功预检可并排/单张前后和全图查看。

AssetOrigin v1 区分 manual/external/ai：统一来源说明，只有 AI 要求提示词，非 AI 拒绝 prompt。CLI --origin-file 与 Studio origin 共用；旧 --prompt-file / prompt 保持 AI 导入。IR provenance 保留映射来源、说明、AI 提示词和原图 SHA，导入档案新增 asset-source.json。候选/工作区/素材核对继续保留，确认新增原始 PNG、mask、来源及 AI 提示词证据复核；改动或缺失返回 IMPORT_CONFLICT，不写 IR。旧无来源 JSON 的预检仍核对原证据。新增 provenance 字段需当前严格 schema，未自动改写旧文件。

新增三个回归：二值笔画/矩形/擦除与放置边界/alpha 裁切、HTTP 来源契约/旧请求兼容、实际 PSD 的三来源预检/提交/保护区拒绝/证据篡改/来源持久化和往返。前端 60 项、Python 29 项完整回归及生产构建通过。首轮测试脚本缺 hashlib、把 runner 的 JSON 字符串当对象，以及过早注册 test 引起临时编译目录清理，依据现有调用契约修正后通过，未放宽生产校验。Kotlin/JAR 未变，无新依赖/服务。

实际 Edge ds：真实鼠标拖动/缩放、全图保护默认、局部违规范围、矩形/画笔/擦除、载入真实绘制 mask、来源切换失效、前后/全图/并排、取消不写 IR、人工新增/来源显示通过。PNG 与 Python 逐像素一致，源 PSD 保留；原生重建/Cubism/16 姿态 QA 成功。继续验收外部替换和源裁切：稳定 ID/z/显示、旧素材及模型/QA 保留并失效、裁切排除统计、原图/来源证据核对和 PNG oracle；随后再次实际重建及 16 姿态 QA，当前模型/QA gate 正常。桌面/窄屏截图已检查。最终续验无页面/控制台异常；主流程只有主动保护区拒绝的预期 400 控制台记录。证据 out/r5-assets-evidence/。首次脚本标签匹配同时命中来源说明，改为 exact 定位后完成，无生产绕过。

R5 完成；素材美术质量仍由用户判断，未调用生成 API/模型下载或从不透明图拆背景。R6 参数分组/姿态/受限 Overlay/问题面板、R7 服务与建模模块、R8 动态继续按规划推进。

## 37. R6a：参数分组与项目姿态（2026-10-07）

基于 R5 PR #21，main@c2e8684。原生参数范围/默认值随快照和构建返回，旧报告可读但保存姿态须重建。面板按头部/眼睛/嘴部/身体/头发分组，友好名称、数值输入、单项/全部重置和预设共用实际参数。应用前整体验证，缺参数、越界或非有限值不重置、不部分写入，普通渲染按帧调度。保存姿态仅记录预览值，不修改模型绑定、IR、美术或 QA。

独立 poses.json/v1 库保存最多 100 份姿态，名字/参数/稳定 ID/模型哈希可追溯，缺文件只读空库。保存核对 IR、设置、Overlay、成功构建和库版本，未知/越界参数拒绝；删除核对库版本。多窗口冲突保留名称，“读取姿态库”后可继续。项目修订和完整归档保留姿态，保存/恢复可核对 posesRevision，当前 UI 总是核对；旧修订恢复空库。未新增依赖或修改 Kotlin/JAR。

新增三个回归：真实原生参数范围/库 CAS/拒绝不写/工程归档与修订恢复，ViewerAdapter 原子应用/按帧/不截图，HTTP 严格请求/409/释放门禁。前端 62 / Python 30 项全套通过，生产构建成功。Python 主回归先误用 QA ±30 范围、再误传修订说明；第三次发现恢复后空库，按三失败规则停止修改，重新核查完整存储/事务路径并查 Python JSON 官方说明。新证据定位到恢复事务的字段白名单漏 poses，补齐字段，保留原断言并核对修订文件中实际库，针对用例及已有项目回归通过后完整回归通过。未绕过校验。

实际 Edge ds：数值/单项重置/闭眼与转头预设、PNG 确认姿态变化、保存/刷新/应用、真实两页 409/输入保留/重读、删除与修订恢复、不兼容旧姿态整体拒绝、桌面及窄屏控件可达通过。实际原生重建与 16 姿态 QA 已执行，姿态操作保持 IR/MOC 字节及 QA 引用，MOC SHA 为 6f94c9905008bec2830bf248b404b5df685db4e1aced3cfc4b5dbc04c5cf75e0。证据 out/r6-poses-evidence/。主脚本在恢复后修订列表刷新占用门禁时盲读 snapshot，检查持久库与成功接口后续验通过；续验无页面/控制台异常，双页主流程包含主动冲突的预期 409。布局截图及实际滚动检查通过。

R6a 完成，R6b 受限 Overlay/结构化问题与冲突定位、R7 服务/建模模块和 R8 动态仍继续。姿态库是预览值快照，不宣称完成关键形编辑或实时物理。

## 38. R6b：受限关键形、问题定位和冲突证据（2026-10-07）

基于 R6a PR #22，main@41facf4。Studio 工程可为当前图层实际 drawable 在指定原生参数/数值处追加透明度关键形（0–1）。参数、目标、输入/设置/Overlay CAS 均检查；只追加独立 opacity set，不覆盖他人的几何/其他通道或有序 journal。已有完整独立透明度 set 可撤回，定位对应图层；复杂外部编辑保留，不在有限 UI 擅自修改。首次基线来自当前未应用 Overlay 的成功原生构建，核对完整模型/引擎证据；原基线不自动重置。后续修改仍通过原生完整兼容性/新增警告检查才更新模型。

修改前调用现有项目 checkpoint 保留完整 Overlay/原基线/输入/成功模型与 QA，写入复用现有持久恢复事务，无新历史引擎/目录/格式。工程归档和旧修订继续包含这些证据。UI 区分临时参数与持久关键形；未更新、失败和冲突保留上次成功预览。结构化问题首批包含未知分类（定位部件设置）、Overlay 冲突/无效参数（参数字段与编辑面板）、其他构建失败；只归属当前模型输入/设置/Overlay 的失败，历史证据单独可查看。变化字段与原 Overlay/基线/失败 JSON 可查看，不提供忽略冲突或自动重设基线。QA 新增真实单姿态缩略图及载入，旧报告没有完整截图信息时保留联系表；过期 QA 不可加载，空参数中立姿态使用独立契约兼容。

新增三个回归：实际原生透明度重放/撤回模型复原/修订及归档，实际无效参数/基线冲突/失败模型保留，HTTP 受限请求/拒绝几何/409/中立 QA 契约。前端 63 / Python 32 项完整回归通过，生产构建通过。Kotlin/JAR 无变化。首轮 Python 检查发现旧失败记录缺 build-ir 与测试浅复制污染 runtime，按已有版本/路径证据保守读取及独立备份修正后通过；失败问题还同时核对设置和 Overlay 捕获，避免陈旧错误冒充当前问题。

实际 Edge ds 新工程 4400babcf19841c9b7b4a393cd18cb51：QA 缩略图载入、ArtMeshFace/ParamAngleX=30/opacity=0.4 提交、MOC 和实际画面变化、刷新/定位/撤回/重建模型逐字节恢复通过；基线 MOC cf1694d8a967245228444856e89a155ad53c728233ca1c7bbe50dccb7f7186f7，修改 MOC 8a70f64682e3d90b9b91b21a336449ec4244b394e527957bfcb11488f6a444d7。UNKNOWN 定位、外部旧编辑 ParamRemovedAxis 的原生拒绝/字段说明/撤回、1024 贴图造成 getDrawables 基线冲突、旧成功模型保留、恢复 2048 设置后原哈希和 16 姿态 QA 通过。桌面/窄屏面板与截图已检查，缩略图图片边界在按钮内，neutral/hair_plus 实际点击及参数核对通过。源 PSD 保留；未声称美术质量审查或所有 Overlay 组合通过。

浏览器连续三个中断分别为中立姿态空参数契约、按钮可访问名、自动修订读取占用门禁。按三失败规则暂停修改，核对调用链并查 React 官方 useEffect 生命周期后，明确 head 变化触发未锁定读取的新证据；修订读取改为当前操作完成后共用门禁，按 head 读取一次，实际修改/重建/重载/撤回续验通过。另有实际缩略图横向 flex 导致图片越界拦截点击，元素边界探针确认后改为纵向和换行，桌面/窄屏续验通过。定位脚本改用真实图层文本，未使用强制点击。主成功续验零页面/控制台异常；失败场景两个主动原生拒绝 400，另一次 409 经真实读取期间刷新复现，明确来自 /api/open，已有忙重试恢复就绪。最终页面异常为零；不隐瞒导航瞬间的预期 409。证据 out/r6-overlay-evidence/。

R6 首批范围完成：参数/姿态、受限透明度关键形、结构化阻断问题与可执行定位/撤回及 QA 缩略图。完整网格编辑、复杂 Overlay 全组合和自动重定基线不在首批范围；R7 服务/领域建模与阶段复用、R8 物理/动作继续按规划推进。

## 39. R7a：准备模型复用与同一导出检查（2026-10-07）

基于 R6b PR #23，main@0b2877c。PSD2LivePipeline 将 exportAnalysis 的验证、格式写出、回读和 runtime/report 流程提为私有 exportPrepared；exportPreview 导出捕获的模型，exportReplayPreview 在未应用 Overlay 的基础预览上应用一次 Overlay 后进入同一导出流程。canReusePreview 核对全部 PipelineConfig 字段，只有 rigEdits 可不同。Python native_replay 在原完整基线/runtime/preflight/原生 applyTo/新增问题检查后选择复用；自定义物理等配置变化仍用原完整构建。报告增加 reused_prepared_model，不新增持久缓存或依赖，也不承诺未测量的提速比例。

一个新增 Kotlin 回归核对实际 ds 复用/完整构建全部文件集合、逐字节内容、警告和 analysis/atlas 身份；贴图/转向/物理配置变化及已编辑基础模型在写出前拒绝。原有真实 Python 透明度回归增加复用结果断言。Kotlin 211 项、0 失败、0 错误、1 跳过；针对 Python 原生编辑/交付 4 项通过。首次 Kotlin 失败仅为测试临时目录名不符合已有 ProjectArchive 清理约束，按约束修正后通过。随仓 JAR/源码 JAR 均 6268331 字节，SHA 330d89cc6dd9d3ec2e99bdb4ce09c02db5eb9e5cd745176507b55364813351a8；manifest 同步，安装 DryRun 通过。

真实 Edge 新工程 82ddc51ca76149a4a5e4c35812c82580：基线 MOC cf1694d8a967245228444856e89a155ad53c728233ca1c7bbe50dccb7f7186f7；ArtMeshFace/ParamAngleX=30/opacity=0.4 复用重放后 MOC 8a70f64682e3d90b9b91b21a336449ec4244b394e527957bfcb11488f6a444d7，与 R6b 完整构建所有模型文件逐字节一致。Cubism 加载、16 姿态 QA 和 neutral 缩略图实际点击通过，最终页面/控制台异常为零。旧工程引擎指纹不符继续拒绝，保留旧模型/Overlay/基线，没有自动迁移。自定义物理原生重放复核 reused_prepared_model=false、规则计数 1 和 physics3 文件生成，完整构建回退通过。

验收脚本首次过早读取问题 DOM，保存的真实失败证据正确，改为等待元素后续验；经历多轮热重载的 Vite 进程曾返回未注册路由，重启现有服务器后相同提交/完整流程通过，没有改路由实现。物理探针首次误用 camelCase 字段，按现有 source Overlay snake_case 契约修正，未放宽生产校验。证据 out/r7-prepared-evidence/。R7a 完成，UI 无关编辑用例及领域 RigBuilder 模块继续，R8 动态尚待实施。
