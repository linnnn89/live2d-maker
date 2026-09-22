# L3 深度参考索引（按需取一篇）

> 取用纪律：**按需取一篇**，取完即用。本文件只回答“需要什么资料、去哪取”。
> 宿主差异见 [host-adapter.md](host-adapter.md)；工具与外部协作能力见
> [ref-toolchain.md](ref-toolchain.md) / [ref-skill-map.md](ref-skill-map.md)。

## 取用方式

本包深参考与脚本均随 `live2d-studio` 安装：

- 文档：`skill_view(name="live2d-studio", file_path="references/deep-….md")`
- 脚本：`skill_view(name="live2d-studio", file_path="scripts/….py")`；需要执行时复制到 Hermes scratch，再用项目 Python 运行。
- 仓库工具契约：使用 `read_file` 读取 `psd2live/docs/…` 等仓内相对路径。

## Live2D / PSD2Live 深度配方

| 主题 | 包内参考 |
| :--- | :--- |
| 原单体技能的完整工作流与硬规则 | [deep-live2d-workflow.md](deep-live2d-workflow.md) |
| 语义标签、别名、tag→变形器绑定、像素差探针 | [deep-live2d-psd2live-semantics.md](deep-live2d-psd2live-semantics.md) |
| 眼三层重切、前后发切分、素材落位 | [deep-live2d-eye-hair-recipes.md](deep-live2d-eye-hair-recipes.md) |
| 嘴部双层、0.48 汇聚线、layerOverrides 交叉淡入 | [deep-live2d-psd2live-mouth-pipeline.md](deep-live2d-psd2live-mouth-pipeline.md) |
| 参数化渲染 harness | [deep-live2d-render-check-harness.md](deep-live2d-render-check-harness.md) |
| 模型正常但宿主显示错 | [deep-live2d-runtime-render-check.md](deep-live2d-runtime-render-check.md) |
| Live2D 参考图配准与差量量化 | [deep-live2d-reference-alignment.md](deep-live2d-reference-alignment.md) |
| 单图拆层工具 See-through | [deep-live2d-layer-decomposition-tools.md](deep-live2d-layer-decomposition-tools.md) |
| Cubism 2.1 原版基准渲染 | [deep-live2d-original-21-render-harness.md](deep-live2d-original-21-render-harness.md) |

## 通用参考对齐补充

| 主题 | 包内参考 |
| :--- | :--- |
| 原参考对齐技能的完整工作流与红线 | [deep-alignment-workflow.md](deep-alignment-workflow.md) |
| 地标配准、指标选取、渲染定标 | [deep-alignment-registration-and-metrics.md](deep-alignment-registration-and-metrics.md) |
| 新素材换装、局部长度、逐行轮廓形变 | [deep-alignment-asset-swap-fitting.md](deep-alignment-asset-swap-fitting.md) |

## 随包脚本

| 脚本 | 用途 |
| :--- | :--- |
| `scripts/check_psd2live_tags.py` | 导出后审计 tag/side/物理绑定 |
| `scripts/register_art.py` | 参考图轮廓配准与叠图 |
| `scripts/hairline_probe.py` | 发际线、刘海下沿逐列探针 |
| `scripts/iris_landmark_register.py` | 用虹膜地标配准裁切/缩放参考图 |

## 仓库规范与契约

| 主题 | 仓内相对路径 |
| :--- | :--- |
| PSD 图层语义/命名/侧别 | `psd2live/docs/zh/spec/PSD_LAYER_SPEC.md` |
| 变形器拓扑与参数数学 | `psd2live/docs/zh/spec/DEFORMER_AND_PARAMETER_SPEC.md` |
| `.psd2live` 工程格式 | `psd2live/docs/en/spec/PROJECT_FORMAT.md` |
| MCP 工具契约 | `psd2live/docs/zh/agent/MCP_AUTHORING.md` |
| Cubism SDK 配置 | `psd2live/docs/zh/guide/CUBISM_SDK_SETUP.md` |
| 工具链与路径重定位 | 仓库 `docs/toolchain.md` |
| 外部协作技能注册表 | 仓库 `docs/skill-map.md` |
