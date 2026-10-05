# PLAN：借鉴 Mesh Avatar Studio 的改进路线

> 状态：已确认，尚未实施。参考：https://github.com/shinshin86/mesh-avatar-studio
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

### P0 地基修复（2026-10-05 审计后新增，P1 的前置条件）✅ 已完成 2026-10-05
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
- 验收：本地放好 runtime 后，`shot.py` 加 `smoke-fixture.json` 能渲染出非空截图；references 中 `work/tools` 出现 0 次。✅ 实测：neutral / AngleX+30 两张出图正常，Core 6.0.1、moc v5、82 params、552 drawables；`work/tools` 0 处；`check_routing.py` 0 失败 / 0 警告。Core 哈希与 LIVE2DCHAT README 不一致，但运行时版本号一致（6.0.1），判定为文件字节差异（推测换行符），不影响使用。

### 独立轨道：发布 gate（不阻塞本计划）
HANDOFF 记录的未完成项：根 LICENSE 未定稿、vendor-manifest 有 TODO、`--release` 按设计失败、行为评测 `not_run`、嘴部阈值 `TODO(实测)`。本计划只做本地开发，不碰这些；正式发布前单独处理。P6 涉及 mouth-pipeline，实施时顺带实测嘴部阈值。

### P1 Pose QA Pack（依赖 P0）
- 新增 `live2d-viewer/specs/qa-default.json`：neutral、AngleX/Y/Z ±30、BodyAngleX ±、eye close、mouth open、eye close + mouth open、hair extrema。
- 复用 `live2d-viewer/shot.py`、`sheet.py`、`grid.py`，输出 `review/{full,eye-crops,mouth-crops,hair-crops}/`、`contact-sheet.png`、`review.json`。
- 验收：在 P0 的 fixture 上一条命令产出全部姿态和裁剪图；覆盖 `skills/live2d-studio/references/deep-live2d-render-check-harness.md` 的最低清单。

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

### P3 `authoring-rig.json` schema v0（Python）
- 仓库级独立目录：`schemas/authoring-rig/`（JSON Schema + 说明文档），以及 `tools/authoring_rig/`（Python 实现）。Skill 只调用，PSD2Live 暂不依赖。
- 每个 part 必填：
  - `id`：稳定 ID，重建或改名都不变
  - `asset`：栅格引用（相对路径）+ `sha256` + 尺寸 + offset
  - `geometry`：bbox、多边形、关键点（虹膜中心、嘴角等）
  - `z`：z-order
  - `semantic`：语义标签（对应 `LayerClassifier` 的分类）
  - `provenance`：来源（see-through / manual / vision / imagegen）、工具版本、时间、上游 hash
- 顶层：`schemaVersion`、画布尺寸、source image 的 hash。
- 工具：`export`（PSD/manifest → IR）、`build-psd`（IR → PSD）、`validate`。
- 验收：现有 PSD → IR → PSD 的 round-trip **像素 diff = 0**，图层顺序、名称、offset 一致。

### P4 stale + Overlay 兼容性
- `tools/authoring_rig/stale.py`：对 IR 字段分组计算签名，并映射到 DAG：
  `source → segmentation → IR → PSD → PSD2Live base rig → Overlay apply → moc3 → review`。
  - 改多边形或素材：PSD 及其下游 stale
  - 改 z 序：PSD 及其下游 stale
  - 只改 semantic：PSD2Live 及其下游 stale，PSD 不 stale
  - 改视图状态：不 stale
- 新增状态 **`overlay: ok | needs-review | broken`**：base rig 重建后，检查 Overlay 的每个 `RigTargetRef` 是否仍能解析、几何是否兼容（点数、拓扑）。不通过的标为 needs-review 或 broken，**不静默应用**。
- 检查逻辑在实施时对照 `RigEditOverlay.kt`、`RigIntegrityValidator.kt` 的现有校验来设计，优先复用 PSD2Live 已有能力（CLI/MCP），不在 Python 里重写。
- 验收：构造“改多边形 / 改 semantic / 改视图”三个用例，stale 结果符合预期；删除某个 target 后，Overlay 被标为 broken。

### P6 局部 mask 缺失素材生成
- source/PSD + 局部 mask + prompt → ImageGen → 严格检查 mask 外 diff → 抽出透明图层 → 写入 IR（`provenance=imagegen`）→ PSD → PSD2Live。
- 目标图层：mouth_open、tongue、teeth、eye_closed_L/R、眉毛变体、blush。
- 对接 `deep-live2d-psd2live-mouth-pipeline.md`。
- 验收：mask 外像素无变化；`ParamMouthOpenY` 取 0 / 0.5 / 1 的 contact sheet 通过。

### P5 独立 Studio 前端
- 新目录 `studio/`：Vite + TypeScript + React。**不改** `live2d-viewer/index.html` 的定位。
- `live2d-viewer` 及其 `window.viewer` API 保持不变，继续作为稳定的 headless QA renderer；Studio 通过 iframe 或模块嵌入的方式调用它。
- 三栏布局：左边 Parts（来自 IR）| 中间原图叠加可拖拽的多边形和关键点 | 右边 Cubism 实时预览 + 参数滑块。
- 编辑只写 IR；显示 P4 的 stale 和 Overlay 状态；按钮包括“Rebuild”和“Run Pose QA”（调用 P1）。
- 验收：拖动一个点 → IR 更新 → stale 正确 → 重建 → 右侧 moc3 刷新 → Pose QA 产出新的 contact sheet。

## 2. 已定决策
- **P5 调用方式**：CLI 是唯一的调用契约。浏览器本身不能执行命令，所以由 Vite dev server 中间件（`studio/vite.config.ts` 中的插件）接收请求，再 spawn `tools/authoring_rig` 等 CLI。
  - 中间件只做转发，不放业务逻辑；不新建独立的后端服务。
  - CLI 统一约定：输出 JSON 到 stdout、非 0 退出码表示失败，供 Studio、Skill/Agent、手工调用共用。
  - 只监听 127.0.0.1，命令走白名单，参数不拼接成 shell 字符串。
