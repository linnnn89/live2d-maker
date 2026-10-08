# 工具与代码入口

下表路径均相对于当前仓库根目录。安装步骤与版本集中在 [environment.md](environment.md)，依赖来源与哈希见 [dependencies](../dependencies/README.md)。

## 工具入口

| 工具 | 入口 | 用途 |
|---|---|---|
| Python CLI | `python/Scripts/python.exe -m tools.authoring_rig` | PSD/IR 转换、素材导入、重建与检查 |
| Studio | `studio/`，`npm run dev` | 浏览器编辑器；调用仓库 Python CLI |
| 桌面程序 | `portable/PSD2Live/PSD2Live.exe` | 上游 PSD2Live 便携应用 |
| 源码构建 | `build-psd2live.bat [任务]` | 使用项目内 JDK/Gradle；默认任务为 `jar` |
| viewer | `live2d-viewer/shot.py`、`qa.py`、`sheet.py`、`grid.py` | 按参数和镜位渲染、生成联系表 |
| See-through | `see-through/` | 可选单图拆层；推理环境独立安装 |
| MCP 代理 | `psd2live/mcp_proxy.py` | 连接 PSD2Live 的 MCP 接口 |
| Windows MCP 诊断 | `check-mcp.ps1 [-TimeoutSeconds 10]` | 检查本仓环境、地址与真实代理握手；返回退出码 |
| Windows MCP 调用 | `model-mcp.ps1` | 从 Java Preferences 读取本机凭据后调用本地 MCP |

`start-psd2live.ps1` 启动便携桌面应用并等待端口 23871。`check-mcp.ps1` 从脚本所在仓库解析项目 Python 和 Proxy，不依赖当前工作目录，也不自动启动应用。它通过 `scripts/check_mcp.py` 完成 initialize、initialized 与 tools/list，超时后结束本次 Proxy；凭据读取复用代理，输出不包含 Token。退出码 0 表示握手通过，1 表示离线/握手失败/超时，2 表示本仓环境或配置不完整。默认地址为 `http://127.0.0.1:23871/mcp`；可使用现有 `PSD2LIVE_MCP_ENDPOINT`、`PSD2LIVE_MCP_TOKEN` 进程环境配置。MCP 配置以 [MCP 文档](../psd2live/docs/zh/agent/MCP_AUTHORING.md) 为准。

## 应用与资源选择

Python 原生桥接使用 `portable/PSD2Live/runtime/` 的 JVM 和 `app/` 的依赖 JAR。未指定应用时，优先使用 `dependencies/native/psd2live-0.7.1.jar`；`--native-jar` 可显式选择应用 JAR。Studio 另会优先使用 `psd2live/build/libs/psd2live-0.7.1.jar`。

`dependencies/native/cubism-runtime.jar` 提供 DLL、22 个着色器和许可。安装器把它加入 portable 启动器的 classpath；Python CLI 直接加载，Gradle 构建把资源嵌入应用 JAR。便携桌面应用与本仓扩展应用不是同一个 JAR，排查功能差异时先确认实际加载的文件。

Overlay baseline 包含完整运行时哈希。切换应用或资源后，不复用旧 baseline，应从同一运行时重新建立。

## 代码和格式文档

| 内容 | 位置 |
|---|---|
| 图层分类、分割、绑定 | `psd2live/src/main/kotlin/io/github/psd2live/core/` |
| Studio 工作区与导入 | `tools/authoring_rig/studio.py`、`generated.py` |
| 原生重放与失效判断 | `tools/authoring_rig/native.py`、`stale.py` |
| IR / PNG 清单契约 | [schemas/authoring-rig/README.md](../schemas/authoring-rig/README.md) |
| PSD 图层命名 | [PSD_LAYER_SPEC.md](../psd2live/docs/zh/spec/PSD_LAYER_SPEC.md) |
| 变形器与参数 | [DEFORMER_AND_PARAMETER_SPEC.md](../psd2live/docs/zh/spec/DEFORMER_AND_PARAMETER_SPEC.md) |
| PSD2Live 工程格式 | [PROJECT_FORMAT.md](../psd2live/docs/en/spec/PROJECT_FORMAT.md) |
| 原生 SDK 配置 | [CUBISM_SDK_SETUP.md](../psd2live/docs/zh/guide/CUBISM_SDK_SETUP.md) |

## 换工作目录时

先确认 Git 根目录，再检查安装脚本、`native.py` 和 `studio/vite.config.ts` 从哪里解析工具路径。运行 PSD 脚本时显式使用当前仓库的 Python，不照抄其他工程的绝对路径，也不依赖宿主默认解释器的包。

临时资源使用系统临时目录或仓库被忽略的 `out/` 子目录。Windows 原生程序接收实际文件系统路径，不使用浏览器 URL。验证模型效果应按固定参数和镜位渲染；整机截图只用于界面检查。
