# live2d-maker：上游调研与源码阅读索引

资料核查时间：北京时间 2026-10-08。
性质：只读调研；没有修改仓库，没有在本轮构建、运行模型、执行测试或测量显存。

## 1. 本仓库核查基线

仓库：https://github.com/linnnn89/live2d-maker

main 固定提交：`b56e2d656b1107ea805c1082cfe31b43e3696753`
提交时间：2026-10-07 12:46:07 UTC（北京时间 20:46:07）。
提交标题：`fix: Windows workspace lifecycle and streaming delivery (#33)`。

本轮实际读取了 README、PLAN、authoring-rig schema 说明、第三方依赖说明，以及 RigBuilder、AdaptiveMeshGenerator、Pose QA、See-through 推理入口等选定源码范围。不是逐行全仓审计。

已具备、不要重新当作新增需求：

* 浏览器 Studio、工程修订、PNG 导入预检、原始素材保护、部件语义/左右侧覆盖、构建与真实 Cubism 预览。
* 美术侧 authoring-rig.json，含部件 ID、几何、landmarks、semantic confidence 与 provenance。
* 原生 RigEditOverlay / RigAuthoringJournal 与严格基线、重放、失败保留已成功版本。
* 实际 CMO3/MOC3 导出、Pose QA、交付包动态预览。
* 随仓 See-through；推理入口已有 group_offload、resolution_depth。
* AdaptiveMeshGenerator 已处理轮廓、孔洞、分离岛、窄条路径与网格质量问题，不是待补一个普通 Delaunay 的空壳。

关键边界：美术 IR 不应承载 native parameter / keyform / deformer / physics；landmarks 目前主要存储位置，尚不能等同于原生绑定输入。

固定版阅读入口：

- README：https://github.com/linnnn89/live2d-maker/blob/b56e2d656b1107ea805c1082cfe31b43e3696753/README.md
- PLAN：https://github.com/linnnn89/live2d-maker/blob/b56e2d656b1107ea805c1082cfe31b43e3696753/docs/PLAN.md
- 美术 IR：https://github.com/linnnn89/live2d-maker/blob/b56e2d656b1107ea805c1082cfe31b43e3696753/schemas/authoring-rig/README.md
- RigBuilder：https://github.com/linnnn89/live2d-maker/blob/b56e2d656b1107ea805c1082cfe31b43e3696753/psd2live/src/main/kotlin/io/github/psd2live/core/RigBuilder.kt
- 自适应网格：https://github.com/linnnn89/live2d-maker/blob/b56e2d656b1107ea805c1082cfe31b43e3696753/psd2live/src/main/kotlin/io/github/psd2live/core/AdaptiveMeshGenerator.kt
- Pose QA：https://github.com/linnnn89/live2d-maker/blob/b56e2d656b1107ea805c1082cfe31b43e3696753/live2d-viewer/qa.py
- See-through 推理：https://github.com/linnnn89/live2d-maker/blob/b56e2d656b1107ea805c1082cfe31b43e3696753/see-through/inference/scripts/inference_psd.py
- 第三方边界：https://github.com/linnnn89/live2d-maker/blob/b56e2d656b1107ea805c1082cfe31b43e3696753/docs/THIRD_PARTY.md

## 2. 候选仓库快照

Star 与 pushed_at 来自核查时 GitHub API。下列日期使用 UTC，避免与北京时间混用。
`pushed_at` 是仓库推送时间，不保证是主分支功能提交。没有获取完整 star 历史，不把单次 star 数量当作增长曲线。

| 仓库 | Star | 最近推送 UTC | 根许可证/注意事项 | 定位 |
|---|---:|---|---|---|
| Acly/krita-ai-diffusion | 10673 | 2026-10-03 | GPL-3.0 | 高星、活跃；局部生成与候选结果工作流 |
| artem-ogre/CDT | 1454 | 2026-09-21 | MPL-2.0 | 网格鲁棒性参考与差分测试对照 |
| rive-app/rive-runtime | 1197 | 2026-10-07 | MIT | Golden image 与运行时回归方法，不建议替换 Cubism |
| nijigenerate/nijigenerate | 310 | 2026-10-07 | BSD-2-Clause | 活跃的二维绑定编辑器；建模工具和层级变形经验 |
| shinshin86/mesh-avatar-studio | 459 | 2026-10-07 | MIT；示例角色另外授权 | 2026-10-04 新建；已被你的 PLAN 引用，不算首次发现 |
| Ariakage/live2d-agent-kit | 23 | 2026-09-12 | 独立脚本 MIT；补丁、SDK、素材分别核对 | 极贴近现有 PSD2Live 主线；新项目、持续维护尚待观察 |
| RevStudio/Rev2D | 6 | 2026-10-06 | MIT | 2026-09-25 新建；Agent/关键点/变体交互实验参考 |
| jtydhr88/ComfyUI-See-through | 824 | 2026-08-20 | README 的许可表述仍应与具体文件核对；API license=null | 现有 See-through 的社区部署对照，不是新拆图算法 |
| QwenLM/Qwen-Image-Layered | 2127 | 2025-12-31 | Apache-2.0；模型权重另核 | 高星分层研究基线；该仓库不能称近期持续提交 |
| Inochi2D/inochi-creator | 1239 | 2025-06-16 | BSD-2-Clause | 成熟架构参考；不能因 updated_at 很新就称活跃 |

仓库地址：

- https://github.com/Acly/krita-ai-diffusion
- https://github.com/artem-ogre/CDT
- https://github.com/rive-app/rive-runtime
- https://github.com/nijigenerate/nijigenerate
- https://github.com/shinshin86/mesh-avatar-studio
- https://github.com/Ariakage/live2d-agent-kit
- https://github.com/RevStudio/Rev2D
- https://github.com/jtydhr88/ComfyUI-See-through
- https://github.com/QwenLM/Qwen-Image-Layered
- https://github.com/Inochi2D/inochi-creator

API 复核方式：以上仓库地址替换为 `https://api.github.com/repos/OWNER/REPO`，核对 stargazers_count、created_at、pushed_at、license、default_branch；不要用 updated_at 替代源码维护证据。

## 3. 最有价值的源码入口

### A. Krita：局部请求、候选结果、选择性采纳

已读：`ai_diffusion/model/jobs.py` 的 JobRegion / JobParams / Job / JobQueue 定义。

https://github.com/Acly/krita-ai-diffusion/blob/main/ai_diffusion/model/jobs.py

精华：任务记住目标 layer_id、bounds、prompt、seed、模型与采样元数据；多个结果保留为候选，生成结束不等于自动覆盖美术。

迁移建议：接现有 import-generated、保护遮罩、provenance、WorkspaceService，而不是另建持久化系统。最终只合成允许修改区域，不能仅相信模型遵守提示词。

### B. Mesh Avatar Studio + Rev2D：关键点和画好的表情变体

https://github.com/shinshin86/mesh-avatar-studio/blob/main/README.md
https://github.com/shinshin86/mesh-avatar-studio/blob/main/docs/agent-guide.md
https://github.com/shinshin86/mesh-avatar-studio/blob/main/docs/rig-fields.md

Rev2D 本轮固定阅读提交：`f144581cdf1f12d781379c4df90d262b8c2dfa3d`

https://github.com/RevStudio/Rev2D/blob/f144581cdf1f12d781379c4df90d262b8c2dfa3d/docs/AVATAR.md

精华：原图坐标系的精确关键点；局部放大坐标格；图像左右与角色左右显式区分；绘制闭眼/元音嘴形；变体请求与导入检查。

迁移建议：仅将经过确认的 landmarks 适配成原生构建提示；绑定结果仍由 Kotlin/native 管线产生。不要把这两个项目的 rig JSON 塞进美术 IR，也不要认为 Rev2D 的 Live2D JSON 互操作等于读写 MOC3。

最小原型：一只眼睛、一个闭眼变体、一组现有 EyeOpen 参数。新增部件按正常完整重建流程处理，不能放宽 Overlay 的基线与拓扑检查。

### C. nijigenerate：工具可用性、目标图引导、嵌套变形

版本说明及功能索引：
https://github.com/nijigenerate/nijigenerate/releases

实际核对的近期修复：
https://github.com/nijigenerate/nijigenerate/commit/3d266c31022bcff05660975734836572e96b742b

修复位置：`source/nijigenerate/commands/depth/bone.d`，嵌套 Grid 不应切断外层 Grid 的影响。

目标图功能：
https://github.com/nijigenerate/nijigenerate/pull/143
https://github.com/nijigenerate/nijigenerate/blob/3d266c31022bcff05660975734836572e96b742b/source/nijigenerate/viewport/common/mesheditor/tools/brush.d

本轮读取了 Teacher Part 的 UI 接入与相关提交，不等于完整审计其拟合算法。

迁移建议：将路径/教师图/镜像编辑的操作体验转成现有 native 支持的 warp/keyform 编辑；不引入 nijilive 运行时或默认承诺其专有节点可无损导出到 Cubism。

### D. Rive + live2d-agent-kit：让质量检查可重复

https://github.com/rive-app/rive-runtime/blob/main/README.md
https://github.com/rive-app/rive-runtime/tree/main/tests

Rive 用已知场景渲染与参考图差异做主要回归方法。

https://github.com/Ariakage/live2d-agent-kit/blob/main/docs/verification.md
https://github.com/Ariakage/live2d-agent-kit/blob/main/docs/reproducibility.md
https://github.com/Ariakage/live2d-agent-kit/blob/main/docs/tooling.md
https://github.com/Ariakage/live2d-agent-kit/blob/main/scripts/render_core.sh
https://github.com/Ariakage/live2d-agent-kit/tree/main/examples/minimal-model

注意：kit 的 render_core.sh 明确是官方 Core 算几何、Java2D 近似画图，不是官方 Cubism 渲染器；不能用它代替你已有的实际 Cubism/WebGL 视觉验收。

应借用：原创几何最小样例、参数实际作用检查、组合姿态、低清/高清模型结构身份、资源哈希与测试范围的明确记录。

提议扩展你已有 QA：自动产生与模型实际参数范围对应的组合；固定时间步动态序列；同后端/同版本 golden；非有限顶点、越界索引、可见区域翻转和非预期透明度检查。闭眼/隐藏层的退化三角形不能一刀切判错。

### E. CDT：作为网格对照，不先替换 Kotlin 网格器

https://github.com/artem-ogre/CDT
https://artem-ogre.github.io/CDT/

精华：稳健 orientation / in-circle 谓词、约束边、孔洞处理、退化输入、角度/面积质量控制。

建议：制作细发丝、环形饰物、近接不连通岛、薄缝、共线点的合成测试集，比较约束保持、面积覆盖和异常行为；有效三角剖分不唯一，不能把顶点/三角形逐项不同当作失败。

### F. 已有 See-through 的社区对照

https://github.com/shitagaki-lab/see-through
https://github.com/jtydhr88/ComfyUI-See-through/blob/master/nodes.py

本轮确认社区封装有 tag embedding 缓存、text encoder 卸载、分阶段模型驻留等实现。你随仓推理入口已经有 group_offload 与独立 resolution_depth。

因此先做当前版本差异核查，再决定是否借用驻留/缓存策略；没有本机测量，不承诺节省多少显存或加速多少，也不建议为了这些开关强制增加整个 ComfyUI。

### G. Qwen-Image-Layered：低优先级替代分层候选

https://github.com/QwenLM/Qwen-Image-Layered
https://arxiv.org/abs/2512.15603

精华：可变数量的 RGBA 分层、递归拆分、单层编辑。
边界：官方明确提示词描述整张图，不用于精确控制每层语义；没有直接获得 Live2D 眼白/虹膜/上下睫毛等正确拆分与绑定的保证。

建议只在复杂服饰/配件或现有 See-through 失败样例中比较，输出仍经同一个美术 IR 和导入预检，不替换主要建模管线。

## 4. 研究观察，不计入可接入开源实现

Bunraku：
https://github.com/SparcAI-Inc/Bunraku
https://bunraku-live2d.github.io/
https://arxiv.org/abs/2607.27348

本次可见官方仓库仅 1 次提交与 readme.md，没有可供本轮复现的公开实现。项目页关于方法效果、与其他方法的对比均为作者材料，不是独立复现。

可保留的研究问题：分层如何在运动中验收；多参数位移叠加的稳定性；冻结几何后仅修改贴图。不能写成“下载即可接入完整 Bunraku”。

## 5. 建议实施顺序（不是已执行任务）

1. 先做最小回归样例与针对性组合姿态，为后续改动建立比较基线。
2. 原生 landmark 适配：先眼、嘴，再考虑发根/颈部；无 landmarks 时结果不变，非法输入显式失败或回到已定义的自动模式。
3. 一个局部绘制变体：保护区域逐像素不变，正常原生重建，当前成功版本可恢复。
4. 再验证目标图引导的局部 keyform 修正与路径工具；只采用可以被当前 Cubism 导出路径表达的操作。
5. 薄结构网格差分测试与确定性构建；有可测失败才评估改算法。
6. 贴图画质升级：显式锁定几何、UV、图集布局与绑定身份，禁止“顶点数相同就算兼容”。
7. 额外拆图模型和大规模自动拟合，等前述路径能量化比较后再评估。

总原则：参考优秀项目的解决办法，不搬入第二套世界坐标、第二份 rig 真相或第二个运行时。

## 6. 证据限制

Star 是单次快照；小仓库未证明长期维护。第三方作者的测试数量和性能记录未在本轮复跑。不同仓库的 MOC3、CMO3、JSON、INP/R2D 等产物并不自动兼容。根许可证不自动覆盖第三方补丁、角色图片、模型权重或 Cubism Core。你的 THIRD_PARTY 文档已明确记录 native renderer 桥接源代码/重建与 SDK 再分发核查事项，发布前应保留这一检查环节。
