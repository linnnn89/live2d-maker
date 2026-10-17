# Live2D 制作教程对照评审与后续计划

日期：2026-10-13。代码基线：`main@930d02b`，已包含 Windows MCP 修复 [PR #35](https://github.com/linnnn89/live2d-maker/pull/35)。Q1 的 [PR #34](https://github.com/linnnn89/live2d-maker/pull/34) 在本次核对时仍为 Draft/Open，单独参考其 `e3e569f` 实现，不能当成 main 已有功能。

本轮搜索并阅读官方图文教程、官方视频教程页的文字回顾、社区讨论和制作者公开介绍，再对照本仓库源码。没有观看完整视频、购买或下载教学工程，没有运行 Windows、原生构建或实际渲染。下文区分源码事实、教程启发和待验证建议；不把源码中存在的算法当成效果已验收。

第 1–7 节保留初次评审与计划；用户授权后的 U0/U1 实施结果见第 8 节。原生效果与 Q1 的 PC 验收仍未在本轮完成。

## 1. 结论与对原计划的修正

值得优化，但当前主要机会是**让现有制作能力更容易被正确使用和检查**。项目已经有局部眼睛闭合、眼白裁剪、头部与五官分级变形、二维嘴形、轮廓网格、局部形变、父级链检查和动态预览。教程没有提供重写绑定架构、换网格引擎或增加 Agent 框架的理由。

第一性原理是：模型效果依赖可用素材、正确绑定及形变、组合姿态下的实际表现。先判断问题在哪一层，再改对应部分。参数存在、导出成功、截图成功都不等于动作有效或视觉质量合格。

对 [10 月 8 日计划](https://github.com/linnnn89/live2d-maker/blob/e3e569ffec7f5248198b382755006a61957e7889/docs/NEXT_ITERATION_PLAN_2026-10-08.md) 作如下调整：

- 保留 Q1 的实际参数范围、缺项处理及少量组合检查；先对齐最新 main，再完成其 PC 验收。
- 将 V1「单眼闭眼 PNG」改为**可选的素材变体用例**。官方常规闭眼路径是睫毛形变与眼白裁剪；先检查本项目已有几何闭眼。独立闭眼绘图适用于明确需要不同线条或表情的画风，不是所有模型的必经阶段。
- 新增优先项：校准 Agent 制作参考、提示有证据的素材依赖缺项、补嘴形与视线的针对性检查。
- landmark、局部网格与 Studio 几何编辑仍按具体阻碍选择，不自动展开成多条并行工程。
- 目标仍是制作软件和工具；小样例用于验证功能，不开展完整角色的逐部件美术修复。

## 2. 教程与当前实现的对照

| 教程中可借鉴的方法 | 本项目现状与证据 | 实际优化方向 |
|---|---|---|
| 预先分离需要独立动作的部件，补足被遮挡的区域；编辑 PSD 与导入 PSD 分开 [S1][S2] | [exporter.py](../tools/authoring_rig/exporter.py) 已拒绝分组、蒙版、效果、裁剪和非正常混合等无法表达的 PSD；[issues.py](../tools/authoring_rig/issues.py) 主要报告未知分类、Overlay 与构建问题 | 补充如何从编辑稿生成兼容导入稿的说明，以及虹膜缺少眼白等非阻断提示；不自动破坏性合并用户源文件 |
| 睫毛闭合、眼白遮罩虹膜，并检查中间状态 [S3][S9] | [EyeRigGenerator.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/EyeRigGenerator.kt) 已生成局部闭眼关键形；[DrawableBuilder.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/DrawableBuilder.kt) 已建立虹膜裁剪、独立闭眼图层透明度 | 先看现有闭眼在默认与转头时是否正确；出现双线或漏白才定向修正，不默认追加一张闭眼 PNG |
| 表情放在局部，转头由父级负责；自动四角之后仍要检查 [S4] | [HierarchyBuilder.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/HierarchyBuilder.kt) 已有头部、五官区域与视线层级 | 保留层级，检查转头＋半闭眼、视线＋闭眼；不把所有头部参数复制到每个局部网格 |
| 嘴形与开合是不同维度 [S7] | [MouthRigGenerator.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/MouthRigGenerator.kt) 已有 MouthForm × MouthOpen、9 × 33 个关键形及嘴唇轮廓处理；main 的 QA 与 Q1 均未采样 MouthForm | 添加可选择的嘴部小联系表；不新增元音绑定引擎，也不因关键形多就无测量地删减 |
| 眼嘴的拓扑和控制线应适应形变方向；局部控制比全局加密更有针对性 [S5][S6] | [AdaptiveMeshGenerator.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/AdaptiveMeshGenerator.kt) 已处理轮廓、孔洞、分离岛和细条；[RigGeometryTools.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/RigGeometryTools.kt) 已有 curve、bend、landmarks 与作用范围 | 先用现有局部工具修一个失败姿态；只有明确是拓扑问题，才调整相应网格分支 |
| 物理要结合输入、输出和实际播放调节 [S10] | [ViewerAdapter.ts](../studio/src/viewer/ViewerAdapter.ts) 与 [viewer](../live2d-viewer/index.html) 已有固定步长、重置和播放能力；Agent 的 physics 工具也提示先建立输出端点形状 | 先检查输出参数两端是否合理，再使用已有动态预览；不新增物理引擎或时间轴 |

官方教程中也有针对具体素材的取舍：例如嘴部用肤色遮盖还是裁剪，取决于画风和素材结构。[S1] 不能被简化成“所有口腔都禁止裁剪”；当前口腔裁剪也不能仅因另一种教程做法就判错。

## 3. 对 Agent 最有价值的两处改进

### 3.1 先修知识冲突，再增加工具

[deep-live2d-workflow.md](../skills/live2d-studio/references/deep-live2d-workflow.md) 同时出现了「交叉淡入用 UNKNOWN」和「保留 MOUTH_OPEN」的描述；[嘴部配方](../skills/live2d-studio/references/deep-live2d-psd2live-mouth-pipeline.md) 又把 UNKNOWN 写成必须。这两种配置分别可能用于只做透明度切换、或保留口腔形变的不同目标，不能都写成通用终态。

旧配方还把 `buildChannels` 等实现定位到拆分前的 RigBuilder，并把闭嘴概括为固定残留 1.25 px。当前实现位于 DrawableBuilder / MouthRigGenerator，`exactClose` 分支可令闭合比例为零；`mouthOutlineEnabled` 默认开启，并影响嘴唇拆分和闭合。旧案例的尺寸、画风和交叉淡入判据，不能直接推广到当前所有构建设置。

这比再加一个 MCP 工具更值得先做：错误的操作知识会让 Agent 使用正确的工具实施错误修复。

建议收敛为一份短的现行操作说明，旧案例保留素材、版本和配置前提。说明应从当前 `inspect` 结果出发：确认部件与绑定 → 固定镜位观察相关姿态 → 修改一个局部问题 → 比较 → 接受或恢复。现有配准与同镜位对比经验继续复用，不再重复建立一套流程。

### 3.2 区分“参数声明”“对象绑定”和“可见动作”

[RigBuilder.kt](../psd2live/src/main/kotlin/io/github/psd2live/core/RigBuilder.kt) 总会把 `StandardParameters.all` 放入模型。因此，有眼睛或头发参数，并不证明模型真的含有相应部件或动作。

[AgentAuthoringTools.kt](../psd2live/src/main/kotlin/io/github/psd2live/agent/AgentAuthoringTools.kt) 的 `inspect(target)` 已返回直接几何轴、通道轴和父级继承参数；`parameter` 的工具说明也已经明确“单独创建参数不产生动作”。这些能力应被工作流使用，不需要重新开发绑定查询系统。

Q1 的 `sampledParameters` 只表示检查规格改变过哪些参数。后续报告和 Agent 说明应保留这个准确含义：

- 参数声明决定合法取值；对象及父级绑定解释预期影响。
- 绑定存在仍不能证明关键形有差异、部件可见或结果符合美术要求。
- 没拿到绑定证据时写“未确认”，不能写“不存在”；全身图没有明显变化也不能直接判绑定坏了。

近期不删除标准参数，也不增加全工程“能力图谱”。原生 Agent 已可按目标查询；Studio 若将来需要展示绑定，先确认现有报告够不够，再决定最小接线范围。

## 4. 后续实施顺序

以下 U 编号用于本次教程评审，避免与旧计划 Q1 / V1 / T1 混用。各阶段只交付具体问题的最小解。

### U0：校准制作说明与 Agent 操作依据（云端优先）

- 更新现行代码位置；为纯透明度变体与连续几何嘴形分别写清适用条件。
- 将旧角色的 4–5 px、特定宽高比、必须圆嘴等数值保留为案例，不作为所有模型的验收阈值。
- 给出基于现有 `inspect`、`view`、`form/deform`、`revision` 的一条局部修正示例。先检查直接轴和父级；确实需要独立运动时才用 `fit_local`。
- 原生示例命令未在当前 PC 运行的，标注待验证；不在文档中猜测工具字段或宣称操作已通过。

验收：同一目标不会得到互相矛盾的必选配置，说明与当前函数及配置相符。无需新增运行时依赖或重写历史记录。

### U1：在已有问题列表补少量素材依赖提示（云端可实施）

从 `issues.py` 开始，只处理当前构建规则能证明的情况：虹膜找不到可用的同侧/通用眼白，或牙齿、舌头找不到可匹配的口腔主体。提示用户检查分类、左右侧或补充素材，并定位对应部件。

优先依据当前构建实际采用的分类和侧别；尚未构建或结果过期时，若依据导入分类判断，必须明确为预检查，不能冒充最终绑定结论。匹配规则与 DrawableBuilder / MouthRigGenerator 一致；不能只看原始自动分类而忽略 override。

验收只需有意义的小用例：有效匹配不提示、依赖确实缺失时提示、override 与过期构建不误用。无头发、单眼和纯图层切换模型不得被完整人形模板强制报错。无法从现有分类确认的特殊模型保留人工检查，不扩张通用规则引擎。

这些是**非阻断建议**，不改现有导入契约或交付规则。不能凭包围盒证明遮挡区没有补画；此类问题通过素材隔离与动作预览观察，不新增“完整度评分”。

### U2：接续 Q1，检查当前漏掉的动作组合（纯规格可云端，效果在 PC）

前置：Q1 对齐 main@930d02b，并完成既定 PC 渲染验收；本评审不代替该验收。

1. 给嘴部提供可选择的小联系表：MouthForm 的实际 min/default/max × 有效的开合状态，通常最多 9 格，重复状态去重。
2. 给眼部选择少量相关组合：左右/上下视线与半闭眼，以及转头下的闭眼。沿用当前参数范围和既有组合，不把所有维度做笛卡尔积。
3. 约定 0/0.5/1 只有在对应标准参数的有效范围内才作为动作采样；不把任意 min 命名为“闭合”。自定义参数沿用用户指定规格。
4. Agent 先用已有 `view` 的固定画布裁区和相关图层查看。Studio 是否需要新增入口，由这条操作是否繁琐决定，不先统一两套渲染服务。

验收：合法参数与小型规格的选择逻辑可在 Linux 检查；真实 Cubism 的嘴形、眼白/虹膜关系、中间状态及转头组合必须在 PC 看图确认。报告分别写清“采样了什么”和“观察到了什么”，不新增自动美术通过率。

### U3：只在现有操作确实繁琐时，补 Studio 局部编辑入口（涉及原生接线时到 PC）

[RigEditPanel.tsx](../studio/src/model/RigEditPanel.tsx) 当前面板主要提供不透明度关键形与删除操作；原生 Agent 已能做更多几何修改。这是入口可用性的差距，不是缺少底层形变算法。

先选一个真实需求，例如调整闭眼线弯曲或嘴角位置。若 Agent 现有工具已能方便完成，就只交付示例；若用户需要直接拖动，再考虑“选部件 → 选已有姿态 → 一个局部控制 → 预览 → 接受/撤销”。不同时增加网格点编辑器、时间轴和通用节点系统。

不能把“有 MCP 工具”当成“Studio 已有对应 API”。接入前明确坐标、直接关键形轴、Overlay/Journal 与历史路径；新增原生调用、导出或兼容性行为时，留到 Windows 修改和端到端验证。

### U4：只有复现缺陷后，才改眼部形变、网格或物理

先用一个小样例区分素材、语义、层级、形变和拓扑问题。已有 curve/局部形变能修的，不先重建网格；关键姿态正确后，再看是否需要过渡关键形。独立闭眼 PNG 仅在明确需要这种美术表达时试用。

验收围绕同一输入和镜位的前后对比：闭眼线是否连贯、虹膜是否正确裁剪、转头时是否脱离、其他姿态是否受损。任何 Kotlin 绑定、拓扑、裁剪或动态行为的变更，在真实 Windows 链路完成。

## 5. 时序、资源与停止条件

- U0/U1 是说明和只读诊断，不应修改 IR、产生历史节点或触发重建。复用已读取的分类，不为诊断重新解码全部纹理。
- 新的局部预览沿用现有工作区所有权和释放路径；查看时的隔离图层状态不写成永久可见性修改，不建立常驻截图缓存。
- Agent 基于 revision A 提案，用户改为 B 后，A 不可直接 apply；重新读取 B 并评估，不能只替换 token。继续使用已有版本/历史与生命周期检查，不另造任务总线。
- #35 已验证旧 HTTP 删除请求跨关闭/重开被拒绝，不能把这一项再次列为完全未测。GUI 关闭导致的传输取消、桌面逐控件交互等仍按已有记录保留边界。
- 每阶段解决了目标问题即停止。没有失败样例，不启动 CDT 替换、通用 landmark 协议、全角色生成、额外物理系统或素材质量评分。

建议下一批顺序：**U0 → U1；Q1 在 PC 验收后接 U2。U3/U4 由实际使用暴露的主要问题二选一，不默认全做。**

## 6. 来源与适用范围

以下页面访问于 2026-10-13。技术机制主要依据官方资料；社区帖子用于确认制作中会出现的问题，不用于证明本仓库存在同一缺陷。

- [S1：官方「Illustration Processing」](https://docs.live2d.com/en/cubism-editor-tutorials/psd/)：拆分可动部件、补画遮挡区、眼口素材准备。
- [S2：官方「Preparing the Material for Import」](https://docs.live2d.com/en/cubism-editor-manual/divide-the-material/)：编辑用 PSD 与导入用 PSD 的分工。
- [S3：官方「Adding Facial Expressions」](https://docs.live2d.com/en/cubism-editor-tutorials/expression/)：眼睛开合、眼白裁剪及嘴部形变。
- [S4：官方「Adding XY Movement」](https://docs.live2d.com/en/cubism-editor-tutorials/xy/)：父级转头、局部表情和四角检查。
- [S5：官方「Manual Editing of Meshes」](https://docs.live2d.com/en/cubism-editor-manual/mesh-edit-manual/)：需要细致变形的眼嘴适合定向调整网格。
- [S6：官方「Deform Path」](https://docs.live2d.com/en/cubism-editor-manual/deformpath/)：沿形状安排控制点及控制影响范围。
- [S7：官方「Standard Parameter List」](https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/)：开合、嘴形、视线等标准参数的含义及范围惯例。
- [S8：官方「Creating AIUEO Mouth Shapes」](https://docs.live2d.com/en/cubism-editor-tutorials/mouth-aiueo/)：后续嘴形学习入口；本轮仅阅读页面介绍，未据未观看的视频推导算法。
- [S9：官方「Clipping Mask」](https://docs.live2d.com/en/cubism-editor-manual/clipping-mask/)：裁剪用途与检查方法，不据此给不同后端硬编码统一蒙版预算。
- [S10：官方「Physics Settings」](https://docs.live2d.com/en/cubism-editor-manual/switch-viewer-setting/)：物理预览与设置；结合当前项目已有动态能力使用。
- [S11：Reddit「How to make eyes blink when head is moving?」](https://www.reddit.com/r/Live2D/comments/tm1gnn/new_to_live2d_how_to_make_eyes_blink_when_head_is/)：正面闭眼正常、转头后出错的实际求助；支持优先检查组合姿态，不证明本项目必须重构层级。
- [S12：KuroAma「Live2D Hair Physics Example Project + Tutorial」](https://kuroama-cozy-forge.itch.io/live2d-hair-physics-example-project-tutorial)：公开介绍覆盖网格、层级、绑定与物理；未获取付费工程，未验证其具体设置，不列为集成依赖。

## 7. 初次评审交付

初次评审新增本文，并在 PLAN 中加入入口与新的优先级，当时仅修改文档，U0–U4 均为后续建议。后续授权实施的范围与验证单独记录如下。

## 8. U0/U1 实施结果（2026-10-13）

基线仍为 `main@930d02b`。U0/U1 已在云端实施，代码范围仅为 `tools/authoring_rig/issues.py` 的只读诊断；Kotlin、原生构建/导出、前端协议和模型素材均未改变。

### U0：完成

- 校准嘴部深参考、总流程及直接引用它的两份操作手册和分诊入口，避免上层仍把交叉淡入或固定 seam 当作默认修复。
- 分开连续几何、几何＋渐显、纯绘图切换；说明 UNKNOWN 对语义、裁剪和 Studio 现有交付门禁的影响。旧像素尺寸与画风偏好保留为有范围的案例。
- 在现有 MCP_AUTHORING 第 6 节添加局部关键形修正示意，复用直接轴、继承轴、固定裁区与历史；明确观察 A 后用户改到 B，不能换 state 重发迟到提案。示例字段已核对源码，实际素材效果待 PC 验证。
- Studio 使用说明补充编辑 PSD 与导入 PSD 分开保存的方法，以及新增提示的含义和边界。

### U1：完成，范围主动收敛

新增 `MISSING_EYEWHITE` 与 `MISSING_MOUTH_APERTURE` 两类 warning，沿用现有 ModelIssue 与“定位图层”按钮，不增加 API、持久字段或阻断导入/交付的规则。已有错误保持在提示之前。

仅采用 **base_rig 未过期的构建报告中实际有 drawable 的分类**。眼白匹配遵循同侧→NONE；口腔匹配最终允许任意侧的 MOUTH / MOUTH_OPEN，MOUTH_CLOSE 不算口腔主体。同一源部件拆分后的同类提示去重，空图层不作为依赖或警告目标。

实施时没有增加导入预检查：原生会拆分左右部件、采用 override 并跳过空层，仅按导入分类推测容易误报。未构建、结果过期或缺少 drawable 证据时不推断缺项；等真实构建后提供建议。查询不修改 IR/历史、不发起构建、不读取纹理，新增工作仅随分类数量线性增长。提示针对基础模型，不声称证明最终 Overlay 或视觉效果错误。

### 验证与边界

- 新增 5 项回归：眼白侧别及 NONE 回退、口腔跨侧回退与闭嘴线区别、空层与拆分去重、缺证据/单眼/无头发、真实工作区 override→当前提示→下一 revision 失效。
- 23 项纯 Python 检查通过，包含上述 5 项、工作区存储/查询、导入/保存、模型签名和 5 项纯 stale/Overlay 用例。快照重复读取的文件内容与输入对象保持不变；新 issue 符合既有协议。
- 初次扩大测试时选中了 `test_native_overlay_sections_and_upstream_changes`，其原生段因 `No module named 'jpype'` 失败；未安装原生依赖，也未将它计入通过项。该用例及实际 Windows 渲染不在本批云端验收范围。
- 制作技能结构检查最终 0 失败/0 警告。检查发现旧 HANDOFF 第 50 节记载的机器绝对路径触发已有规则，已改为等义问题描述，保留历史事实。
- 未修改前端组件或协议，不以本轮 Python 检查代替浏览器、GUI 或原生渲染验收。

可复跑命令：

```bash
python -m unittest tools.authoring_rig.tests.test_issues tools.authoring_rig.tests.test_workspace_store tools.authoring_rig.tests.test_studio tools.authoring_rig.tests.test_signatures -v
python -m unittest tools.authoring_rig.tests.test_stale -k test_case_ -v
python skills/live2d-studio/scripts/check_routing.py
```

下一步保持 U2 的前置条件：Q1 #34 对齐主线并在 PC 完成既定渲染验收，再增加少量嘴形/视线组合。U3/U4 仍按实际阻碍选择，本次不提前修改原生形变。
