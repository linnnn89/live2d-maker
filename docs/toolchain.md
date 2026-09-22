# 工具链清单（查路径时才读本文件）

> 铁律：**不要按记忆拼路径**。同一台机常有多份工程 checkout，工具可能只在其中一份。最可靠线索是既有脚本里写死的绝对路径：
> `search_files(pattern="tools/portable|tools/python|PSD2Live", target="content", file_glob="*.py")` 先读出实际使用的解释器与导出器路径再照抄。本文以**仓库根**为基准（全部相对路径），跨 checkout 时按此法重定位。

## 运行环境

| 工具 | 位置 | 用途与要点 |
| :--- | :--- | :--- |
| 项目 Python | `python/Scripts/python.exe`（3.10） | 含 psd-tools / jpype1 / numpy / scipy / Pillow / playwright。**Hermes 沙箱解释器没有 psd_tools / scipy**：凡 PSD 读写、连通域/填洞/内插脚本，一律用 `terminal` 调它跑，不要用 `execute_code` 直接 import |
| 便携 PSD2Live | `portable/PSD2Live/` | jpype 起 JVM，classpath 取 `app/*`；由角色的 `export_*.py` 驱动，适合流水线化导出 |
| PSD2Live 源码 | `psd2live/` | Kotlin/Gradle，`run-gui.bat` 起桌面 GUI；核心实现 `src/main/kotlin/io/github/psd2live/core/{LayerClassifier,ComponentSplitter,RigBuilder}.kt` |
| MCP 代理 | `psd2live/mcp_proxy.py`、根目录 `model-mcp.ps1` / `check-mcp.ps1` | Agent 接入 PSD2Live 的通道，契约见 `psd2live/docs/zh/agent/MCP_AUTHORING.md` |
| See-through | `see-through/` | 单图拆层（3 个模型分工、低显存开关、推理依赖见其 `requirements-inference-*.txt`），用法见其 `README_datapipeline.md` |
| 渲染 harness | `live2d-viewer/` | `shot.py` / `sheet.py` / `grid.py` + `specs/*.json` + `index.html`；按参数出图、拼对比图。**仓库里别的整机截图脚本只能截 UI，不能按参数出图，别当验证手段** |
| 启动脚本 | `start-psd2live.ps1` | 一键启动桌面程序 |

## 规范文档（权威版本在 psd2live 内）

| 主题 | 路径 |
| :--- | :--- |
| PSD 图层语义/命名/侧别 | `psd2live/docs/zh/spec/PSD_LAYER_SPEC.md` |
| 变形器拓扑与参数数学 | `psd2live/docs/zh/spec/DEFORMER_AND_PARAMETER_SPEC.md` |
| `.psd2live` 工程格式 | `psd2live/docs/en/spec/PROJECT_FORMAT.md`（英文完整） |
| MCP 工具契约 | `psd2live/docs/zh/agent/MCP_AUTHORING.md` |
| Cubism SDK 配置 | `psd2live/docs/zh/guide/CUBISM_SDK_SETUP.md` |

## 常见坑

- **python/pip 版本混用**：宿主机 `python3` 是 3.14、`python` 是 3.11，与项目 `python/`（3.10）不是同一个。装包前先确认 `Scripts/python.exe --version`。
- **构建脚本可能直接覆盖已发布产物**：跑流水线脚本前先备份已发布目录（见技能包 `pb-publish-and-handoff.md`）。
- **临时文件**写 Hermes scratch 目录（`$TMPDIR`），不要写系统 `/tmp`；Windows 下原生程序传路径要用『盘符 + 冒号 + 正斜杠』形式（路径参数不做 MSYS 转换）。
