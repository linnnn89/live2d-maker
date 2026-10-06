# 开发计划与当前状态

更新于 2026-10-05。目标是完成 PSD 编辑、素材导入、Live2D 重建和验证这些软件功能。角色素材只作为测试样本，不要求逐类制作完整角色。

设计参考：[Mesh Avatar Studio](https://github.com/shinshin86/mesh-avatar-studio)。安装与使用见 [环境说明](environment.md) 和 [Studio 使用说明](../studio/README.md)；历史验证记录见 [HANDOFF.md](HANDOFF.md)。

后续代码架构、模块职责、产品功能与编辑器交互的更新建议，见 [架构与产品迭代计划](ARCHITECTURE_PRODUCT_PLAN.md)。建议基于代码阅读，按编辑反馈、能力接入和项目交付的优先级实施。

R1a 已完成浏览器预览适配器、参数按帧重绘和模型来源标识；Linux 前端构建、7 项适配器回归及 Chromium 交互检查通过。原生建模和 Windows 调用链的变更留待 PC 实测，见交接记录第 20 节。

## 0. 数据与实现边界

```text
分层 PSD / PNG 清单 → authoring-rig.json → PSD → PSD2Live → moc3 → 姿态检查
                                                  ↑
                                   RigEditOverlay / RigAuthoringJournal
```

| 数据 | 用途 | 说明 |
|---|---|---|
| `authoring-rig.json` | 图层、栅格、裁切轮廓、标记点和来源 | 格式见 [IR 文档](../schemas/authoring-rig/README.md) |
| Overlay / Journal | 参数、变形器、关键形和物理编辑 | 由 PSD2Live 原生实现应用；不写进 artwork IR |
| `.moc3` 与运行时文件 | 预览和导出检查 | 通过 Cubism 实际加载、渲染后判断结果 |

IR 不包含 parameter、deformer、keyform、physics 字段。不引入另一套动画或网格引擎，也不通过修改渲染器掩盖模型问题。源 PSD、源 PNG 与旧成功产物保留，编辑结果写入独立工作区。

## 1. 分阶段

| 阶段 | 内容 | 当前状态 |
|---|---|---|
| P0 | viewer 资源、路径和取景修复 | 已验证 |
| P1 | 批量姿态渲染与失败报告 | 已验证 |
| P2 | Agent 视觉坐标校准 | 未实施；当前流程不需要 |
| P3 | PSD / PNG 清单与 artwork IR 转换 | 已验证限定输入格式 |
| P4 | 失效判断与原生 Overlay 重放 | 核心链路已验证；部分组合未验收 |
| P5 | Studio 编辑、保存、重建与预览 | 本地工作流已验证 |
| P6 | 透明素材导入与保护区检查 | CLI / Studio 已验证 |

### P0 viewer 与运行时

Cubism Web Core、Framework、着色器和测试模型已放在 `live2d-viewer/public/`。默认资源 URL、`pxPerCanvas` 和 `exact` 的单位换算已修复。`check_runtime.py` 校验文件与 Core 哈希，兼容 LF/CRLF。

viewer 通过 URL 的 `model` / `vendor` 参数加载资源，一页一个模型。API 和渲染规格见 [渲染工具说明](../skills/live2d-studio/references/deep-live2d-render-check-harness.md)。不再沿用不存在的旧模型路径或 `load()` 接口。

### P1 Pose QA

`live2d-viewer/qa.py` 输出姿态 PNG、联系表和 `review.json`，保存 spec、哈希、实际参数与镜位。未知或越界参数、空渲染均失败；失败会更新报告，不继承上次的成功状态。

独立 viewer 的默认 fixture 有 14 个姿态；Studio 根据当前模型生成 16 个姿态，头发项取自导出的 CDI。两者使用不同 spec，数量不能互换。静态姿态检查不等于物理播放或美术验收。

### P2 视觉坐标校准

尚未实现 `vision-check.py`。当前轮廓、取景范围和素材配准来自 PSD/PNG 像素测量，没有让 Agent 从图片估坐标，因此本阶段不阻塞现有工具使用。若后续加入视觉生成几何入口，再确定校准方法与验收阈值。

### P3 artwork IR

已提供 `export --psd|--manifest`、`validate` 和 `build-psd`。输入契约、ID、PNG 哈希、坐标和允许的 PSD 结构见 [IR 文档](../schemas/authoring-rig/README.md)。无法无损表达的结构会被拒绝。

PSD → IR → PSD 在 ds/tml 共 46 个图层上验证 RGBA、名称、位置、层序和合成图零差；PNG 清单路径也已验证。图层改名、重排后 ID 保持稳定。外部软件移除 XMP 时，不能保证恢复自定义 ID，应保留原 IR。

当前 `polygon` 会裁切 alpha；默认矩形不改变素材，收缩再扩张可从保留的原 PNG 恢复。`landmarks` 只保存标记，不驱动绑定。PSD2Live 仍通过图层名称分类，IR 的 semantic 不是独立的绑定编辑入口。

### P4 失效判断与 Overlay

`stale.py` 按字段签名判断下游是否需要重建：

| 修改 | 失效范围 |
|---|---|
| source hash | segmentation 及全部下游 |
| 画布、图层名称/数量/层序、素材、geometry、appearance | PSD 及下游 |
| 仅 semantic | base rig 及下游，PSD 不失效 |
| metadata / provenance | 不使产物失效 |

Overlay 状态为 `ok`、`needs-review`、`broken`。目标缺失或点数不符会拒绝应用；拓扑、静态形状或运行时证据不足时保留 `needs-review`。Python 预检不能单凭点数证明模型兼容。

`native-base` / `native-replay` 使用实际 PSD2Live 模型，比较有序顶点、UV、三角、静态形状、父子变形器、参数、关键形与运行时哈希。基线改变时不自动重放；更换应用 JAR 或资源 JAR 后应重新建立匹配的基线。

CLI 默认使用随仓应用 JAR；warps、physics、structure、authoringJournal 路径还须显式传入 `--native-jar`。Studio 优先选择本地构建 JAR。基础参数、关键形 set/copy/delete、Warp、结构与有序 Journal、物理导出已有真实导出/渲染用例。`fit_local` 有已记录的小幅回读与像素差，不能称为完全无损。

尚未逐项验证所有 owner/channel 和 Studio Overlay 组合；非空 assetLayers/calibrationLayerIds 等未支持部分仍返回 `needs-review`。Studio 没有 Overlay 冲突解决界面。

### P5 Studio

已验证图层列表、裁切轮廓和标记点编辑、版本检查、保存、原生重建、Cubism 参数预览、QA，以及基础 ArtMesh geometry/opacity Overlay 的成功、拒绝和恢复。

重建失败保留旧模型，失败状态刷新后仍可见，QA 不沿用旧成功结果。首次打开遇到 busy409 最多尝试三次，其他错误或重试耗尽后允许手动重开。参照图范围与成功模型范围分别保存，导入但未重建时保持旧模型镜位。

界面只在本地 Vite 服务中工作；`dist/` 不能独立执行 Python CLI。参照背景不会随裁切和隐藏操作实时合成，当前效果要看重建后的模型。操作细节集中在 [Studio 使用说明](../studio/README.md)。

### P6 素材导入

已提供 `import-generated` 和 Studio 的预检/确认入口。输入透明 RGBA PNG、画布大小二值 mask、放置矩形和生成说明；允许新增或按稳定 ID 替换。保护区内有像素变化即拒绝，不能裁掉违规像素来通过检查。

预检和取消不改活动 IR；确认再次核对版本、候选与素材哈希。成功导入保留原图、mask、说明、前后图和报告，旧模型/QA 标为待更新。mouth_open、tongue、upper teeth 是已经使用的测试样本。

CLI 和界面不调用生成 API，不自动绘制 mask，也不处理全尺寸不透明 inpainting 的背景分离。素材的最终美术效果需另行判断，不属于本软件阶段完成的前提。

## 2. 已定决策

- CLI 向 stdout 输出 JSON，诊断写 stderr，失败返回非零退出码。
- Studio 的 Vite 中间件只转发白名单命令，业务逻辑在 Python / PSD2Live 中；不另建后端服务。
- 服务只监听 `127.0.0.1:5173`，检查 Host/Origin；子进程使用参数数组，不拼接 shell 命令。
- 写入串行化并检查工作区锁、revision 和素材哈希；保留源文件与上一份成功产物。
- 数字、参数存在或构建成功不能代替实际模型加载与渲染验证。

## 3. 验证与尚未覆盖的部分

最新应用验证记录为 2026-10-05 的原生运行时交付：Python 19/19；Kotlin 202 项、0 失败、0 错误、1 跳过；原生会话和 portable classpath 均实际加载、渲染通过。对应记录见 [交接记录](HANDOFF.md)。这些是当时运行结果，本文件整理不代表重新执行应用测试。

尚未覆盖：完整角色美术验收、桌面窗口逐项交互、sampleMotion 的真实 DLL 调用、Studio 物理实时播放、全部 Overlay 组合、独立 Studio 安装包和可选 See-through 推理环境。

技能包独立发布检查仍有 vendor 台账 TODO 与真实 Agent 行为评测未运行，状态分别保存在 [vendor 台账](../skills/live2d-studio/references/vendor-manifest.md) 和 [行为评测记录](../skills/live2d-studio/tests/behavior-evaluation.json)。它们不代表已交付的本地软件功能失效，也不应被结构校验结果替代。
