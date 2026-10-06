# 架构、功能与交互设计迭代计划

日期：2026-10-06。代码阅读基线：`615d0b8fb332d1cd1a8c649e41b267511305e806`。

本计划针对源码组织、模块职责、产品能力与编辑器设计提出更新建议，承接 [现有功能状态](PLAN.md)。第 1–6 节保留初始代码阅读及目标设计，当前实施状态见第 7 节；R1 之后的工程优化见 [ENGINEERING_REVIEW_R1.md](ENGINEERING_REVIEW_R1.md)。初始交互评价不代表用户研究或性能测量。

## 1. 总体判断

项目已经具备较丰富的建模核心，下一步最有价值的是把这些能力组织成可理解、可修改、可撤销、可交付的编辑流程。当前主要矛盾有三类：

1. **核心能力与 Studio 功能脱节。** Kotlin 已有分类覆盖、图层删除与层序覆盖、参数和关键形编辑、物理/动作生成、项目归档和历史树；Studio 主要开放轮廓裁切、可见性、注记、素材导入和静态预览。继续增加独立底层工具的收益，低于把现有能力接入界面。
2. **不同入口各自承担项目与状态管理。** Studio 使用 Python 工作区，桌面/Agent 使用 Kotlin 项目、历史和 ViewModel。两条链路并存可以接受，但项目、版本、命令和模型产物的边界需要明确，避免同一个功能维护两种含义。
3. **编辑反馈落后于操作。** Studio 画布显示静态参照图，隐藏或裁切后需要重建才看到最终变化；没有 Studio 草稿撤销，导入要求用户手工准备 mask 和坐标。应优先缩短“修改—看到结果—修正”的循环。

推荐产品主线：**导入项目 → 整理图层与语义 → 修改美术 → 生成/调整模型 → 检查问题 → 导出成品**。先把前四步的基本交互做顺，再扩展自动拆层、复杂动作和 AI 生成。

## 2. 具体代码观察与更新建议

| 观察 | 代码依据 | 建议及价值 |
|---|---|---|
| `App` 同时负责打开重试、草稿、拖点、保存/重建、viewer 轮询、参数列表和弹窗；IR/Snapshot 类型直接写在组件内 | [main.tsx](../studio/src/main.tsx) | 按编辑状态、画布、模型预览、任务及导入拆分；让撤销、多工具和新面板有稳定扩展位置 |
| 每次拖点更新整个 IR，dirty 用完整 `JSON.stringify` 比较；画布引用 `sourceImage/artworkImage` 静态合成图 | 同上，`dirty`、`updatePart()`、`move()`、画布 `<image>` | 引入编辑命令与手势事务；先实现即时图层合成，再按实际性能决定缓存细节 |
| 参数滑块变化调用 `snapshot()`，其内部执行 `toDataURL('image/png')`，界面却没有使用返回图片 | [main.tsx](../studio/src/main.tsx)、[viewer](../live2d-viewer/index.html) | 普通交互改用 `render()`，按帧合并滑块更新；只有导出截图时编码 PNG |
| Studio 用 `contentWindow.viewer` 读全局对象，轮询 ready，并向 iframe 注入样式 | 同上 | 建立小型 ViewerAdapter，保留 iframe 隔离，统一 ready/error/load/render/capture；viewer 自己支持嵌入模式 |
| Vite 配置承担路由、请求体读取、文件服务、进程调用和 busy 管理；异常大多包装成 400+字符串 | [vite.config.ts](../studio/vite.config.ts)、[api.ts](../studio/src/api.ts) | 将桥接提取到 `studio/server/`；定义有版本的 DTO 和错误码，界面才可针对冲突、校验和构建失败提供不同操作 |
| `studio.py` 同时处理文件持久化、快照、素材预检、重建和 QA | [studio.py](../tools/authoring_rig/studio.py) | 拆成工作区存储、编辑服务、素材服务、构建编排和检查服务；保持 CLI 命令兼容 |
| Python 反射读取 Kotlin getter、遍历字段并按位置调用 `copy(*args)`，Overlay 也在 Python 中转换成 JVM 对象 | [native.py](../tools/authoring_rig/native.py)，`getter()`、`plain()`、`config_for()`、`copy_native_fields()` | 增加显式 Kotlin 服务入口和序列化 DTO，将配置构造和原生快照放回 Kotlin，降低内部类变化对 Python 的影响 |
| `RigBuilder.kt` 集中网格、层级、眼口变形、头发、通道和层序规则；已有 `NinePoseFaceRig` 等可复用模块 | [RigBuilder.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/RigBuilder.kt) | 随功能迭代按领域提取生成器，保留统一上下文与稳定 ID，避免仅按文件长度机械拆分 |
| 项目保存直接依赖 `PSD2LiveViewModel`；Agent 的具体工作区也依赖 ViewModel，分别管理编辑锁、持久化、历史等 | [ProjectSession.kt](../psd2live/src/main/kotlin/io/github/psd2live/project/ProjectSession.kt)、[ViewModelAgentWorkspace.kt](../psd2live/src/main/kotlin/io/github/psd2live/agent/ViewModelAgentWorkspace.kt) | 逐步抽出不依赖 Compose/UI 的 WorkspaceService，让桌面和 Agent 成为适配器；不再把新业务堆入 ViewModel |
| Python 和 Kotlin 各自维护名称分类规则；Python 只返回 tag/side/confidence，Kotlin 还保留 variant 等信息 | [classifier.py](../tools/authoring_rig/classifier.py)、[LayerClassifier.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/LayerClassifier.kt) | 原生分类作为建模依据，Python 预检共享规则数据；显式区分“推测分类”与“实际绑定分类” |
| Studio 保存只允许 geometry/appearance；原生 `PipelineConfig.layerOverrides` 已能修改分类 | [studio.py](../tools/authoring_rig/studio.py)，`save_workspace()`；[Model.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/Model.kt)、[Analyzer.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/Analyzer.kt) | 提供专用语义修正命令，真正接入 layerOverrides；不能仅开放 IR 文本编辑后声称改变了绑定 |
| `landmarks` 只是注记，失效签名却把整个 geometry 算入 PSD；所有重建都重新生成 PSD 并调用原生流程 | [stale.py](../tools/authoring_rig/stale.py)、[studio.py](../tools/authoring_rig/studio.py) | 区分影响像素、影响绑定和仅供编辑的字段；先消除无意义重建，再做保守的阶段复用 |
| Studio 预览配置固定贴图 2048、网格间距 24，并关闭 cmo3/动作导出及默认物理生成 | [native.py](../tools/authoring_rig/native.py)，`config_for()` | 将构建设置纳入项目，引入预览/交付配置；导出必须明确对应哪个项目修订和构建配置 |
| PSD 导入主动拒绝分组、蒙版、效果、剪贴及非正常混合 | [exporter.py](../tools/authoring_rig/exporter.py)，`export_psd()` | 先给出完整的不支持项清单和图层定位，再逐步支持受限分组或显式栅格化副本；不静默改变原画 |

以上是当前结构及能力边界。潜在的维护、性能影响属于设计判断，不将其描述为已经复现的运行故障。

## 3. 建议的架构边界

### 3.1 各层负责什么

```text
Studio UI / Desktop UI / Agent
            ↓ 各自的入口适配器
      应用用例与版本化命令契约
       ↙                   ↘
ArtworkService          RigService（Kotlin）
图层、像素、裁切、素材    分类、绑定、Overlay、参数、导出
       ↘                   ↙
      项目修订、构建记录、产物清单
                 ↓
      ViewerAdapter / 检查报告
```

这是目标职责划分，不表示第一轮要合并进同一进程或创建多个网络服务。近期继续保留 React → Node 桥接 → Python CLI → Kotlin 的链路，只把职责和契约抽清楚。

- **美术数据：** IR 保留图层、素材、轮廓与来源，不加入参数/变形器/物理对象。
- **模型设置：** 项目单独保存分类覆盖、网格与绑定设置、导出配置，通过明确映射传给 `PipelineConfig`。
- **模型编辑：** 继续使用原生 Overlay/Journal，不在浏览器或 Python 再实现一套关键形引擎。
- **派生产物：** 构建与检查记录引用不可变项目修订、配置和引擎身份；当前编辑状态与上次成功结果分开展示。
- **会话视图：** 选中图层、缩放、展开状态和预览姿态单独保存，不触发模型重建。

### 3.2 项目模型与历史

建议 Studio 增加版本化项目清单，引用 `artworkRevision`、`rigSettingsRevision`、`overlayRevision`、`buildId` 和 `reviewId`。这些是建议字段，当前源码尚未支持。

区分三种历史：

| 历史 | 粒度 | 行为 |
|---|---|---|
| 编辑草稿 | 一次拖拽、一次显示切换、一次数值修改 | 撤销/重做；一次连续拖拽只记一条 |
| 保存的项目修订 | 图层/素材/设置的一组已提交修改 | 恢复、比较、分支；与草稿历史分开 |
| 构建与检查记录 | 基于指定修订生成的结果 | 查看旧模型及报告，不覆盖当前草稿 |

桌面已有 [WorkspaceHistoryTree](../psd2live/src/main/kotlin/io/github/psd2live/history/WorkspaceHistoryTree.kt) 和 `.psd2live` 项目归档，不重新发明第二套桌面历史。先定义 Studio 与桌面的项目身份、素材 ID、设置和 Overlay 映射；后续通过适配器互通。两者当前格式不同，不能直接改扩展名或宣称完全兼容。

近期 Studio 工作区是 Studio 美术修订的权威来源，Kotlin 是模型生成与模型编辑的权威实现。最终共享 WorkspaceService 的迁移应按用例推进，避免同一次用户修改被两边重复提交。

### 3.3 具体的代码组织建议

```text
studio/src/
  app/                       页面壳与导航
  features/project/          打开、保存、修订和导出
  features/artwork/           图层、画布工具、属性面板
  features/assets/            素材放置、mask、前后比较
  features/rig/               语义、设置、参数与姿态
  features/review/            问题列表、姿态对照
  state/                     编辑命令、草稿与任务状态
  viewer/                    ViewerAdapter
  contracts/                 生成的 API 类型
studio/server/               路由、CLI 调用、任务和资源服务
tools/authoring_rig/
  workspace/                 存储、修订、迁移
  services/                  美术编辑、素材、构建、检查
  engine/                    Kotlin 门面客户端
psd2live/.../
  application/               不依赖 UI 的用例和服务门面
  core/rig/                  按脸部、眼口、头发、层级划分生成职责
```

这是渐进目标：先抽出下一功能会修改的模块，保留原入口转发，不一次搬动所有目录。成熟的 `org.umamo` 格式/运行时层保持底层职责。

### 3.4 稳定的命令契约

在现有 JSON CLI 上增加版本化命令/结果类型；请求包含命令、项目、预期修订和类型化输入，响应区分结果、警告、字段错误及任务状态。逐步用 schema 生成 TypeScript DTO，Python/Kotlin 在边界校验，替代各处手写的部分类型。

建议错误类型包括 `REVISION_CONFLICT`、`INVALID_GEOMETRY`、`UNSUPPORTED_LAYER`、`OVERLAY_INCOMPATIBLE`。保留原错误上下文，同时返回 `partId`、字段或阶段，支持界面定位。

首个 Kotlin 门面只覆盖 `inspect`、`build`、`replay` 和 `export`。Python 可暂时继续用 JPype 调用门面的显式方法；不必为了消除反射立即换成 HTTP 或常驻 JVM。是否常驻应依据启动/构建耗时再决定。

## 4. 功能与界面设计

### 4.1 整理编辑器的信息结构

沿用现有三栏基础，将工具职责明确化：左侧图层与问题导航，中间编辑画布，右侧随选中对象变化的属性；模型预览可切换为并排或主画布模式。避免同时塞入长参数列表、导入表单和全部错误信息。

顶部显示项目名、保存状态、撤销/重做、更新模型和导出。构建检查统一为“检查模型”，界面文案使用“保存项目”“更新模型”“姿态检查”；IR、Overlay、MOC3 签名等放入高级详情。

每个预览标明“当前草稿”“已保存美术”“上次生成模型”的来源；有未更新修改时，模型区域提示差异原因，而不是让用户从页脚多个状态推断。

### 4.2 美术编辑：优先补即时反馈与可撤销操作

- 画布按图层 PNG、位置、层序、透明度和轮廓合成当前草稿，隐藏图层立即消失，裁切即时可见；原始参照图作为开关或对照模式保留。
- 第一版可以复用现有 SVG 按图层绘制与裁切；保存时由现有 Python 栅格逻辑生成权威合成图。需要核对像素中心、even-odd 和透明度语义，不能让浏览器展示与保存结果长期不一致。
- 增加平移/缩放、适应画布、单独查看图层、重置裁切、增删轮廓点、删除/重命名注记、透明度调节。图层多选与批量操作排在单层操作稳定之后。
- 拖拽开始/结束构成一次事务；取消拖拽可恢复；跨图层撤销不依赖当前选中项。自动保存草稿用于恢复，不自动重建模型。
- 参数滑块使用按帧渲染，截图操作才调用 PNG 编码；这是已有 API 就能支持的直接改进。

### 4.3 图层语义与绑定设置

新增“部件设置”面板：显示源名称、自动识别类别/左右侧、人工修正和实际构建采用值。允许修正分类，不强迫用户通过改图层名影响算法；首次先开放类别和左右侧。

实现上，将人工覆盖放入项目设置，通过 Kotlin 门面映射到 `PipelineConfig.layerOverrides`。必须核对 IR ID、重建 PSD 的 source layer ID、拆分后的 component ID 映射，不能假设字符串天然相同。保存修正后，构建报告应返回实际采用的结果和对应 drawable。

Python 预检可读取从核心导出的别名/标签数据；复杂分类以原生实现为准。名称、语义、用户显示名分清职责，避免添加第三份分类逻辑。

随后开放全局网格/头部强度设置与已有的分部件设置。关键点当前只是注记；真正用于绑定时应新增带版本的校准契约，先支持明确的眼中心或头部轴线场景，再扩大范围。

### 4.4 素材导入：把坐标表单改成可视化放置

将“导入生成素材”改为“导入素材”，支持手绘或外部生成 PNG。采用四步流程：选素材 → 在画布放置/缩放 → 绘制或载入可编辑区 → 对比并确认。

- 将现有整数坐标输入收进精确设置，主操作使用拖拽矩形、缩放手柄和目标图层高亮。
- 内置矩形/画笔 mask 工具，清楚展示可修改区；不要默认为全图可改，继续保留现有严格保护区检查。
- 新增/替换、适配范围、透明边裁切的结果实时预览；提交前显示前后切换和保护区差异位置。
- 素材来源作为统一记录，生成 prompt 仅在来源为 AI 时使用相应文案；需同步调整当前 `prompt` 必填契约，不只改 UI 标签。
- 保留预检与提交分离、版本检查和输入哈希，不因交互简化丢掉已有数据保护能力。

### 4.5 项目入口、PSD 兼容性与导出

增加项目起始页：新建、导入 PSD、打开项目、最近项目。当前启动环境变量保留为开发入口，日常使用通过界面选择。

导入 PSD 时先列出全部受限图层及原因，而不是只显示第一个异常。后续先支持“可证明等价的分组展开”；涉及蒙版/混合/效果时，提供明确的栅格化副本流程与前后对比，保留源 PSD 和转换说明。

导出设计提供两个明确目标：“可继续编辑的工程（cmo3）”与“可播放模型包（moc3、配置、纹理、动作/物理）”。选择设置后生成独立构建，列出文件及警告，完成后下载或打开产物位置。

预览与交付使用显式配置；只改变导出文件选择时复用同一模型，改变贴图、网格或绑定参数时必须重新生成。禁止把预览用固定配置默认为用户最终设置。

### 4.6 模型调整与问题导航

- 参数按头部、眼睛、嘴部、身体、头发分组，显示友好名称、数值输入、重置和常用姿态预设。
- 先接入“保存/应用姿态”和受限的关键形编辑，复用原生参数及 Overlay 能力；明确区分临时预览参数与持久模型编辑。
- 将当前字符串警告逐步变成问题对象：严重度、阶段、图层/对象、姿态、说明、可执行动作。首批覆盖未知分类、Overlay 冲突和无效参数。
- 检查结果采用问题列表与姿态缩略图，点选定位对象或载入姿态；保留联系表和 JSON 作为导出报告。
- Overlay 冲突显示哪个目标/基线发生变化，允许保留旧模型、查看差异或撤销对应修改；重新建立基线必须保留旧证据，不能用“忽略错误”按钮绕过不兼容状态。
- 最后加入播放/暂停、固定时间步的物理预览和动作预设。先打通已存在的动态能力，再考虑完整时间轴编辑器。

## 5. 按收益与依赖排序的迭代

“完成表现”描述用户可观察的结果，不是环境搭建任务。每个迭代只补与行为变化相关的回归证据。

| 迭代 | 优先级与依赖 | 主要交付 | 完成表现 |
|---|---|---|---|
| R1 编辑反馈和前端边界 | P0；可立即开始 | 拆出编辑状态/画布/ViewerAdapter；撤销重做；实时合成；滑块普通渲染；顶栏和状态文案 | 用户裁掉一块头发立即看到效果，撤销可恢复；知道预览是当前草稿还是旧模型 |
| R2 命令契约和原生门面 | P0；与 R1 的 UI 部分可独立推进 | Node 桥接模块化、结构化错误、Kotlin 显式配置/构建门面；Python 按用例拆分 | Kotlin 配置加字段无需 Python 按反射字段顺序同步修改；同一错误在 UI/CLI 有一致身份 |
| R3 语义修正和构建设置 | P0；依赖 R2 | 图层类别/左右侧编辑、ID 映射、原生分类结果回传、项目构建配置 | 不改 PSD 图层名即可纠正错误分类；重建实际采用该设置，修改原因可追踪 |
| R4 项目与交付闭环 | P1；依赖 R2/R3 | 项目打开/保存、修订记录、完整导出入口、受限 PSD 导入报告 | 用户能打开自己的 PSD、修改、保存、恢复并导出完整模型包，无需编辑启动变量 |
| R5 可视化素材工作流 | P1；依赖 R1/R2 | 画布放置、mask 绘制、前后对比、来源记录 | 用户在界面内完成素材放置及保护区设置，预检通过后确认导入 |
| R6 模型编辑与问题面板 | P1；依赖 R3/R4 | 参数分组、姿态预设、受限 Overlay 编辑、结构化问题与冲突查看 | 参数预览与持久修改有清楚区别；失败能定位到对象并提供修正路径 |
| R7 核心服务与建模模块整理 | P2；随 R2–R6 逐步提取 | UI 无关 WorkspaceService、领域 RigBuilder 模块、构建阶段复用 | 桌面/Agent 共用编辑用例，新能力无需继续扩张 ViewModel；仅改注记不触发模型重建 |
| R8 动态表现与智能辅助 | P2；依赖 R6/R7 | 物理/动作播放，再按需求接入单图拆层或生成候选素材 | 用户能观察动态效果；智能结果以候选方式进入已有编辑和确认流程 |

推荐前三次实际提交：

1. **R1a：** 提取 ViewerAdapter，普通滑块调用 `render()`，统一预览状态与来源标识。改动小，收益直接。
2. **R1b：** 人和 Agent 共用版本化美术编辑命令、草稿事务、逐字段差异和撤销/重做；提供浏览器入口与离线 JSON 提案工具。即时图层合成及版本化图像输出由 R1c 单独实施。
3. **R2a + R3 首个切片：** 增加 Kotlin 门面、图层 ID 映射和“修改类别/左右侧”端到端命令，把架构改善落实为用户可用的新功能。

## 6. 深层重构的做法与取舍

### 建模流程按领域分解

`RigBuilder` 已有明确的眼口、头发、层级与网格函数，建议逐步提取 `RigBuildContext`、`HierarchyBuilder`、`DrawableBuilder`、`EyeRigGenerator`、`MouthRigGenerator`、`HairRigGenerator`。共享坐标系、ID 分配器和图层映射由上下文管理，生成器返回明确结果，避免拆成互相读写全局状态的文件。

`PSD2LivePipeline` 保持编排职责，逐步分离准备模型、导出格式和检查。`native_replay()` 目前先构造预览/签名，之后再次调用 pipeline 导出；后续可研究复用已经检查过的模型，前提是保证导出应用的 Overlay、配置与检查对象完全一致。这里是候选优化，不承诺未测量的提速比例。

### 先修正失效含义，再引入缓存

把非绑定注记、纯界面状态移出模型依赖；模型设置、语义覆盖、素材和 Overlay 纳入各自签名。复用单位先选“整个 PSD”“整个基础模型”“指定配置的导出包”，缓存键包含输入、设置和引擎身份。

不先做任意单图层局部重建：贴图打包、分割、对象顺序和拓扑可能相互影响。Overlay 依然按完整兼容性检查处理。

### 长任务服务化

在需要取消、断线恢复和后台构建时，引入持久化任务记录 `queued/running/succeeded/failed/cancelled`，返回 jobId，由 UI 查询进度。写入仍按项目串行；只读快照不应被无差别的全局 busy 状态阻塞。

取消先在安全阶段边界生效，原生阶段无法中断时明确显示状态。现有 `AgentTaskManager` 是外部 Agent 的计划/检查点记录，代码注释明确其不执行任务；可借鉴事件模型，不能直接当作构建调度器使用。

### 避免过早扩张

暂缓完整 Cubism Editor 替代品、任意精细网格变形 UI、多用户协作、插件市场和大型框架迁移。先把“可撤销的美术编辑、可修正的分类、可解释的生成、完整导出”做完整。现有保护区验证、稳定 ID、源素材保留、revision 检查、Overlay 兼容性判断继续作为编辑基础。

## 7. 范围与进度

已完成关键代码阅读和上述设计建议，并实施 R1a：ViewerAdapter、预览状态提取、按帧直接重绘、嵌入布局和模型来源标识；R1b：共享编辑命令、草稿版本/差异、批量原子变更、撤销/重做、拖拽事务、浏览器 Agent 入口与离线 JSON 提案工具。调用契约见 [STUDIO_DRAFT_COMMANDS.md](STUDIO_DRAFT_COMMANDS.md)。R1c 已实现独立像素渲染器、Worker 合成、草稿/保存版本/原始参照切换及版本化 PNG 输出。R2–R8 尚待实施。阅读覆盖 Studio、Python IR/素材/原生桥接、Kotlin 建模入口、分类、项目、历史及 Agent 适配，未声称逐行审阅所有格式编解码或第三方推理代码。

后续按每个迭代的具体行为更新 [PLAN.md](PLAN.md) 和 [HANDOFF.md](HANDOFF.md)。首个里程碑：Studio 内完成一次可见、可撤销的美术修改，再通过明确设置生成并导出对应模型。

### 本轮执行范围

按用户要求，先实施可在 Linux 独立验证、无 Windows 依赖的部分。R1a 只修改浏览器预览、React 交互及文档，使用仓库现有模型验证 Cubism Web，工作区 API 采用固定测试响应。

需要 Windows 实测的部分留待用户 PC：Python→portable JVM 桥接、原生构建/导出与 Overlay 重放、DLL/OpenGL 预览、桌面 ViewModel/项目归档及 Windows 安装包。这些调用链本轮未改动；后续迭代如需修改，先停在对应边界，并记录待实施工作。

R1b 已按用户确认调整为对 LLM Agent 直接可用的共享命令层，而非仅增加 UI 撤销按钮。编辑领域逻辑与 JSON 工具可在 Linux 独立运行；浏览器 commit 复用已有保存接口，未扩展 Python/Kotlin/native 契约。Linux 构建、19 项回归和 Chromium 人/Agent 交互检查通过，浏览器使用受控工作区 API 响应。

R1c 的 Linux 构建与 37 项回归通过；像素样本使用现有 Python raster/composite 函数生成，Chromium 验证实际显示与导出。下一步优先优化草稿增量状态和有界历史，再推进渲染失效范围、协议统一和草稿恢复，具体代码依据与切片见 [ENGINEERING_REVIEW_R1.md](ENGINEERING_REVIEW_R1.md)。R2/R3 涉及原生配置及 ID 映射、现有 Kotlin Agent 事务联动的接入保留为 PC 迭代项。

2026-10-07 PC 迭代：R1c PR #7 已验收合并；按工程审阅的首选切片完成 E1a（图层索引、轻量内部 token、差异缓存和稳定订阅快照）。Windows 构建、39 项回归及真实 Python 保存/Edge 编辑流程通过。E1a 仍保留整份候选 IR 和历史；有界 patch 历史、像素失效/总预算属于后续 E1b/E2，不能将本轮描述为全部增量编辑已完成。详见 [交接第 23 节](HANDOFF.md)。

同日继续完成 E1b：命令只复制目标图层与字段，历史记录受影响图层前后状态并限制撤销/重做合计 100 步及 16 MiB 序列化负载，超预算不会丢失当前编辑。新增状态统计和历史限制提示，42 项回归及实际 Edge/Python 编辑/保存流程通过。订阅和公开响应仍保留完整隔离快照；E2 的像素失效、任务取消及渲染总预算尚未实施。详见 [工程审阅](ENGINEERING_REVIEW_R1.md) 和交接第 24 节。

同日完成 E2：美术像素身份与编辑 token 分离，复用最近两幅完整成图；素材串行解码，共享缓存/活动缓冲/编解码/传输预算，显示任务取消和有界截图队列。Windows 构建、45 项回归和实际 Edge/Python 流程通过，注记修改无显示任务、完整 PNG 对照一致、队列/预算失败后恢复，拖拽/保存/历史及窄屏流程通过。预算是保守受管工作量，不是整个浏览器内存承诺；详情见工程审阅 E2 实施和交接第 25 节。继续 E3–E6 和 R2–R8，原生与项目交付尚未完成。
